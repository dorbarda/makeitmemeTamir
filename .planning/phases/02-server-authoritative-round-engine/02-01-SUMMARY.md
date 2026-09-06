---
phase: 02-server-authoritative-round-engine
plan: 01
subsystem: api
tags: [socket.io, vitest, state-machine, timers, hebrew-rtl]

# Dependency graph
requires:
  - phase: 01-room-session-reconnect-foundation
    provides: "Room/RoomManager, Player/SessionRegistry, socket handlers, full-snapshot broadcast, the fadeTimers/hostTransferTimer delayed-timer pattern this plan's phaseTimer copies exactly"
provides:
  - "The complete Phase 2 wire contract in shared/protocol.ts: the six-member RoomPhase union, GameSettings/SettingsOptions, RoundView, SubmissionProgress, RatingStepView, RoundEndEntry/RoundEndView, the expanded LobbySnapshot, 10 new ErrorCodes, and 4 new CLIENT_EVENTS"
  - "Room.ts's server-owned round-clock state machine: startGame -> enterWriting -> closeWriting -> enterRoundEnd -> enterGameEnd, driven entirely by a single phaseTimer primitive with no client input after start-game"
  - "The absolute-deadline countdown primitives (client/src/time/countdown.ts) and the Countdown component every in-game screen mounts"
  - "server/src/config.ts's full set of Phase 2 timing constants (presets, defaults, pacing beats, MIN_SUBMISSIONS_TO_RATE, MAX_CAPTION_GRAPHEMES)"
affects: [02-02-lobby-settings, 02-03-writing-phase, 02-04-rating-rotation, 02-05-round-game-end, phase-3-real-content]

# Actuals (#2632)
actuals:
  tokens: 11671
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Single phaseTimer primitive (schedulePhase/clearPhaseTimer), copied structurally from Phase 1's fadeTimers/hostTransferTimer: clear-then-schedule, mutate-then-notify, and mandatory registration in dispose()."
    - "Fail-closed typed outcome for every mutating Room method (StartGameOutcome mirrors RenameOutcome) — never throws, always tells the caller why."
    - "No-client-supplied-authority: every phase transition (enterWriting/closeWriting/enterRoundEnd/enterGameEnd) is computed entirely from the room's own state, with zero parameters."
    - "Absolute-deadline countdown: server sends deadlineAt + serverNow once per snapshot; the client computes remaining time locally (skewOffsetMs/remainingMs/remainingSeconds) and never receives a per-second tick."

key-files:
  created:
    - client/src/screens/Round.tsx
    - client/src/components/Countdown.tsx
    - client/src/time/countdown.ts
    - client/src/time/countdown.test.ts
    - server/test/roundClock.e2e.test.ts
    - server/test/roundClockInvariants.test.ts
  modified:
    - shared/protocol.ts
    - shared/messages.ts
    - server/src/config.ts
    - server/src/rooms/Room.ts
    - server/src/socket/handlers.ts
    - client/src/App.tsx
    - client/src/index.css
    - server/test/rename.test.ts
    - server/test/rosterFade.integration.test.ts
    - server/test/hostTransfer.integration.test.ts

key-decisions:
  - "Authored the full Phase 2 wire contract (all of RoomPhase, GameSettings, RoundView, RatingStepView, RoundEndEntry, and all 4 new CLIENT_EVENTS) now, even though only start-game is wired to a real handler in this plan — so plans 02-02 through 02-05 never reopen shared/protocol.ts or shared/messages.ts."
  - "Left Room.ts's submissions/progress/rating fields as explicit null/false placeholders in snapshotFor rather than inventing a stub data structure — nothing in this plan's scope reads them, and a fake container would just be dead code plan 02-03 would have to reconcile against."
  - "Fixed 3 pre-existing tests (rename, rosterFade, hostTransfer) that set room.phase = \"IN_GAME\" directly, since that literal no longer exists in the expanded RoomPhase union — switched to \"WRITING\", a real non-LOBBY phase. This is a Rule 1 (bug) fix directly caused by this plan's own protocol.ts change, not scope creep."

patterns-established:
  - "The phaseTimer + schedulePhase/clearPhaseTimer pattern is now the template every later round-phase addition (RATING, REVEAL_BREAK) in plans 02-03/02-04 reuses verbatim."
  - "Bare-Room + vi.useFakeTimers() + dispose()-in-afterEach is the established harness for every future timer-driven Room test in this phase."

requirements-completed: [LOBBY-07, ROUND-04]

coverage:
  - id: D1
    description: "The host's start-game is the last client input the room needs to reach GAME_END — the server runs a complete 3-round contentless game on its own timers."
    requirement: LOBBY-07
    verification:
      - kind: unit
        ref: "server/test/roundClock.e2e.test.ts#chains WRITING -> ROUND_END -> WRITING -> ROUND_END -> WRITING -> ROUND_END -> GAME_END with no method calls in between"
        status: pass
      - kind: integration
        ref: "server/test/roundClock.e2e.test.ts#a passive non-host client reaches ROUND_END with no input of its own"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every non-terminal phase (WRITING, ROUND_END) carries a non-null deadlineAt strictly ahead of serverNow; LOBBY and GAME_END carry null. The writing-deadline and round-end pacing-beat boundaries are exact to the millisecond."
    requirement: ROUND-04
    verification:
      - kind: unit
        ref: "server/test/roundClockInvariants.test.ts#in WRITING and ROUND_END, deadlineAt is non-null and strictly greater than the same snapshot's serverNow"
        status: pass
      - kind: unit
        ref: "server/test/roundClockInvariants.test.ts#holds the writing-deadline boundary exactly: still WRITING one ms before the deadline, not WRITING one ms after"
        status: pass
      - kind: unit
        ref: "server/test/roundClockInvariants.test.ts#dispose() during WRITING prevents the writing deadline from ever changing the phase, however far timers are advanced afterwards"
        status: pass
    human_judgment: false
  - id: D3
    description: "The client-side countdown (skewOffsetMs/remainingMs/remainingSeconds/isUrgent) computes the same remaining seconds regardless of the local device's clock skew, clamps at 0, and turns urgent only in the final 10 seconds."
    requirement: ROUND-04
    verification:
      - kind: unit
        ref: "client/src/time/countdown.test.ts (14 tests, including the exact 1000/1001ms and 10000/10001ms boundaries)"
        status: pass
    human_judgment: false
  - id: D4
    description: "A live clock ticking down and turning visually urgent in a real browser tab, including behavior under backgrounding/throttling."
    verification: []
    human_judgment: true
    rationale: "setTimeout/Date.now()-based countdown behavior under real tab backgrounding cannot be proven by a unit test with fake timers — Phase 1's own hidden-defect history confirms this class of behavior needs a live-browser check, which is out of scope for this executor session (no real phone/browser available here)."

duration: ~25min
completed: 2026-09-06
status: complete
---

# Phase 2 Plan 1: Server-Authoritative Round Clock Summary

**Server-owned round-clock state machine (Room.ts phaseTimer + startGame/enterWriting/enterRoundEnd/enterGameEnd) proven end-to-end over real sockets, plus the complete Phase 2 wire contract and a skew-corrected absolute-deadline countdown on the client.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-09-06
- **Tasks:** 3 completed
- **Files modified:** 10 modified, 6 created

## Accomplishments
- The server runs a complete, contentless 3-round game to `GAME_END` entirely on its own timers, with the host's `start-game` as the only client input the room ever needs — proven both over real sockets (a passive non-host client reaches `ROUND_END` having emitted nothing) and against a bare `Room` driven purely by `vi.advanceTimersByTime`.
- The full Phase 2 wire contract (`shared/protocol.ts`'s six-member `RoomPhase`, `GameSettings`, `RoundView`, `SubmissionProgress`, `RatingStepView`, `RoundEndEntry`/`RoundEndView`, 10 new `ErrorCode`s, 4 new `CLIENT_EVENTS`) and every Hebrew string it needs (`shared/messages.ts`) are authored now, so plans 02-02 through 02-05 can implement behavior against an already-typechecked contract without reopening either file.
- A single `phaseTimer` primitive on `Room` (`schedulePhase`/`clearPhaseTimer`), built structurally identical to Phase 1's `fadeTimers`/`hostTransferTimer`, and registered in `dispose()` so a scheduled transition can never mutate a torn-down room.
- The client-side countdown math (`skewOffsetMs`/`remainingMs`/`remainingSeconds`/`isUrgent`) and the `Countdown` component that reads `deadlineAt`/`serverNow` from the snapshot and ticks locally — the server never sends a per-second message.

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end "the server runs the game clock by itself"** - `1574c4f` (feat)
2. **Task 2: The countdown every player reads** - `0eb0e6b` (test, RED) then `8f82b9b` (feat, GREEN)
3. **Task 3: The clock invariants** - `500a67f` (test — all 10 assertions passed against Task 1's implementation on the first run; no source change was needed)

## Files Created/Modified
- `shared/protocol.ts` - the complete Phase 2 wire contract (RoomPhase, GameSettings, snapshot fields, error codes, client events)
- `shared/messages.ts` - every Hebrew string and HEBREW_ERRORS entry this phase's contract requires
- `server/src/config.ts` - round-count/writing/rating presets and defaults, pacing beats, MIN_SUBMISSIONS_TO_RATE, MAX_CAPTION_GRAPHEMES
- `server/src/rooms/Room.ts` - settings/settingsLocked/roundIndex/deadlineAt state, phaseTimer primitive, startGame + enterWriting/closeWriting/enterRoundEnd/enterGameEnd chain, expanded snapshotFor
- `server/src/socket/handlers.ts` - the `start-game` handler (host-only via socket.data.playerId, never trusts a client-supplied identity)
- `client/src/App.tsx` - routes to the new `Round` screen for every non-LOBBY phase
- `client/src/screens/Round.tsx` - new in-game screen: phase heading, round position, mounted Countdown, roster, two commented mount points for plans 02-03/02-04
- `client/src/components/Countdown.tsx` - new: ticks locally against the absolute deadline, adds `countdown--urgent` in the final 10s
- `client/src/time/countdown.ts` / `countdown.test.ts` - new: the pure skew-correction and remaining-time math, 14 tests
- `client/src/index.css` - `.countdown` / `.countdown--urgent` rules
- `server/test/roundClock.e2e.test.ts` - new: real-socket + bare-Room proof of the whole clock chain
- `server/test/roundClockInvariants.test.ts` - new: deadline-non-null/null invariants, exact ms boundaries, dispose safety, startGame outcome coverage
- `server/test/rename.test.ts`, `server/test/rosterFade.integration.test.ts`, `server/test/hostTransfer.integration.test.ts` - fixed a pre-existing `room.phase = "IN_GAME"` literal that no longer type-checks against the expanded `RoomPhase` union

## Decisions Made
- Authored the entire Phase 2 wire contract now (see key-decisions above) rather than incrementally per-plan — the plan's own stated purpose ("no later plan reopens shared/protocol.ts") made this the correct call, confirmed by `npm --prefix server run typecheck` passing with all the new `HEBREW_ERRORS` entries the `Record<ErrorCode, string>` type requires.
- Left `progress`/`youSubmitted`/`yourPlaceholderId`/`ratingStep`/`roundEnd` as literal `null`/`false` in `snapshotFor` rather than building a placeholder submissions container — nothing in this plan's scope reads them yet, and inventing one now would be dead code for plan 02-03 to reconcile against.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Three pre-existing tests set an invalid RoomPhase literal**
- **Found during:** Task 1 (server typecheck, run immediately after editing `shared/protocol.ts`)
- **Issue:** `server/test/rename.test.ts`, `server/test/rosterFade.integration.test.ts`, and `server/test/hostTransfer.integration.test.ts` each directly assigned `room.phase = "IN_GAME"` to isolate a Phase 1 mechanism from the LOBBY-only fade timer. `"IN_GAME"` no longer exists in the expanded six-member `RoomPhase` union this plan introduces, so this failed `tsc --noEmit`.
- **Fix:** Changed all three to `room.phase = "WRITING"` — any real non-`LOBBY` phase satisfies the same test intent (the assertions only ever check `!== "LOBBY"` code paths).
- **Files modified:** `server/test/rename.test.ts`, `server/test/rosterFade.integration.test.ts`, `server/test/hostTransfer.integration.test.ts`
- **Verification:** `npm --prefix server run typecheck` exits 0; full server suite (85/85) still passes.
- **Committed in:** `1574c4f` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug, Rule 1)
**Impact on plan:** Necessary and directly caused by this plan's own protocol.ts change. No scope creep — no other file in those three tests was touched.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness

**Verification results (all commands run and their actual output recorded, not assumed):**
- `npm --prefix server run test -- --run` → **85/85 passed** (baseline 72 + 13 new: 3 in `roundClock.e2e.test.ts`, 10 in `roundClockInvariants.test.ts`)
- `npm --prefix client run test -- --run` → **34/34 passed** (baseline 20 + 14 new in `countdown.test.ts`)
- `npm --prefix server run typecheck` → exits 0, no output
- `npm --prefix client run build` → exits 0, "✓ 60 modules transformed" / "✓ built in ~400ms"
- A bare `Room` driven only by `vi.advanceTimersByTime` reaches `GAME_END` after three rounds with `deadlineAt === null` — confirmed in both `roundClock.e2e.test.ts` and `roundClockInvariants.test.ts`

**What only a live clock in a real browser can confirm (not proven here):**
- `Countdown`'s 250ms local tick interval and its behavior when the browser tab is backgrounded or throttled (e.g. mobile Safari suspending timers) — the unit tests use `vi.advanceTimersByTime` against pure functions and never exercise the actual `setInterval`/`Date.now()` runtime loop in a real tab. Per Phase 1's own hidden-defect history, this class of behavior is real-device-only; there is no real phone or browser available in this execution environment. A manual on-device check (open the app, watch the countdown tick and turn urgent in the last 10s, background the tab and return) is recommended before Phase 2 ships, exactly as Phase 1's playbook already established for `ROSTER_FADE_GRACE_MS`/`HOST_TRANSFER_GRACE_MS`.
- Whether a genuinely 30-second-skewed device clock in the wild produces the same UX as the unit-tested `skewOffsetMs` math — the math is proven correct in isolation, but a live cross-device clock-drift scenario was not observed.

**Ready for 02-02 (host settings panel):** `shared/protocol.ts` already carries `GameSettings`/`SettingsOptions`/`change-settings`, `Room.settings`/`settingsLocked` are already the single source of truth the round engine reads, and `snapshotFor` already exposes `settingsOptions` built from the three preset arrays — 02-02 only needs to wire a handler and a lobby UI against contract that's already typechecked.

**No blockers.**

## Self-Check: PASSED

All 6 created files confirmed present on disk; all 4 task commit hashes (`1574c4f`, `0eb0e6b`, `8f82b9b`, `500a67f`) confirmed present in git history.

---
*Phase: 02-server-authoritative-round-engine*
*Completed: 2026-09-06*
