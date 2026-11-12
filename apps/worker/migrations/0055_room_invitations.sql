-- Only a digest is kept: the administrator receives the room link once.
CREATE TABLE room_invitations (
  room_id TEXT PRIMARY KEY REFERENCES rooms(id) ON DELETE CASCADE,
  token_digest TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);

-- A link must not come back to life when a public room is made private again.
CREATE TRIGGER revoke_invitation_on_privacy_change AFTER UPDATE OF kind ON rooms
WHEN OLD.kind <> NEW.kind
BEGIN
  DELETE FROM room_invitations WHERE room_id = NEW.id;
END;

-- Someone removed from a private room cannot rejoin with a link they kept.
CREATE TRIGGER revoke_invitation_on_member_removal AFTER DELETE ON memberships
WHEN EXISTS (SELECT 1 FROM rooms WHERE id = OLD.room_id AND kind = 'closed')
BEGIN
  DELETE FROM room_invitations WHERE room_id = OLD.room_id;
END;
