import type { RoomInvitation, SharedRoom } from "@ember/protocol";
import { beforeEach, describe, expect, it } from "vitest";
import { api, connect, createRoom, freshDeploy, signIn, workspaceSql, type Session } from "./support";

beforeEach(freshDeploy);
const administrator = async () => {
  const session = await signIn("Mark");
  await workspaceSql("UPDATE users SET role = 1 WHERE id = ?", session.user.id);
  return session;
};
const invitePath = (id: string) => `/api/rooms/${id}/invitations`;
const as = (s: Session, method = "GET", body?: unknown) => ({ method, headers: { Cookie: s.cookie }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const issue = async (id: string, s: Session) => {
  const r = await api(invitePath(id), as(s, "POST"));
  expect(r.status).toBe(201);
  expect(r.headers.get("Cache-Control")).toBe("no-store");
  const { url } = await r.json() as RoomInvitation;
  expect(url).toMatch(new RegExp(`/rooms/${id}#invite=[\\w-]{43}$`));
  return new URL(url).hash.slice(8);
};
const accept = (id: string, s: Session, token: string) => api(invitePath(id) + "/accept", as(s, "POST", { token }));

describe("Admin-issued private-room invitations", () => {
  it("keeps content, sockets and sidebar unavailable until an invited member joins", async () => {
    const [admin, member] = [await administrator(), await signIn("Reader")];
    const room = await createRoom("Private", { as: admin, closedTo: [admin.user.id] });
    const token = await issue(room.id, admin);
    const sidebar = await (await api("/api/sidebar", as(member))).json() as { rooms: SharedRoom[] };
    expect(sidebar.rooms.some((r) => r.id === room.id)).toBe(false);
    expect((await api(`/api/rooms/${room.id}/settings`, as(member))).status).toBe(404);
    const response = await accept(room.id, member, token);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ room });
    const socket = await connect(room.id, member);
    socket.ws.close(1000);
    expect((await api(`/api/rooms/${room.id}/settings`, as(member))).status).toBe(200);
    expect((await accept(room.id, member, token)).status).toBe(200);
    const saved = await workspaceSql("SELECT token_digest FROM room_invitations WHERE room_id = ?", room.id);
    expect(JSON.stringify(saved)).not.toContain(token);
    expect(JSON.stringify(await (await api(invitePath(room.id), as(admin))).json())).not.toContain(token);
  });

  it("only lets admins issue, inspect or revoke links, even when the member is in the room", async () => {
    const [admin, member] = [await administrator(), await signIn("Reader")];
    const room = await createRoom("Private", { as: admin, closedTo: [admin.user.id, member.user.id] });
    for (const method of ["GET", "POST", "DELETE"]) expect((await api(invitePath(room.id), as(member, method))).status).toBe(403);
    expect((await api(invitePath(room.id), { method: "POST" })).status).toBe(401);
    expect((await api(invitePath(room.id) + "/accept", { method: "POST", body: JSON.stringify({ token: "x".repeat(43) }) })).status).toBe(401);
  });

  it("rejects invented, malformed and wrong-room tokens without granting access", async () => {
    const [admin, member] = [await administrator(), await signIn("Reader")];
    const room = await createRoom("Private", { as: admin, closedTo: [admin.user.id] });
    const other = await createRoom("Other", { as: admin, closedTo: [admin.user.id] });
    const token = await issue(room.id, admin);
    for (const value of ["", "x".repeat(43), "../" + token]) expect((await accept(room.id, member, value)).status).toBe(404);
    expect((await accept(other.id, member, token)).status).toBe(404);
    expect((await api(invitePath(room.id) + "/accept", as(member, "GET"))).status).not.toBe(200);
    expect(await workspaceSql("SELECT * FROM memberships WHERE room_id = ? AND user_id = ?", room.id, member.user.id)).toEqual([]);
  });

  it("replaces and revokes links without removing people who already joined", async () => {
    const [admin, member, next] = [await administrator(), await signIn("Reader"), await signIn("Next")];
    const room = await createRoom("Private", { as: admin, closedTo: [admin.user.id] });
    const first = await issue(room.id, admin);
    const second = await issue(room.id, admin);
    expect((await accept(room.id, member, first)).status).toBe(404);
    expect((await accept(room.id, member, second)).status).toBe(200);
    expect((await api(invitePath(room.id), as(admin, "DELETE"))).status).toBe(200);
    expect((await accept(room.id, next, second)).status).toBe(404);
    expect((await api(`/api/rooms/${room.id}/settings`, as(member))).status).toBe(200);
  });

  it("invalidates links across public/private changes and when a member is removed", async () => {
    const [admin, member] = [await administrator(), await signIn("Reader")];
    const room = await createRoom("Private", { as: admin, closedTo: [admin.user.id] });
    const token = await issue(room.id, admin);
    const change = (body: unknown) => api(`/api/rooms/${room.id}`, as(admin, "PATCH", body));
    expect((await change({ kind: "open" })).status).toBe(200);
    expect((await change({ kind: "closed", memberIds: [admin.user.id] })).status).toBe(200);
    expect((await accept(room.id, member, token)).status).toBe(404);
    const current = await issue(room.id, admin);
    expect((await accept(room.id, member, current)).status).toBe(200);
    expect((await change({ kind: "closed", memberIds: [admin.user.id] })).status).toBe(200);
    expect((await accept(room.id, member, current)).status).toBe(404);
  });

  it("stops links working when their issuer ceases to be an active admin", async () => {
    const [admin, member] = [await administrator(), await signIn("Reader")];
    const room = await createRoom("Private", { as: admin, closedTo: [admin.user.id] });
    const token = await issue(room.id, admin);
    await workspaceSql("UPDATE users SET role = 0 WHERE id = ?", admin.user.id);
    expect((await accept(room.id, member, token)).status).toBe(404);
  });

  it("rejects links on public rooms and cross-site requests", async () => {
    const admin = await administrator();
    const room = await createRoom("Public", { as: admin });
    expect((await api(invitePath(room.id), as(admin, "POST"))).status).toBe(404);
    expect((await api(invitePath(room.id), { method: "POST", headers: { Cookie: admin.cookie, "Sec-Fetch-Site": "cross-site", Origin: "https://other.test" } })).status).toBe(422);
  });

  it("prevents members from bypassing admin-controlled private access", async () => {
    const [admin, member] = [await administrator(), await signIn("Reader")];
    const room = await createRoom("Public", { as: member });
    const change = await api(`/api/rooms/${room.id}`, as(member, "PATCH", { kind: "closed", memberIds: [member.user.id] }));
    expect(change.status).toBe(403);
    const created = await api("/api/rooms", as(member, "POST", { kind: "closed", name: "Private", memberIds: [member.user.id, admin.user.id] }));
    expect(created.status).toBe(403);
  });
});
