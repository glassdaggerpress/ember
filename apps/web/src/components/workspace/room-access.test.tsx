import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Sheet } from "@/components/ui/sheet";
import { RoomAccessDenied, RoomInviteAcceptance } from "./room-access";
import { RoomInvitations } from "./room-invitations";
import { openRoomSocketAhead } from "@/hooks/use-room";

vi.mock("@/hooks/use-room", () => ({ openRoomSocketAhead: vi.fn(() => () => {}) }));

afterEach(() => vi.restoreAllMocks());
const token = "a".repeat(43);
const room = { id: "secret", kind: "closed", name: "Private project", icon: null };
const show = (component: React.ReactNode) => render(<Sheet>{component}</Sheet>);

describe("Private room access", () => {
  it("shows only the requested message, without a room name, messages or composer", () => {
    show(<RoomAccessDenied />);
    expect(screen.getByRole("alert").textContent).toBe("request an invite from Mark.");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(document.title).toBe("Private room");
  });

  it("only redeems the fragment when Join is pressed, then removes it from the address", async () => {
    history.replaceState(null, "", `/rooms/secret#invite=${token}`);
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ room }));
    const onAccepted = vi.fn();
    show(<RoomInviteAcceptance roomId="secret" token={token} onAccepted={onAccepted} onFailed={vi.fn()} />);
    expect(request).not.toHaveBeenCalled();
    expect(openRoomSocketAhead).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Join private room" }));
    expect(request).toHaveBeenCalledWith("/api/rooms/secret/invitations/accept", expect.objectContaining({ method: "POST", body: JSON.stringify({ token }) }));
    await waitFor(() => expect(onAccepted).toHaveBeenCalledWith(room));
    expect(location.hash).toBe("");
    expect(openRoomSocketAhead).toHaveBeenCalledWith("/rooms/secret");
  });

  it("shows the same blank denied screen for a revoked invite", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ error: "Room not found or inaccessible" }, { status: 404 }));
    show(<RoomInviteAcceptance roomId="secret" token={token} onAccepted={vi.fn()} onFailed={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Join private room" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("request an invite from Mark.");
    expect(screen.queryByRole("button", { name: "Join private room" })).not.toBeInTheDocument();
  });

  it("does not send malformed invite fragments to the server", () => {
    const request = vi.spyOn(globalThis, "fetch");
    show(<RoomInviteAcceptance roomId="secret" token="invalid" onAccepted={vi.fn()} onFailed={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("request an invite from Mark.");
    expect(request).not.toHaveBeenCalled();
  });

  it("lets an admin create and revoke a link without removing existing members", async () => {
    const url = `https://ember.test/rooms/secret#invite=${token}`;
    const request = vi.spyOn(globalThis, "fetch").mockImplementation(async (_path, init) => {
      if (init?.method === "POST") return Response.json({ url }, { status: 201 });
      return Response.json({ active: false });
    });
    show(<RoomInvitations roomId="secret" onFailed={vi.fn()} />);
    const create = await screen.findByRole("button", { name: "Create invite link" });
    await waitFor(() => expect(create).toBeEnabled());
    await userEvent.click(create);
    expect(await screen.findByRole("textbox", { name: "Room invite link" })).toHaveValue(url);
    await userEvent.click(screen.getByRole("button", { name: "Revoke invite link" }));
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "Room invite link" })).not.toBeInTheDocument());
    expect(request).toHaveBeenCalledWith("/api/rooms/secret/invitations", expect.objectContaining({ method: "DELETE" }));
    expect(screen.getByRole("status")).toHaveTextContent("No room invite link is active.");
  });
});
