# Room privacy and admin invitations

New rooms and existing room settings have a **Room privacy** selector. Public
means everyone in this Ember workspace; it does not make messages available to
the public web. Private means only the room's members. Administrators manage
privacy and private-room membership. Room creators who are not administrators
can still rename their rooms, but cannot change their privacy or grant access.

To make a room private, select **Private**, keep the intended existing members
selected, and save. Current members keep access unless removed. In its settings,
**Private room invite → Create invite link** creates an admin-issued link.
Invitees first need a workspace account. After signing in, they open the room
link and press **Join private room**. The room then appears in their sidebar.
The workspace's existing invitation link and membership settings are unchanged.

Only administrators can issue, replace, inspect the status of, or revoke room
invites. Links are bearer invitations: anyone with the link and a valid account
in this workspace can use one. There is one active link per room, until replaced
or revoked. Revocation stops future joins, while current members retain access.
Changing Public/Private, removing a member, or losing the issuer's active admin
role invalidates an old link. These changes are checked on the server.

The secret is 32 random bytes, carried in a URL fragment so page requests and
referrers do not contain it. Joining explicitly POSTs it to a same-origin API.
Storage holds only a domain-separated HMAC under the existing session secret.
An admin receives the full link once; it cannot be read back from the database.
The additive workspace migration is `0055_room_invitations.sql`; it works on
Durable Object SQLite and D1. Privacy and membership changes use the existing
socket-revocation, search and file authorization paths.

A person without room access sees a blank room area with exactly:

> request an invite from Mark.

The page does not reveal the room name, history, threads, presence, or composer.
The same screen replaces a previously open room immediately when access ends.
Nonmembers' sidebars and search results continue to exclude private rooms.
