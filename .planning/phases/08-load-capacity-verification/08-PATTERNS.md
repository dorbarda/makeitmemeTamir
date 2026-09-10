# Phase 8: Load & Capacity Verification - Pattern Map

**Mapped:** 2026-09-10
**Files analyzed:** 1 new file (load-test script) + supporting fixture reuse
**Analogs found:** 1 exact match (multi-client join loop + full-round flow), reused directly

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `server/test/load.integration.test.ts` (or `server/scripts/loadTest.ts`, per planner's choice of vitest-test vs. standalone-script framing) | test (load/capacity) | event-driven (Socket.IO real-time, many concurrent clients) | `server/test/capacity.integration.test.ts` (join-loop at scale) + `server/test/fullLoop.integration.test.ts` (multi-client full-round flow) | exact (join-loop) / exact (round flow) |

Only one new file is implied by CONTEXT.md — a scripted load test proving 12+
simultaneous players can complete a full round. No other files need
creation/modification; `server/src/config.ts` is read-only reference, not a
target of change (ROOM_CAPACITY=20, MIN_PLAYERS_TO_START=3 already support
12 players structurally, per CONTEXT.md's Established Patterns note).

Recommendation: **put this in `server/test/` as a vitest integration test**
(`server/test/load.integration.test.ts`), following the exact same
`describe/it` + `startTestServer`/`connectClient`/`waitFor` harness as every
other `*.integration.test.ts` file, rather than inventing a standalone CLI
script. This matches D-01 (target-agnostic base URL — trivially extracted
into a `baseUrl` param later) and requires zero new tooling, consistent with
CONTEXT.md's Claude's Discretion note preferring "the least new tooling."

## Pattern Assignments

### `server/test/load.integration.test.ts` (test, event-driven)

**Analog 1 — many-client join loop:** `server/test/capacity.integration.test.ts`

**Imports pattern** (lines 1-10):
```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  type LobbySnapshot,
  type ProtocolError,
  type SessionIssued,
} from "@shared/protocol.js";
import { startTestServer, connectClient, waitFor, type TestServer } from "./setup.js";
import { ROOM_CAPACITY } from "../src/config.js";
```
For the load test, also import `fakeMeme` from `./fixtures/meme.js` (needed
for caption submission — see Analog 2 below).

**Server lifecycle pattern** (lines 12-21, identical across every
integration test file):
```typescript
describe("...", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer();
  });

  afterAll(async () => {
    await server.close();
  });
```
`startTestServer()` (from `server/test/setup.ts` lines 11-40) spins up a
real in-process HTTP+Socket.IO server on an ephemeral port (`httpServer.listen(0, ...)`)
and returns `{ url, io, roomManager, close }`. This is the correct mechanism
for D-01's "server instance started locally inside the build sandbox" — no
`npm run start` + separate process needed; the existing harness already
gives a real, locally-bound server reachable at `server.url` (`http://localhost:<port>`).

**Many-client connect + join loop** (lines 30-37 of capacity test — the
literal pattern for spinning up 12 players):
```typescript
const host = await connectClient(server.url);
const hostState = waitFor<LobbySnapshot>(host, SERVER_EVENTS.state);
host.emit(CLIENT_EVENTS.createRoom, { name: "מארח" });
const hostSnapshot = await hostState;
const roomCode = hostSnapshot.roomCode;

const joiners = [];
for (let i = 1; i < N; i++) {
  const client = await connectClient(server.url);
  const state = waitFor<LobbySnapshot>(client, SERVER_EVENTS.state);
  client.emit(CLIENT_EVENTS.joinRoom, { roomCode, name: `שחקן${i}` });
  await state;
  joiners.push(client);
}
```
For 12 players: `host` + a loop from `i = 1` to `11` (11 joiners) = 12 total.
`connectClient` (setup.ts lines 42-66) uses `transports: ["websocket"]`,
`reconnection: false`, `forceNew: true` — copy this exactly, it's what makes
each simulated client a genuinely independent real socket rather than a
shared/reused connection.

**Test timeout note:** `capacity.integration.test.ts`'s own 20-player join
loop uses an explicit `it(..., async () => {...}, 20000)` — a raised timeout
as the third `it()` argument — because vitest's default 5s timeout is too
short for N sequential real-socket connects. The 12-player + full round load
test will need an even higher explicit timeout (round trip of connect →
write → reveal → rate for 12 clients); budget generously (e.g. `60000`) per
Analog 2's default-timing full-round duration below.

---

**Analog 2 — full round played to completion over real sockets, with
`waitForPhase`/`waitForRatingStep` helpers:** `server/test/fullLoop.integration.test.ts`
and `server/test/hostActions.integration.test.ts` (both define identical
copies of these helpers — copy verbatim, they are the established
convention, not each file inventing its own).

**Phase-wait helper** (`fullLoop.integration.test.ts` lines 30-43,
identical in `hostActions.integration.test.ts` lines 84-97):
```typescript
function waitForPhase(
  socket: Awaited<ReturnType<typeof connectClient>>,
  phase: LobbySnapshot["phase"],
): Promise<LobbySnapshot> {
  return new Promise((resolve) => {
    const onState = (snapshot: LobbySnapshot) => {
      if (snapshot.phase === phase) {
        socket.off(SERVER_EVENTS.state, onState);
        resolve(snapshot);
      }
    };
    socket.on(SERVER_EVENTS.state, onState);
  });
}
```

**Rating-step-wait helper** (`fullLoop.integration.test.ts` lines 51-64) —
**required**, not optional: a bare `waitForPhase(socket, "RATING")` will
false-resolve on the same still-open step's own broadcast echo after a
rating submission. Must wait for the specific step index:
```typescript
function waitForRatingStep(
  socket: Awaited<ReturnType<typeof connectClient>>,
  index: number,
): Promise<LobbySnapshot> {
  return new Promise((resolve) => {
    const onState = (snapshot: LobbySnapshot) => {
      if (snapshot.phase === "RATING" && snapshot.ratingStep?.index === index) {
        socket.off(SERVER_EVENTS.state, onState);
        resolve(snapshot);
      }
    };
    socket.on(SERVER_EVENTS.state, onState);
  });
}
```

**Caption submission** (protocol event + fixture, e.g.
`hostActions.integration.test.ts` line 145):
```typescript
host.emit(CLIENT_EVENTS.submitCaption, { meme: fakeMeme("host") });
```
`fakeMeme(marker)` (`server/test/fixtures/meme.ts` lines 10-12) produces a
validly base64-shaped placeholder that clears `Room.submitCaption`'s
non-empty/base64/size checks without needing a real rasterized PNG — use
this for all 12 players' caption submissions rather than real image data
(irrelevant to load/capacity proof, and avoids `MEME_MAX_BASE64_CHARS`
payload-size complexity in the test itself).

**Rating submission across many players** (`ratingStep.integration.test.ts`
lines 130-136, generalizes directly to a loop over N players):
```typescript
room.submitRating(players[1].id, 0, 2);
room.submitRating(players[2].id, 0, 3);
// ... one call per eligible (non-author) connected player
```
Over real sockets (not bare-Room), this becomes
`playerSocket.emit(CLIENT_EVENTS.submitRating, { stepIndex, value })` per
eligible rater — see `ratingStep.integration.test.ts` lines 344-363 for the
socket-emit form:
```typescript
raterSocket.emit(CLIENT_EVENTS.submitRating, { stepIndex: currentStepIndex, value: 2 });
```
**Author exclusion is load-bearing**: `hostActions.integration.test.ts`
lines 152-159 shows the established pattern for finding "whoever authored
this step" from `ratingStep.youAreAuthor` / matching player name, since the
author of a given rating step must never submit a rating for their own meme
(`CANNOT_RATE_OWN`). For 12 players, the load test's rating loop must skip
whichever player is `step.ratingStep.youAreAuthor` for each step.

**Fast-forwarding through timing without fake timers:** because this suite
uses real sockets (fake timers would also freeze Socket.IO's own ping/pong,
breaking the connection — noted explicitly in `fullLoop.integration.test.ts`
lines 13-18 and `ratingStep.integration.test.ts`), the established shortcut
is **test-only internal seeding of `room.settings`** directly via
`server.roomManager.findRoom(roomCode)`, bypassing the protocol layer, to
shrink `writingSeconds`/`ratingSeconds`/`rounds` so the suite fits inside a
reasonable timeout — see `hostActions.integration.test.ts` lines 134-138 and
`fullLoop.integration.test.ts`'s own comment (lines 96-100):
```typescript
const room = server.roomManager.findRoom(roomCode);
if (!room) throw new Error("room not found for internal seeding");
room.settings.rounds = 1;
room.settings.writingSeconds = 0.2; // if testing the early-finish/collapse path is NOT the goal, instead set generously and have every player actually submit before the deadline — see note below
```
**Caution for the load test specifically:** unlike the other integration
tests (which intentionally shrink deadlines to exercise collapse/timeout
paths), the load test's actual goal is proving 12 real concurrent
submissions complete correctly *before* any deadline — so prefer having
every one of the 12 players actually emit `submitCaption`/`submitRating`
and awaiting the natural early-finish collapse (`WRITING_COLLAPSE_MS` /
`RATING_COLLAPSE_MS` from `config.ts`) rather than racing a shortened
deadline. Shrinking `writingSeconds`/`ratingSeconds` to something small but
nonzero (e.g. `2`/`1`) is still reasonable as a safety net so the suite
doesn't hang if one simulated client's emit is lost, but the pass condition
should be "all 12 submitted and phase advanced" not "deadline expired."

**Cleanup pattern** (every test file, e.g.
`hostActions.integration.test.ts` lines 187-189): explicitly `.close()`
every client socket at the end of each `it()` — for 12 players, loop over
the joiners array plus host: `[host, ...joiners].forEach((s) => s.close())`.

---

## Shared Patterns

### Real in-process server startup
**Source:** `server/test/setup.ts` lines 11-40 (`startTestServer`)
**Apply to:** the load test's single `describe` block — one `beforeAll`/`afterAll` pair, same as every other integration test file.

### Client connection
**Source:** `server/test/setup.ts` lines 42-66 (`connectClient`)
**Apply to:** all 12 simulated player connections — `transports: ["websocket"]`, `reconnection: false`, `forceNew: true` per client.

### Event-wait helper
**Source:** `server/test/setup.ts` lines 68-83 (`waitFor<T>`)
**Apply to:** any single-event wait (session issuance, generic state snapshot, error) not covered by the phase/step-specific helpers above.

### Latency/threshold measurement (no existing analog — new territory)
No existing test in `server/test/` measures wall-clock latency or asserts a
performance threshold; all existing tests assert on protocol correctness
only. CONTEXT.md's Claude's Discretion explicitly leaves "a concrete,
checkable number" for "no noticeable slowdown" to the planner. Recommended
concrete approach consistent with existing style: wrap each of the 12
`submitCaption`/`submitRating` emits with `Date.now()` before/after its
corresponding `waitFor`/state-echo resolution, collect into an array, and
assert e.g. `Math.max(...latencies) < 2000` (ms) — pick a number the planner
documents explicitly rather than leaving unstated, per CONTEXT.md.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| Latency/threshold assertion helper | utility (test) | transform | No existing test measures timing; see "Latency/threshold measurement" above — planner should design fresh but keep it inline in the new test file rather than a new shared utility, consistent with this codebase's convention of self-contained test files. |

## Metadata

**Analog search scope:** `server/test/*.integration.test.ts` (20 files), `server/test/setup.ts`, `server/test/fixtures/meme.ts`, `server/src/config.ts`
**Files scanned:** capacity.integration.test.ts, hostActions.integration.test.ts, fullLoop.integration.test.ts, neverStalls.integration.test.ts, ratingStep.integration.test.ts, setup.ts, fixtures/meme.ts, config.ts
**Pattern extraction date:** 2026-09-10
