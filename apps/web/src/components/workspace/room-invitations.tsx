import { useEffect, useState } from "react";
import type { RoomId } from "@ember/protocol";
import { Button } from "@/components/ui/button";
import { createRoomInvitation, fetchRoomInvitation, revokeRoomInvitation } from "@/lib/api";
import { Panel } from "./settings-page";

/** An invitation is shown only to the administrator who made it, never fetched back from storage. */
export function RoomInvitations({ roomId, onFailed }: { roomId: RoomId; onFailed: (error: unknown) => void }) {
  const [active, setActive] = useState<boolean | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let current = true;
    fetchRoomInvitation(roomId).then((answer) => current && setActive(answer.active), (error) => current && onFailed(error));
    return () => { current = false; };
  }, [roomId, onFailed]);

  const issue = async () => {
    setBusy(true);
    try {
      const invite = await createRoomInvitation(roomId);
      setUrl(invite.url);
      setActive(true);
      setCopied(false);
    } catch (error) { onFailed(error); }
    finally { setBusy(false); }
  };
  const revoke = async () => {
    setBusy(true);
    try {
      await revokeRoomInvitation(roomId);
      setUrl("");
      setActive(false);
      setCopied(false);
    } catch (error) { onFailed(error); }
    finally { setBusy(false); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); }
    catch (error) { onFailed(error); }
  };
  return (
    <Panel>
      <h2 className="text-xl font-bold">Private room invite</h2>
      <p className="my-3 text-sm text-muted-foreground">Only admins can create room invites. People must join Ember first, then open this link to join this room.</p>
      <p className="my-3 text-sm text-muted-foreground">Anyone with this link and an Ember account can join. Replacing or revoking the link stops future joins; current members keep access. Removing a member also revokes the current link.</p>
      {url && (
        <label className="my-3 flex flex-col gap-2 text-sm">
          Room invite link
          <input aria-label="Room invite link" value={url} readOnly className="min-h-11 rounded-[9px] border bg-background px-3 text-base" />
        </label>
      )}
      <div className="flex flex-wrap gap-3">
        <Button type="button" disabled={busy || active === null} onClick={issue}>{active ? "Replace invite link" : "Create invite link"}</Button>
        {url && <Button type="button" variant="outline" onClick={copy}>{copied ? "Copied" : "Copy invite link"}</Button>}
        {active && <Button type="button" variant="outline" disabled={busy} onClick={revoke}>Revoke invite link</Button>}
      </div>
      <p role="status" className="mt-3 text-sm text-muted-foreground">{active === null ? "Checking room invite…" : active ? "A room invite link is active." : "No room invite link is active."}</p>
    </Panel>
  );
}
