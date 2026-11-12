import { useState } from "react";
import type { RoomId, SharedRoom } from "@ember/protocol";
import { MainContent } from "@/components/main-content";
import { Button } from "@/components/ui/button";
import { navigate, roomPath } from "@/hooks/use-route";
import { useTitle } from "@/hooks/use-title";
import { acceptRoomInvitation, ApiError } from "@/lib/api";
import { PageHeader } from "./page-header";

export function RoomAccessDenied() {
  useTitle("Private room");
  return (
    <>
      <PageHeader />
      <MainContent className="grid min-h-0 min-w-0 place-content-center bg-background p-6 text-center">
        <p role="alert" className="text-muted-foreground">request an invite from Mark.</p>
      </MainContent>
    </>
  );
}

/** The fragment stays out of requests and referrers; joining sends it only in a same-origin POST. */
export function RoomInviteAcceptance({ roomId, token, onAccepted, onFailed }: {
  roomId: RoomId; token: string; onAccepted: (room: SharedRoom) => void; onFailed: (error: unknown) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState(!/^[\w-]{43}$/.test(token));
  const join = async () => {
    setBusy(true);
    try {
      const room = await acceptRoomInvitation(roomId, token);
      onAccepted(room);
      navigate(roomPath(roomId), { replace: true });
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) setRefused(true);
      else onFailed(error);
      setBusy(false);
    }
  };
  if (refused) return <RoomAccessDenied />;
  return (
    <>
      <PageHeader />
      <MainContent className="grid min-h-0 min-w-0 place-content-center justify-items-center gap-4 bg-background p-6 text-center">
        <h1 className="text-xl font-bold">Private room invitation</h1>
        <Button type="button" disabled={busy} onClick={join}>{busy ? "Joining…" : "Join private room"}</Button>
      </MainContent>
    </>
  );
}
