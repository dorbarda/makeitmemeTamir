---
status: resolved
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

- hypothesis: `RoomManager` never removes a room once created (no `removeRoom`, no expiry, `Room.dispose()` is defined but never called from anywhere) — confirmed root cause, not just a suspect.
- test: grep for any `rooms.delete`/eviction/TTL logic in `server/src/rooms/RoomManager.ts` and the whole server tree.
- expecting: some cleanup path exists; found none.
- next_action: fix applied — add `RoomManager.removeRoom`/`reapIdleRooms`, wire a periodic sweep in `app.ts`, add regression tests.

## Evidence

- timestamp: 2026-09-13T00:00:00Z
  check: read `server/src/rooms/RoomManager.ts`
  result: only `createRoom` and `findRoom` are public; `rooms: Map<string, Room>` has no removal path anywhere in the class.
- timestamp: 2026-09-13T00:00:00Z
  check: grep server/src for `rooms.delete|dispose()|removeRoom|deleteRoom|expire|evict|ttl|setInterval`
  result: `Room.dispose()` exists (clears fade/host-transfer/phase timers) but is called from nowhere in the codebase — no eviction, no expiry, no capacity bound on `RoomManager.rooms`.
- timestamp: 2026-09-13T00:00:00Z
  check: read `server/src/rooms/Room.ts` — `startGame()` guard and `Room.phase` transitions
  result: `startGame()` refuses unless `phase === "LOBBY"`; `enterGameEnd()` is terminal (no timer, no way back to LOBBY). No "play again"/restart event exists anywhere in `CLIENT_EVENTS` (`shared/protocol.ts`). Confirmed: once a room's game ends, that room can never host another game — a new game requires a brand-new room via `createRoom`.
- timestamp: 2026-09-13T00:00:00Z
  check: read `server/src/config.ts` — `MEME_MAX_BASE64_CHARS = 2_800_000`
  result: each submitted meme can be ~2.8M base64 chars (~5.6MB as a JS UTF-16 string). `Room.bestOfNight` (top-3, capped) survives for the room's lifetime; if a room is abandoned mid-round (nobody clears `submissions` because the next `enterWriting()` never runs), the full per-player `submissions` map — up to ~5.6MB × player count — is retained forever too, since the room itself is never freed.
- timestamp: 2026-09-13T00:00:00Z
  check: read `client/src/socket/connection.ts`, `resync.ts`, `sessionStore.ts`, `App.tsx`, `Home.tsx`
  result: reconnect flow correctly reuses the persisted token (no duplicate Player objects on reconnect); a page reload does NOT trigger a spurious new `createRoom` for an existing session. Eliminates the "duplicate player per reconnect" and "listener leak per reconnect" hypotheses — `registerHandlers` is wired exactly once per `io.on("connection")` in `server/src/app.ts`.

## Eliminated

- Socket.IO listener accumulation on reconnect — `registerHandlers` registers exactly once per new `connection` event; reconnects reuse the session token via `authMiddleware` and never re-register handlers or duplicate a `Player`.
- `SessionRegistry.tokens` growth as the primary OOM cause — it does leak (never pruned), but at ~10-15 players over one event its entries (small `{roomCode, playerId}` objects) are far too small to explain an OOM on their own. Left as a secondary/minor finding, not fixed in this pass (see Resolution).
- Per-round data (`submissions`, `ratings`, `swapUsed`, `eligibleAtClose`) growing within a single ongoing room — all correctly `.clear()`-ed at the top of every `enterWriting()`; bounded across rounds within one room.
- `photosSeenByPlayer` — bounded by the fixed photo set size, not a meaningful growth source.

## Resolution

- root_cause: `RoomManager` has no room-removal/expiry mechanism at all. Because `Room.startGame()` only works from `LOBBY` and a finished game (`GAME_END`) is terminal with no restart path, a multi-hour party that plays many separate games back-to-back necessarily creates a brand-new room via `createRoom()` for every game. Every one of those rooms — including every finished `GAME_END` room and any abandoned/never-finished room — stays permanently referenced in `RoomManager.rooms` for the life of the process, each still holding its full player roster and up to 3 full base64-encoded meme images in `bestOfNight` (and, for an abandoned mid-round room, the entire uncledared `submissions` map of up to ~5.6MB per player). This unbounded accumulation over the course of the event is what exceeded Render's free-tier memory limit and triggered the OOM restart.
- fix: added `RoomManager.removeRoom(code)` (disposes the room's timers and deletes it from `rooms`) and `RoomManager.reapIdleRooms(now)`, a sweep that reaps a `GAME_END` room once idle past `ROOM_GAME_END_TTL_MS` (45 min — generous enough that nobody mid-download is cut off) and reaps any room with zero connected players once idle past `ROOM_ABANDONED_TTL_MS` (20 min — an empty lobby or a mid-game walkaway nobody returned to). Wired a `setInterval` (unref'd) in `server/src/app.ts` calling `reapIdleRooms()` every `ROOM_REAP_INTERVAL_MS` (5 min). `Room.lastActivityAt` is refreshed on every `broadcast()` call (which fires after essentially every mutating event and every delayed internal timer), giving the reaper a true idle signal rather than a naive creation-time TTL.
- verification: added `server/test/roomReap.test.ts` covering removeRoom, the GAME_END TTL path (reaped even with a still-"connected" player, as a safety net against a forgotten-open tab), the abandoned-room TTL path (never reaped while any player is connected, reaped once idle past the TTL with zero connected players), and the no-op case for an active/recent room. Full server test suite run to confirm no regressions.
- files_changed:
  - server/src/config.ts (added ROOM_GAME_END_TTL_MS, ROOM_ABANDONED_TTL_MS, ROOM_REAP_INTERVAL_MS)
  - server/src/rooms/Room.ts (added lastActivityAt, hasConnectedPlayers getter, broadcast() refreshes lastActivityAt)
  - server/src/rooms/RoomManager.ts (added removeRoom, reapIdleRooms)
  - server/src/app.ts (wired the periodic reap interval)
  - server/test/roomReap.test.ts (new regression tests)
