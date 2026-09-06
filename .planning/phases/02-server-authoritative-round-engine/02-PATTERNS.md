# Phase 2: Server-Authoritative Round Engine - Pattern Map

**Mapped:** 2026-09-06
**Files analyzed:** 9 (new/modified)
**Analogs found:** 9 / 9

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `server/src/rooms/Room.ts` (extend) | model | event-driven + CRUD | itself (Phase 1 timer/state methods) | exact |
| `server/src/rooms/roundTimers.ts` (new, likely name) | utility/timer | event-driven | `Room.ts` `fadeTimers`/`hostTransferTimer` private methods | exact |
| `server/src/config.ts` (extend) | config | — | itself (existing constants block) | exact |
| `shared/protocol.ts` (extend) | model/types | request-response | itself (`RoomPhase`, `LobbySnapshot`, `CLIENT_EVENTS`, `SERVER_EVENTS`) | exact |
| `shared/messages.ts` (extend) | config (i18n strings) | — | itself (`HEBREW_UI`, `HEBREW_ERRORS`) | exact |
| `server/src/socket/handlers.ts` (extend) | controller | request-response | itself (existing handler registration pattern) | exact |
| `server/test/roundEngine.integration.test.ts` (new) | test | event-driven/timer | `server/test/rosterFade.integration.test.ts`, `server/test/hostTransfer.integration.test.ts` | exact |
| `server/test/startGame*.test.ts` / settings validation test (new) | test | request-response | `server/test/canStart.test.ts` | exact |
| `client/src/state/gameStore.ts` (no change expected — snapshot shape grows, store logic doesn't) | store | event-driven | itself | exact |
| `client/src/screens/Lobby.tsx` (extend with settings panel) | component | request-response | itself (existing rename-form pattern) | role-match |
| New round-screen component(s) (e.g. `client/src/screens/Writing.tsx`, `Rating.tsx`) | component | request-response | `client/src/screens/Lobby.tsx` | role-match |

## Pattern Assignments

### `server/src/rooms/Room.ts` (model, event-driven)

**Analog:** itself — Phase 1's delayed-timer pattern (`fadeTimers` / `hostTransferTimer`) is the exact template for the round clock. **This is the single most important pattern in the whole phase.**

**The delayed-timer + clear + dispose pattern** (lines 45-47, 177-208, 242-248):
```typescript
private fadeTimers = new Map<string, ReturnType<typeof setTimeout>>();
private hostTransferTimer: ReturnType<typeof setTimeout> | null = null;

private scheduleFade(playerId: string): void {
  this.clearFadeTimer(playerId);
  const timer = setTimeout(() => {
    this.fadeTimers.delete(playerId);
    this.players.delete(playerId);
    this.onStateChanged?.();
  }, ROSTER_FADE_GRACE_MS);
  this.fadeTimers.set(playerId, timer);
}

private clearFadeTimer(playerId: string): void {
  const timer = this.fadeTimers.get(playerId);
  if (timer) {
    clearTimeout(timer);
    this.fadeTimers.delete(playerId);
  }
}

private scheduleHostTransfer(): void {
  this.clearHostTransferTimer();
  this.hostTransferTimer = setTimeout(() => {
    this.hostTransferTimer = null;
    this.transferHost();
  }, HOST_TRANSFER_GRACE_MS);
}

dispose(): void {
  for (const timer of this.fadeTimers.values()) {
    clearTimeout(timer);
  }
  this.fadeTimers.clear();
  this.clearHostTransferTimer();
}
```
**Apply directly to the round timer:** a single `private roundTimer: ReturnType<typeof setTimeout> | null` (or a small map if multiple concurrent timers are ever needed — unlikely, since only one phase is ever "live"), a `scheduleX`/`clearX` pair, and a mandatory registration inside `dispose()`. The round timer's callback must, like `scheduleFade`, mutate state first and then call `this.onStateChanged?.()` — never call `broadcast(io)` directly from `Room` (`Room` has no hard dependency on `Server`).

**The `onStateChanged` wiring contract** (lines 33-43, and `Room` constructor never sets it):
```typescript
onStateChanged?: () => void;
```
This is set exactly once, in `handlers.ts`, right after room creation (see below) — `Room` itself never imports `Server`. The round engine must reuse this same single callback, not add a second one; when a round-timer fires and needs a broadcast, call `this.onStateChanged?.()` exactly as `scheduleFade`'s callback does.

**Fail-closed, never-throw outcome pattern** (lines 18-21, 108-132, `RenameOutcome`):
```typescript
export type RenameOutcome =
  | { ok: true; name: string }
  | { ok: false; error: "NAME_LOCKED" | "NAME_REQUIRED" };
```
Apply the same shape to a `startGame()` / `submitCaption()` / `submitRating()` outcome type — a discriminated union with `ok: true | false`, never a thrown exception. Every new Room method that can be rejected by a client-side race (e.g., submitting after the writing phase already closed) must return one of these, not throw.

**No-client-supplied-authority pattern** (lines 210-222, `transferHost()` signature):
```typescript
// Takes no arguments — there is no parameter a client-controlled caller
// could use to name a successor; the only input is the room's own state.
transferHost(): void { ... }
```
Apply identically to whatever method advances the round phase (e.g. `Room` computes the next phase itself from its own player/submission map — never accepts a "next phase" or "winner" argument from a socket handler).

**`snapshotFor(playerId)` personalization pattern** (lines 250-272):
```typescript
snapshotFor(playerId: string): LobbySnapshot {
  const players: PlayerView[] = [...this.players.values()].map((p) => ({ ... }));
  const readyCount = players.filter((p) => p.connected).length;
  return {
    phase: this.phase,
    roomCode: this.code,
    // ...
    you: { id: playerId, isHost: playerId === this.hostId },
  };
}
```
The round snapshot fields (current sub-phase, absolute deadline, submission progress, current meme index, "you are barred from rating this meme") all get computed inside this same method, keyed off the `playerId` argument — this is precisely how D-14 (no other player's caption leaks) gets enforced: the per-player view is built here, not filtered client-side.

**Broadcast pattern** (lines 279-286) — reused unchanged; no new broadcast mechanism needed.

---

### `server/src/config.ts` (config)

**Analog:** itself — the existing constants block and its comment convention.

**Convention to follow** (lines 1-9, 42-43):
```typescript
export const ROOM_CAPACITY = 20; // D-05
export const MIN_PLAYERS_TO_START = 3; // D-11
// ...
export const ROSTER_FADE_GRACE_MS = DEAD_SOCKET_WINDOW_MS + 12_000; // 30s
export const HOST_TRANSFER_GRACE_MS = ROSTER_FADE_GRACE_MS * 2; // 60s
```
Every new constant cites its decision ID inline (`// D-01`, `// D-02`, `// D-07`, `// D-11`) and any derived constant is expressed as arithmetic on a base constant, not an independently chosen literal. Apply this to:
- `ROUND_OPTIONS = [3, 5, 7]` / `DEFAULT_ROUNDS = 3` (D-02, D-04)
- `WRITING_SECONDS_OPTIONS = [45, 60, 90]` / `DEFAULT_WRITING_SECONDS = 60` (D-02, D-04)
- `RATING_SECONDS_OPTIONS = [8, 10, 15]` / `DEFAULT_RATING_SECONDS = 10` (D-02, D-04)
- `WRITING_COLLAPSE_MS = 3_000` (D-07), `RATING_COLLAPSE_MS = 2_000` (D-07)
- `BETWEEN_MEMES_MS = 2_000`, `BETWEEN_PHASES_MS = 3_000` (D-11)
- `MIN_SUBMISSIONS_TO_RATE = 2` (D-09)

---

### `shared/protocol.ts` (model/types)

**Analog:** itself.

**Existing shape to extend** (lines 1-47):
```typescript
export type RoomPhase = "LOBBY" | "IN_GAME";

export type LobbySnapshot = {
  phase: RoomPhase;
  roomCode: string;
  joinUrl: string;
  qrDataUrl: string;
  players: PlayerView[];
  readyCount: number;
  capacity: number;
  canStart: boolean;
  you: { id: string; isHost: boolean };
};

export const CLIENT_EVENTS = {
  createRoom: "create-room",
  joinRoom: "join-room",
  rejoin: "rejoin",
  rename: "rename",
  requestResync: "request-resync",
} as const;

export const SERVER_EVENTS = {
  session: "session",
  state: "state",
  error: "error",
} as const;
```
Follow the same style exactly: `RoomPhase` grows (e.g. `"LOBBY" | "WRITING" | "RATING" | "ROUND_END" | "GAME_END"`, per Claude's Discretion in CONTEXT.md), the snapshot type grows with new optional/required fields (deadline timestamp per D-12, submission progress per D-13, current meme index, settings), and any new client intent (start-game, change-settings, submit-caption, submit-rating) is added as one more key to `CLIENT_EVENTS` with an inline comment describing its payload shape — matching `createRoom: "create-room", // { name: string }`. New error codes extend the `ErrorCode` union (line 25-31) and must get a matching entry in `HEBREW_ERRORS` (never optional — it's a `Record<ErrorCode, string>`, so TypeScript enforces this pairing).

---

### `shared/messages.ts` (config / i18n)

**Analog:** itself (lines 1-40).

**Convention:** every Hebrew string used in a round-phase screen (progress count "X מתוך Y", countdown labels, phase headings, settings panel labels) is added to `HEBREW_UI`, grouped with a `// plan 02-0X — ...` comment matching the existing `// plan 01-03 — ...` / `// plan 01-04 — ...` grouping style seen at lines 24, 29, 36. Never write a literal Hebrew string inline in a component or handler.

---

### `server/src/socket/handlers.ts` (controller, request-response)

**Analog:** itself — the existing handler-registration pattern.

**Room-creation timer wiring** (lines 65-71) — the exact place any new server-owned timer's broadcast gets hooked up:
```typescript
const room = await roomManager.createRoom(origin);
room.onStateChanged = () => room.broadcast(io);
```
No second wiring point is needed — the round timer reuses this same `onStateChanged` callback already assigned here.

**Standard handler shape** (lines 124-144, `rename` handler — the best analog for a new intent that mutates room state and can fail):
```typescript
socket.on(CLIENT_EVENTS.rename, ({ name }: { name: string }) => {
  if (!data.playerId || !data.roomCode) {
    emitError(socket, { code: "NOT_IN_ROOM", messageHe: HEBREW_ERRORS.NOT_IN_ROOM });
    return;
  }
  const room = roomManager.findRoom(data.roomCode);
  if (!room) {
    emitError(socket, { code: "ROOM_NOT_FOUND", messageHe: HEBREW_ERRORS.ROOM_NOT_FOUND });
    return;
  }
  const result = room.renamePlayer(data.playerId, preparedName);
  if (!result.ok) {
    emitError(socket, { code: result.error, messageHe: HEBREW_ERRORS[result.error] });
    return;
  }
  room.broadcast(io);
});
```
Apply this exact shape to `start-game`, `change-settings`, `submit-caption`, `submit-rating`: look up `playerId`/`roomCode` from `socket.data`, fail closed with `emitError` on any missing binding, delegate the actual mutation + validation to a `Room` method that returns a typed outcome (never trust client-sent settings values — validate against the exact preset arrays from `config.ts` server-side, per Claude's Discretion in CONTEXT.md), then `room.broadcast(io)` on success. Every handler here calls `room.broadcast(io)` itself after a successful mutation — timers call `onStateChanged?.()` instead, since they have no `socket`/`io` in scope.

**`emitError` helper** (lines 16-18) — reused unchanged for every new failure path.

---

### `server/test/roundEngine.integration.test.ts` (test, timer-driven)

**Analog:** `server/test/rosterFade.integration.test.ts` and `server/test/hostTransfer.integration.test.ts` — these are explicitly named in CONTEXT.md as "the model for testing the round clock."

**Fake-timer harness pattern** (rosterFade lines 1-16):
```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Room } from "../src/rooms/Room.js";
import { ROSTER_FADE_GRACE_MS } from "../src/config.js";

describe("...", () => {
  let room: Room;
  beforeEach(() => {
    vi.useFakeTimers();
    room = new Room("1234", "http://x/join/1234", "data:image/png;base64,");
  });
  afterEach(() => {
    room.dispose();
    vi.useRealTimers();
  });
  // ...
});
```
This bare-`Room`-with-fake-timers style (no live socket server, `room.onStateChanged` set to a `vi.fn()` spy to assert broadcast timing — see rosterFade lines 120-130) is the correct model for round-phase-advance-on-timeout tests: assert phase before/at/after the deadline with `vi.advanceTimersByTime`, assert `dispose()` prevents late firing, assert `onStateChanged` fires exactly once per real transition. Use `vi.advanceTimersByTime(DEADLINE - 1)` / `+1` boundary pattern throughout (rosterFade lines 29-33) to prove exact-edge behavior, not just "eventually."

**hostTransfer's `phase = "IN_GAME"` isolation comment** (lines 11-18) is a useful pattern too: set up the specific room phase state explicitly at the top of each test to isolate the mechanism under test from unrelated Phase 1 timers (fade/host-transfer) that could otherwise fire and confound assertions.

---

### `server/test/startGame.test.ts` / settings validation (test, request-response)

**Analog:** `server/test/canStart.test.ts` — full-stack integration test using the real socket transport, for testing behavior that depends on client/server round-trip (e.g., host clicking "start" with fewer than `MIN_PLAYERS_TO_START`, or a non-preset settings value being rejected).

**Full-server integration pattern** (lines 1-39):
```typescript
import { startTestServer, connectClient, waitFor, type TestServer } from "./setup.js";
// beforeAll: server = await startTestServer();
// afterAll: await server.close();
const clientA = await connectClient(server.url);
const stateA1 = waitFor<LobbySnapshot>(clientA, SERVER_EVENTS.state);
clientA.emit(CLIENT_EVENTS.createRoom, { name: "..." });
const snapshotA1 = await stateA1;
```
Use `server/test/setup.ts`'s `startTestServer` / `connectClient` / `waitFor` helpers unchanged — this is the established, only integration-test harness in the repo; do not build a second one.

---

### `client/src/screens/Lobby.tsx` (component, request-response) — settings panel addition

**Analog:** itself — the existing rename-form request/response round-trip (lines 32-56) is the template for the host settings panel's "tap a preset, wait for the next snapshot to confirm" flow:
```typescript
function handleRename(e: React.FormEvent) {
  e.preventDefault();
  const socket = getSocket();
  const onError = (err: ProtocolError) => { setRenameError(HEBREW_ERRORS[err.code]); cleanup(); };
  const onState = () => { cleanup(); };
  function cleanup() {
    socket.off(SERVER_EVENTS.error, onError);
    socket.off(SERVER_EVENTS.state, onState);
  }
  socket.once(SERVER_EVENTS.error, onError);
  socket.once(SERVER_EVENTS.state, onState);
  socket.emit(CLIENT_EVENTS.rename, { name: renameValue });
}
```
Apply the identical once-listener/cleanup pattern to a `change-settings` emit (one tap = one preset button = one emit, no local optimistic mutation — wait for the next `state` snapshot, exactly per "the server is the sole authority; the client renders what it is told"). The `snapshot.phase === "LOBBY"` conditional-render gate (line 113) is the template for showing the settings panel only pre-game and read-only settings display for non-hosts (D-01, D-03) — gate on `snapshot.you.isHost` the same way `isHost` is already threaded through the snapshot today (though currently unused for UI per the comment at lines 76-79 — this phase is the first consumer of `isHost` for a UI decision).

---

## Shared Patterns

### Server-owned delayed timer with dispose safety
**Source:** `server/src/rooms/Room.ts` lines 45-47, 177-208, 242-248 (`fadeTimers`/`hostTransferTimer`/`dispose()`)
**Apply to:** the new round-phase timer(s) on `Room`. Non-negotiable per CONTEXT.md: "The round timer must follow exactly this pattern, including registration in `dispose()`."

### Fail-closed typed outcome, never throw
**Source:** `server/src/rooms/Room.ts` lines 18-21 (`RenameOutcome`), lines 108-132 (`renamePlayer`)
**Apply to:** every new `Room` mutation method that a client intent can trigger at an invalid time (start-game before 3 players, submit-caption after writing closed, submit-rating twice, rate-own-meme).

### No client-supplied authority
**Source:** `server/src/rooms/Room.ts` lines 210-222 (`transferHost()` takes no args)
**Apply to:** whatever method advances `Room`'s round phase — computed entirely from the room's own internal state, never parameterized by anything a socket handler passes through from client input.

### Personalized full-snapshot, never a diff
**Source:** `server/src/rooms/Room.ts` lines 250-286 (`snapshotFor`/`broadcast`)
**Apply to:** the expanded round snapshot — D-12's absolute deadline and D-14's no-leaked-captions rule both ride on this existing mechanism for free; do not introduce any parallel per-event payload path.

### Standard socket handler shape (auth check -> room lookup -> delegate to Room -> broadcast)
**Source:** `server/src/socket/handlers.ts` lines 124-144 (`rename`), `emitError` at lines 16-18
**Apply to:** every new handler (`startGame`, `changeSettings`, `submitCaption`, `submitRating`).

### Centralized Hebrew strings, decision-cited config constants
**Source:** `shared/messages.ts` (whole file), `server/src/config.ts` lines 1-9, 42-43
**Apply to:** every new user-facing string and every new tunable numeric constant this phase introduces.

### Fake-timer integration test harness for timer-driven state transitions
**Source:** `server/test/rosterFade.integration.test.ts`, `server/test/hostTransfer.integration.test.ts`
**Apply to:** all round-clock advancement tests (writing timeout, early-finish collapse, rating timeout, per-meme advance, round advance, game end).

## No Analog Found

None — Phase 1's Room/timer/snapshot/handler/test-harness architecture directly covers every role and data-flow this phase needs. The one genuinely new piece of client UI (writing-phase screen, rating-step screen, settings panel) has no direct prior screen to copy pixel-for-pixel, but `Lobby.tsx`'s request/response and conditional-render patterns are a strong role-match starting point, not a gap.

## Metadata

**Analog search scope:** `server/src/`, `server/test/`, `shared/`, `client/src/`
**Files scanned:** `server/src/rooms/Room.ts`, `server/src/rooms/RoomManager.ts`, `server/src/socket/handlers.ts`, `server/src/config.ts`, `shared/protocol.ts`, `shared/messages.ts`, `server/test/rosterFade.integration.test.ts`, `server/test/hostTransfer.integration.test.ts`, `server/test/canStart.test.ts`, `server/test/setup.ts`, `client/src/state/gameStore.ts`, `client/src/socket/resync.ts`, `client/src/screens/Lobby.tsx`
**Pattern extraction date:** 2026-09-06
