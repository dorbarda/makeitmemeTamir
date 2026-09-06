---
phase: 01-room-session-reconnect-foundation
plan: 04
subsystem: rooms
tags: [socket.io, reconnect, timers, vitest-fake-timers, hebrew, rtl]

# Dependency graph
requires:
  - phase: 01-room-session-reconnect-foundation (plan 01)
    provides: >
      shared/protocol.ts wire contract, server RoomManager/Room/SessionRegistry,
      the create/join/rejoin/resync handlers, the client socket connection and
      session store, and the "instant reconnect" real-phone measurement this
      plan's grace-constant reasoning depends on
  - phase: 01-room-session-reconnect-foundation (plan 02)
    provides: shared/messages.ts (HEBREW_UI/HEBREW_ERRORS) this plan extends
  - phase: 01-room-session-reconnect-foundation (plan 03)
    provides: the Lobby screen and roster presentation this plan's fade/host-transfer state feeds
provides:
  - server/src/config.ts's DEAD_SOCKET_WINDOW_MS/ROSTER_FADE_GRACE_MS/HOST_TRANSFER_GRACE_MS,
    a single derivation chain for both grace delays
  - Room's per-player fade-removal timers (D-13), permanent IN_GAME retention (D-17),
    and automatic deterministic host transfer (D-16), all via Room.onStateChanged
    rather than a hard socket.io dependency inside Room itself
  - Room.dispose() clearing every pending timer on teardown
  - A safe rejoin path for a token the server never issued (fresh session,
    never an error, never attaches to an existing player — T-01-17)
  - client/src/socket/resync.ts's three converging reconnect triggers
    (connect, visibilitychange->visible, pageshow persisted) and a
    subscribable `connected` flag in connection.ts
  - A Hebrew reconnecting overlay in App.tsx that never unmounts the current
    screen (D-14)
affects: [phase-2-round-engine, phase-6-host-controls]

actuals:
  tokens: 11200
  tasks: 3
  commits: 5

tech-stack:
  added: []
  patterns:
    - "Room never imports socket.io's Server type for its own timer logic — an optional onStateChanged callback lets the one caller with `io` in scope (handlers.ts's create-room handler) wire a real broadcast, while rosterFade/hostTransfer tests exercise a bare Room with fake timers and no live socket server at all"
    - "joinedAt is a monotonic per-room join sequence, not Date.now() — avoids coupling host-succession ordering to a clock that vitest's fake timers also control"
    - "Both grace delays derive from one DEAD_SOCKET_WINDOW_MS constant (RESEARCH.md Pitfall 2) so a player can never fade from the roster before the same disconnect would have started the host-transfer countdown"
    - "The three reconnect triggers (connect/visibilitychange/pageshow) all funnel through one of two server intents (rejoin or request-resync) — none of them trusts socket.recovered or the client's own connected flag as ground truth"

key-files:
  created:
    - client/src/socket/resync.ts
    - client/src/socket/resync.test.ts
    - server/test/rosterFade.integration.test.ts
    - server/test/hostTransfer.integration.test.ts
    - server/test/reconnect.integration.test.ts
    - server/test/reconnectUnknownToken.integration.test.ts
  modified:
    - shared/messages.ts
    - server/src/config.ts
    - server/src/players/Player.ts
    - server/src/rooms/Room.ts
    - server/src/socket/handlers.ts
    - client/src/socket/connection.ts
    - client/src/App.tsx
    - client/src/screens/Lobby.tsx
    - client/src/index.css

key-decisions:
  - "Kept ROSTER_FADE_GRACE_MS=30s / HOST_TRANSFER_GRACE_MS=60s rather than shortening them off the back of plan 01-01's 'instant reconnect' measurement — that evidence proves the RETURN side needs no protection (a returning player never flickers regardless of grace length, since resync is effectively immediate), it says nothing about how long OTHER players should tolerantly wait before a vanished player reads as gone, which is bounded below by the ~18s dead-socket detection window, not informed either way by how fast a return resync is. See server/src/config.ts's inline reasoning and 'Grace-delay constants' below."
  - "onStateChanged callback instead of storing an `io: Server` reference on Room — keeps Room's timer logic importable and testable with zero socket.io server dependency; RoomManager.ts was left untouched (not in this plan's files_modified list) by wiring the callback in handlers.ts's create-room handler instead, the one place `io` is already in scope"
  - "joinedAt implemented as a monotonic per-room counter, not Date.now() — Date is one of the things vitest's fake timers control, so two players added within the same fake-timer tick would otherwise tie and make host-succession order untestable"
  - "Host-transfer scheduling is NOT phase-gated (fires in both LOBBY and IN_GAME) while roster-fade removal IS LOBBY-only — a dead host is a problem whether or not the game has started (D-16), but D-17's permanent retention only applies once play begins"
  - "rejoin with an unrecognised token now replies with a fresh, unbound session instead of a silently-swallowed NOT_IN_ROOM error nobody was listening for — this was a coordinated fix across the whole rejoin path (T-01-17), landed in Task 3's commit even though handlers.ts wasn't in Task 3's own files_modified list, because the reconnectUnknownToken test Task 3 explicitly calls for cannot pass without it"
  - "Lobby.tsx's pre-existing inline '(מנותק/ת)' literal (introduced in plan 01-03, before this plan's disconnected/reconnected vocabulary existed) was routed through a new HEBREW_UI.disconnectedTag key while this plan was already touching Lobby.tsx and adding reconnecting/hostChanged strings alongside it — consistency cleanup, not new scope"

patterns-established:
  - "Delayed internal Room state changes (a fade removal, a host transfer) notify their caller through an optional callback rather than Room holding a live socket.io Server reference, keeping Room a plain, fully unit-testable class"
  - "Grace-delay and other live-tunable timing constants live in one config.ts derivation chain, never as two independently chosen numbers for related behaviors"

requirements-completed: [LIVE-02, LOBBY-05]

coverage:
  - id: D1
    description: "Grace-delayed roster fade: a disconnected LOBBY player stays present and connected:false through ROSTER_FADE_GRACE_MS, is removed exactly once if the grace elapses without a reconnect, and a reconnect at any point before that cancels the removal outright rather than letting it fire late (D-13)"
    requirement: "LOBBY-05"
    verification:
      - kind: integration
        ref: "server/test/rosterFade.integration.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "A disconnect once phase is IN_GAME is never removed and keeps its score/roster position forever (D-17); a disconnect-reconnect-disconnect sequence restarts the grace from the second disconnect, not the first; readyCount and player count stay truthful (never double-counted) throughout"
    verification:
      - kind: integration
        ref: "server/test/rosterFade.integration.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Room.dispose() clears every pending fade/host-transfer timer so a callback scheduled before teardown can never fire against a room that no longer exists"
    verification:
      - kind: integration
        ref: "server/test/rosterFade.integration.test.ts, server/test/hostTransfer.integration.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "Automatic host transfer: hostId is unchanged until HOST_TRANSFER_GRACE_MS elapses, then moves to the earliest-joined connected player, leaving exactly one host; a timely return cancels the transfer and keeps host; a late return becomes an ordinary player never a second host; no throw when no successor exists; the transfer tolerates the host already having been removed by the shorter roster-fade grace (D-16)"
    requirement: "LIVE-02"
    verification:
      - kind: integration
        ref: "server/test/hostTransfer.integration.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "transferHost() takes no arguments and reads only room.players — no code path can set hostId from client-supplied data (T-01-18)"
    verification:
      - kind: integration
        ref: "server/test/hostTransfer.integration.test.ts"
        status: pass
    human_judgment: false
  - id: D6
    description: "reconnect.integration.test.ts pins the already-working known-token LIVE-02 reconnect (same playerId, name, score, unchanged player count) as its own standalone regression, independent of plan 01-01's longer tracer"
    requirement: "LIVE-02"
    verification:
      - kind: integration
        ref: "server/test/reconnect.integration.test.ts"
        status: pass
    human_judgment: false
  - id: D7
    description: "A rejoin carrying a token the server never issued gets a fresh, unbound session (not an error), never attaches to an existing player, and does not crash the handler or leave it wedged for a subsequent intent (T-01-17)"
    verification:
      - kind: integration
        ref: "server/test/reconnectUnknownToken.integration.test.ts"
        status: pass
    human_judgment: false
  - id: D8
    description: "installResyncTriggers wires exactly three sources (socket connect -> unconditional rejoin; visibilitychange->visible -> request-resync; pageshow persisted:true -> request-resync), none dependent on socket.recovered, and returns a teardown removing every listener"
    requirement: "LIVE-02"
    verification:
      - kind: unit
        ref: "client/src/socket/resync.test.ts"
        status: pass
    human_judgment: false
  - id: D9
    description: "The Hebrew reconnecting indicator overlays (never unmounts) the current screen while the socket is not connected, and disappears without any tap once the connection returns (D-14); nothing in the reconnect cycle writes a form value, draft, or roster copy to storage (D-15)"
    verification:
      - kind: unit
        ref: "npm --prefix client run build"
        status: pass
    human_judgment: true
    rationale: "Whether the overlay genuinely reads as 'over, not instead of' the current screen on a real phone, and whether a returning player truly lands with zero taps, can only be confirmed visually on a device. Not run in this sandboxed session — no phone access. Deferred to end-of-phase UAT, consistent with plans 01-02/01-03's precedent for their own real-device human-checks."
  - id: D10
    description: "On a real iPhone and Android, locking the screen for 10/30/45/90 seconds and toggling WiFi/host-off produces roster-fade and host-transfer behavior matching (or correcting) the configured grace delays; force-quitting and reopening returns the same identity"
    verification: []
    human_judgment: true
    rationale: "This plan's own Task 3 <human-check> is the phase's stated exit criterion and explicitly requires real iPhone/Android hardware with a stopwatch — not reproducible in this sandboxed environment, which has no physical phones. The grace constants were instead set through the reasoned analysis in 'Grace-delay constants' below, using the one piece of real evidence available (01-01's 'instant reconnect' measurement) plus the configured ~18s dead-socket detection window. Logged to .planning/WINDOWS.md as an open unrun-verify entry so it stays visible at ship time."

duration: 35min
completed: 2026-09-06
status: complete
---

# Phase 1 Plan 4: Grace-Delayed Reconnect, Host Transfer, and Client Resync Triggers Summary

**Per-player roster-fade timers derived from one dead-socket-detection constant, deterministic automatic host transfer that survives the fade racing it, three converging client resync triggers that never trust `socket.recovered`, and a non-blocking Hebrew reconnecting overlay — all covered by Vitest fake-timer tests against a bare `Room` with zero socket.io dependency.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-09-06 (session start)
- **Completed:** 2026-09-06T10:34:32Z
- **Tasks:** 3
- **Files modified:** 15 (6 created, 9 modified)

## Accomplishments

- `server/src/config.ts` gains `DEAD_SOCKET_WINDOW_MS` (18s, = `PING_INTERVAL_MS + PING_TIMEOUT_MS`), `ROSTER_FADE_GRACE_MS` (30s), and `HOST_TRANSFER_GRACE_MS` (60s) — both grace delays derive from the one detection window, never two independently chosen numbers (D-13/D-16, RESEARCH.md Pitfall 2).
- `Room` gains a per-player fade-removal timer: a LOBBY disconnect schedules removal after `ROSTER_FADE_GRACE_MS`, a reconnect at any point before that cancels it outright, and a disconnect-reconnect-disconnect sequence restarts the clock from the second disconnect rather than letting the first fire late (D-13). An IN_GAME disconnect schedules nothing at all and the player's record and score survive forever (D-17).
- `Room` gains deterministic automatic host transfer: the current host disconnecting (in either phase) schedules a transfer after `HOST_TRANSFER_GRACE_MS`; the earliest-joined connected player (via a new monotonic `Player.joinedAt` sequence, not `Date.now()`) is promoted if the grace elapses; a timely return cancels the transfer; a late return comes back as an ordinary player, never a second host (D-16). `transferHost()` tolerates the old host having already been removed by the shorter roster-fade grace and takes no arguments at all, so no code path can set `hostId` from client-supplied data (T-01-18).
- `Room.dispose()` clears every pending fade and host-transfer timer, so a callback scheduled before a room is torn down can never fire against a room that no longer exists.
- `Room.onStateChanged` is an optional callback, not a stored `io: Server` reference — `handlers.ts`'s `create-room` handler is the one place `io` is naturally in scope, and wires it there; `Room` itself never imports `socket.io`'s `Server` type for its own timer logic, which is what makes `rosterFade.integration.test.ts` / `hostTransfer.integration.test.ts` pure, fast, fake-timer unit tests against a bare `Room` with zero socket setup.
- A `rejoin` carrying a token the server never issued now replies with a fresh, unbound `session` instead of a silently-swallowed `NOT_IN_ROOM` error, and never attaches to an existing player's identity (T-01-17).
- `client/src/socket/resync.ts` — `installResyncTriggers` wires the three converging reconnect sources (socket `connect` → unconditional `rejoin`; `visibilitychange` → `"visible"` → `request-resync`; `pageshow` with `persisted: true` → `request-resync`), none of them trusting `socket.recovered`. Returns a teardown removing every listener it added.
- `client/src/socket/connection.ts` exposes a subscribable `connected` flag (via `useConnected()`, a `useSyncExternalStore` hook) driven by the socket's own `connect`/`disconnect` events, and installs the resync triggers once at module setup.
- `client/src/App.tsx` renders a Hebrew "מתחבר מחדש..." overlay whenever `connected` is false, positioned to sit over — never replace — whatever screen is currently showing, visible from the very first page load until the first handshake completes (D-14).
- `shared/messages.ts` gains `reconnecting`, `hostChanged` (for Phase 6's host-controls screen to use later — not rendered by this plan), and `disconnectedTag` (routing `Lobby.tsx`'s pre-existing inline literal through the shared string source).

## Task Commits

Each task was committed atomically, with a separate RED (failing test, genuinely verified failing) commit before each GREEN (implementation) commit for the two `tdd="true"` tasks:

1. **Task 1: Grace-delayed roster fade in the lobby, permanent retention in game**
   - `83035b8` test — failing tests for `rosterFade.integration.test.ts` (8/9 genuinely RED against pre-plan `Room.ts` — no `dispose()`, no fade timer) and `reconnect.integration.test.ts` (the LIVE-02 pin, which already passed since 01-01's reconnect path was already correct)
   - `d7af76c` feat — per-player fade timers, `dispose()`, `onStateChanged`, wired in `handlers.ts`'s create-room handler
2. **Task 2: Automatic host transfer when the host's phone dies**
   - `056587b` test — failing tests for `hostTransfer.integration.test.ts` (5/8 genuinely RED — no host-transfer timer, no `transferHost()`)
   - `8f9812f` feat — `Player.joinedAt`, host-transfer timer, `transferHost()`, fade/transfer ordering tolerance
3. **Task 3: Client resync triggers, reconnecting indicator, and the unknown-token path**
   - `a57fdf5` feat — `resync.ts`, `connection.ts`'s `connected` flag, `App.tsx`'s overlay, the unknown-token `rejoin` fix, `resync.test.ts`, `reconnectUnknownToken.integration.test.ts` (Task 3 is `type="auto"`, not `tdd="true"`, so tests and implementation landed together per the plan's own task type)

**Plan metadata:** recorded in this commit (docs).

_Note on RED verification: for Tasks 1 and 2, the implementation files (`Room.ts`, `Player.ts`, `handlers.ts`) were genuinely reverted to their pre-plan committed state, the new test files run and confirmed failing for the behaviors that depend on the new feature, then the implementation was reapplied and re-verified green before each GREEN commit — not just a commit-ordering convention._

## Files Created/Modified

- `server/src/config.ts` — `DEAD_SOCKET_WINDOW_MS`, `ROSTER_FADE_GRACE_MS`, `HOST_TRANSFER_GRACE_MS`
- `server/src/players/Player.ts` — `joinedAt` (monotonic join sequence)
- `server/src/rooms/Room.ts` — fade timers, host-transfer timer, `transferHost()`, `dispose()`, `onStateChanged`
- `server/src/socket/handlers.ts` — wires `onStateChanged` at room creation; unknown-token `rejoin` now replies with a fresh session
- `server/test/rosterFade.integration.test.ts`, `server/test/hostTransfer.integration.test.ts`, `server/test/reconnect.integration.test.ts`, `server/test/reconnectUnknownToken.integration.test.ts` — new test files
- `client/src/socket/resync.ts`, `client/src/socket/resync.test.ts` — new module and tests
- `client/src/socket/connection.ts` — `connected` flag, `useConnected()`, installs resync triggers
- `client/src/App.tsx` — Hebrew reconnecting overlay
- `client/src/screens/Lobby.tsx` — disconnected-tag literal routed through `HEBREW_UI`
- `client/src/index.css` — `.reconnect-overlay`
- `shared/messages.ts` — `reconnecting`, `hostChanged`, `disconnectedTag`

## Grace-delay constants (why 30s / 60s were kept, not changed)

**Final values:** `ROSTER_FADE_GRACE_MS = 30_000`, `HOST_TRANSFER_GRACE_MS = 60_000` (unchanged from the plan's `[ASSUMED]` starting point).

**The evidence available:** plan 01-01's real-phone human-check reported the post-unlock roster settling as "seems instant" — a woken phone resyncs to correct state with no perceptible delay. That is genuine, measured evidence, but it only validates the **return** side of reconnect (`rejoin` + full resync). It does not, by itself, tell us how long the *other* players should wait before a vanished player is shown as gone — that number is bounded below by how long the server itself takes to *notice* a dead socket (`DEAD_SOCKET_WINDOW_MS` = `PING_INTERVAL_MS` (10s) + `PING_TIMEOUT_MS` (8s) = up to ~18s), not by how fast the returning phone resyncs.

**Why the instant-reconnect evidence doesn't move these two numbers:** shortening the fade/transfer grace only removes safety margin on the *departure* side — it cannot improve the returning player's experience, because that experience is already effectively instantaneous regardless of how long or short the grace is set to. There is no returning-player benefit to trade against a shorter grace, so the instant-reconnect measurement gives no basis to move off the original RESEARCH.md A3 reasoning (30s roster grace comfortably covers a quick glance at a phone without reading as broken once someone has genuinely left; 60s, exactly 2x, keeps the host-transfer countdown from ever racing the lobby fade into an inconsistent state).

**What is still open:** the literal on-device confirmation — locking a real phone for 10s/30s/45s and watching what these specific numbers produce for a live audience — is this plan's own Task 3 `<human-check>` (steps 1-4) and requires real iPhone/Android hardware this sandboxed session does not have. Recorded as an open `unrun-verify` entry in `.planning/WINDOWS.md` so it stays visible through to ship, not silently dropped once this SUMMARY scrolls out of context.

## Decisions Made

See `key-decisions` in the frontmatter. Worth flagging out loud:

1. **`onStateChanged` callback instead of an `io: Server` field on `Room`.** This kept `RoomManager.ts` completely untouched (it isn't in this plan's `files_modified` list) and, more importantly, kept `Room` a plain class with zero `socket.io` server dependency for its own timer logic — `rosterFade.integration.test.ts` and `hostTransfer.integration.test.ts` construct a bare `Room`, drive it with `vi.useFakeTimers()`, and never touch a socket or an HTTP server at all.
2. **`joinedAt` is a monotonic counter, not `Date.now()`.** Vitest's fake timers also control `Date`, so two players added in the same fake-timer tick would otherwise tie and make "earliest-joined" host succession untestable and effectively arbitrary.
3. **The unknown-token `rejoin` fix landed in Task 3's commit even though `handlers.ts` wasn't in Task 3's own `files_modified` list.** The plan's `reconnectUnknownToken.integration.test.ts` (explicitly a Task 3 deliverable) cannot pass without this change, and `handlers.ts` was already a file this plan touches in Tasks 1 and 2 — this is a plan file-list gap, not a scope deviation, and is called out here for transparency.
4. **`Lobby.tsx`'s pre-existing `"(מנותק/ת)"` inline literal now routes through `HEBREW_UI.disconnectedTag`.** It predates this plan (introduced in 01-03) and wasn't broken, but this plan was already touching `Lobby.tsx` and adding the closely related `reconnecting`/`hostChanged` strings, so the inline literal was folded into the same shared source rather than left as the one remaining exception.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Unknown-token `rejoin` fix required to satisfy Task 3's own test deliverable**
- **Found during:** Task 3
- **Issue:** The plan's `<threat_model>` (T-01-17) and Task 3's explicit deliverable `reconnectUnknownToken.integration.test.ts` require a `rejoin` with an unrecognised token to reply with a fresh session, but the pre-existing handler replied with a swallowed `NOT_IN_ROOM` error instead.
- **Fix:** `rejoin` now issues an unbound session token and emits `session` when no known binding exists, instead of emitting an error nobody listens for.
- **Files modified:** `server/src/socket/handlers.ts`
- **Verification:** `server/test/reconnectUnknownToken.integration.test.ts` (2/2 pass); full server suite unaffected (13 files/72 tests).
- **Committed in:** `a57fdf5` (Task 3 commit)

**2. [Rule 2 - Consistency] Routed Lobby's pre-existing disconnected-tag literal through HEBREW_UI**
- **Found during:** Task 3
- **Issue:** `"(מנותק/ת)"` was hardcoded inline in `Lobby.tsx` since plan 01-03, alongside this plan's new `reconnecting`/`hostChanged` strings which correctly go through `HEBREW_UI`.
- **Fix:** Added `HEBREW_UI.disconnectedTag` and updated the one call site.
- **Files modified:** `shared/messages.ts`, `client/src/screens/Lobby.tsx`
- **Verification:** Full client suite (4 files/20 tests) and build both pass.
- **Committed in:** `a57fdf5` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking/test-satisfying, 1 consistency cleanup).
**Impact on plan:** Both are corrections toward the plan's own stated deliverables and existing conventions, not scope creep.

## Issues Encountered

None beyond the carried-forward, still-open item from plan 01-01: the literal real-phone stopwatch confirmation of the grace constants (this plan's own Task 3 exit-criterion human-check) requires hardware this sandboxed session does not have. See "Grace-delay constants" above and the `unrun-verify` entry in `.planning/WINDOWS.md`.

## Known Stubs

- **`Room.dispose()` has no production call site.** It correctly clears every pending timer when called, and is exercised directly by `rosterFade.integration.test.ts` / `hostTransfer.integration.test.ts`, but `RoomManager` never tears down a room in production code — rooms live for the process lifetime by design (RESEARCH.md Assumption A4: "no active-lifecycle disposal is needed within Phase 1 itself"). This is intentional, not an oversight, and is logged to `.planning/WINDOWS.md` (`todo`, `server/src/rooms/Room.ts`) so a later phase that adds room-lifecycle teardown remembers to wire it.
- **`HEBREW_UI.hostChanged` is not rendered by this plan.** The plan explicitly scopes it to Phase 6's host-controls screen ("this plan does not render it") — intentional, not a gap.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **Verification run in this session:** `npm --prefix server run test -- --run` — 13 files, 72 tests, all pass (up from the pre-plan baseline of 9 files/53 tests). `npm --prefix client run test -- --run` — 4 files, 20 tests, all pass (up from 3 files/13 tests). `npm --prefix server run typecheck` — clean. `npm --prefix client run build` — succeeds.
- **Not run — requires real phones, none available in this sandboxed session:** Task 3's `<human-check>` (steps 1-7): locking a real iPhone for 10s/45s, a genuine WiFi-off departure, a host-phone-off transfer, a mid-word rename during a lock, a force-quit-and-reopen, and a WiFi-to-mobile-data switch. This is the phase's own stated exit criterion (ROADMAP.md success criterion 4) and is the one thing this plan cannot verify on its own — logged to `.planning/WINDOWS.md` as an open item, consistent with plans 01-02 and 01-03's own deferred human-checks for the same reason.
- All four plans in Phase 1 (01-01 through 01-04) are now complete. The room/session/reconnect foundation — create, join, share, roster, names, dedup, reconnect, grace-delayed fade, and automatic host transfer — is in place for Phase 2's round engine to build on.

---
*Phase: 01-room-session-reconnect-foundation*
*Completed: 2026-09-06*

## Self-Check: PASSED

All 15 key files confirmed present on disk (6 created, 9 modified); all 5 task/RED/GREEN commit
hashes confirmed in `git log`. Full re-run of `npm --prefix server run test -- --run` (13 files, 72
tests), `npm --prefix client run test -- --run` (4 files, 20 tests), `npm --prefix server run
typecheck`, and `npm --prefix client run build` all pass as of this SUMMARY's commit.
