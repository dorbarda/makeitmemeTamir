---
status: investigating
trigger: "Render Web Service makeitmemeTamir exceeded its memory limit during the actual bachelor party, triggering an automatic restart that made the game unavailable mid-play."
created: 2026-09-13
updated: 2026-09-13
---

## Symptoms

- **Expected behavior**: Server (Node/Express/Socket.IO, in-memory room state, Render free-tier single instance) should run stably through one evening of a single room with ~10-15 players across multiple rounds without growing memory unbounded.
- **Actual behavior**: Render sent an "exceeded memory limit" alert; the instance was automatically restarted, which dropped all in-memory game state (rooms, players, scores, current round) mid-game per this project's documented in-memory-only architecture. This happened during the live party, not in testing.
- **Error messages**: Render platform notification only ("Web Service makeitmemeTamir exceeded its memory limit" / automatic restart). No application-level stack trace supplied by the user.
- **Timeline**: Happened once, during the actual event (2026-09-12 night). Not previously observed/tested under real multi-player load before the event as far as is known.
- **Reproduction**: Not yet reproduced locally. Suspected trigger is real gameplay over time: many players joining/reconnecting/disconnecting across multiple rounds, possibly combined with image/meme data held in memory.

## Likely suspect areas (from user report, unconfirmed hypotheses — verify against code, do not assume)

- `server/src/players/SessionRegistry.ts` and `server/src/rooms/RoomManager.ts` / `Room.ts`: rooms, players, or sessions never removed on disconnect/game end, so repeated joins/rejoins/reconnects accumulate objects across the night.
- `server/src/socket/handlers.ts`: Socket.IO event listeners registered per-connection but not cleaned up on disconnect/reconnect, accumulating listeners over many reconnect cycles.
- Meme image/caption data (composited images, captions, votes) retained per round/per room without being cleared after a round or after the room ends.
- Reconnect flow (per architecture docs, client stores a session token and calls an explicit `rejoin`) possibly creating a new Player/session object per reconnect instead of reusing/replacing the existing one for that player.

## Current Focus

- hypothesis: (to be set by debugger)
- test: (to be set by debugger)
- expecting: (to be set by debugger)
- next_action: gather initial evidence — read RoomManager, Room, SessionRegistry, and socket handlers to map object/listener lifecycle (creation vs. cleanup) for rooms, players, sessions, and per-round data

## Evidence

## Eliminated

## Resolution

- root_cause:
- fix:
- verification:
- files_changed:
