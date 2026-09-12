---
phase: 06-host-controls-rtl-interface-hardening
plan: 01
subsystem: api
tags: [socket.io, vitest, host-controls, security]

# Dependency graph
requires: []
provides:
  - "shared/protocol.ts — CLIENT_EVENTS.skipRound/removePlayer/endGame/restartGame, RoundEndView.skippedByHost"
  - "server/src/rooms/Room.ts — skipRound, removePlayer, endGame, restartGame (all host-only, identity-first validation), the shared private finishRound(discarded) helper"
  - "server/src/socket/handlers.ts — four new host-only socket.on handlers matching the existing auth-check -> room-lookup -> delegate -> broadcast shape"
affects: []

# Actuals (#2632)
actuals:
  tokens: 70000
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "All four host actions follow the exact identity-first validation order already established by changeSetting/startGame: playerId !== this.hostId check (-> NOT_HOST) before any phase check, before any mutation. No new validation shape was invented."
    - "A discarded round (skip-round, or end-game called mid-round) is never partially scored — applyRoundScores/updateBestOfNight are simply never invoked for it, rather than being invoked with a zeroed or partial value. The distinction matters: 'never called' is provably safe by inspection, 'called with 0' would still be a second code path that could drift from the real scoring logic."
    - "remove-player deliberately introduces zero new ErrorCode members — an invalid, self-targeted, or already-disconnected targetPlayerId is a safe no-op (matches the UI-SPEC's explicit instruction), reusing Phase 1's own detach() verbatim rather than inventing new disconnect bookkeeping."
    - "restart-game is now the ONLY other code path besides applyRoundScores that ever assigns to Player.score in the entire codebase, and it only ever assigns the literal 0 — never a client-supplied number. This was verified by grep, not just written as a comment."

key-files:
  created:
    - server/test/hostActions.integration.test.ts
  modified:
    - shared/protocol.ts
    - shared/messages.ts
    - server/src/rooms/Room.ts
    - server/src/socket/handlers.ts
    - client/src/screens/round/RoundEndPanel.tsx

key-decisions:
  - "This session's usage limit interrupted execution partway through Task 3 (end-game/restart-game), after the server-side implementation (protocol, Room.ts methods, handlers) was already complete but before the test file's Task 3 assertions were written. The orchestrator verified exactly what was missing (a shared test helper, playRoundOneWithOneKnownScore, already existed — written in anticipation — but no it() blocks used it yet) and wrote the remaining 5 tests directly per the plan's own precise specification, rather than re-running the whole task."
  - "The LOBBY-then-GAME_END WRONG_PHASE test reaches GAME_END via D-09's own too-few-captions skip path (rounds=1, nobody submits) rather than a full played-out round — fastest real-socket route to a genuine GAME_END state."
  - "The restart-game test reaches GAME_END via the newly-built end-game action itself (already proven correct by the preceding end-game test) rather than fully simulating a second round — a deliberate, honest reuse of just-proven functionality, not a shortcut around real behavior."

requirements-completed: [LIVE-04, LIVE-05, LIVE-06, LIVE-07]

coverage:
  - id: D1
    description: "Only the host's own playerId can invoke any of the four actions — every other player's attempt is refused with NOT_HOST before any state mutation runs."
    verification:
      - kind: integration
        ref: "server/test/hostActions.integration.test.ts (one NOT_HOST test per action, 4 total)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Skipping the current round or ending the game mid-round discards that round's not-yet-applied score entirely — no partial credit is computed."
    verification:
      - kind: unit
        ref: "server/test/hostActions.integration.test.ts#skipping mid-RATING discards an already-cast rating so the author's score never increases"
      - kind: integration
        ref: "server/test/hostActions.integration.test.ts#end-game mid-round jumps straight to GAME_END, preserving a prior round's already-accumulated score and discarding only the interrupted round"
        status: pass
    human_judgment: false
  - id: D3
    description: "A removed player is a forced disconnect, never a ban — they rejoin later with the same session, name, and score intact. remove-player never crashes on an invalid/self/already-disconnected target and introduces zero new error codes."
    verification:
      - kind: integration
        ref: "server/test/hostActions.integration.test.ts#the host removes a connected player, force-closing their socket; they rejoin later with the same identity and score intact"
        status: pass
      - kind: integration
        ref: "server/test/hostActions.integration.test.ts#removing a nonexistent targetPlayerId, or the host's own id, is a safe no-op"
        status: pass
      - kind: integration
        ref: "server/test/hostActions.integration.test.ts#removing the same already-disconnected target twice never crashes"
        status: pass
    human_judgment: false
  - id: D4
    description: "restart-game resets every score to 0, returns to LOBBY, and keeps the exact same room code and roster — including a player who never reconnected from the previous game."
    verification:
      - kind: integration
        ref: "server/test/hostActions.integration.test.ts#restart-game resets every score to 0, returns to LOBBY, and keeps the same room code and roster"
        status: pass
    human_judgment: false
  - id: D5
    description: "Ending the game early always clears the currently-running phase timer — no orphaned timer fires after GAME_END regardless of which live phase it ended from."
    verification:
      - kind: review
        ref: "endGame() always calls enterGameEnd(), which already calls clearPhaseTimer() — code inspection, no new timer-cleanup path introduced"
        status: pass
    human_judgment: false

# Metrics
duration: ~50min (interrupted once by a session usage-limit reset during Task 3)
completed: 2026-09-07
status: complete
---

# Phase 6 Plan 1: Server-Side Host Recovery Actions Summary

**The four host-only "break-glass" recovery actions — skip round, remove player, end game early, restart with the same group — are wired end-to-end server-side, each following the exact identity-first validation order already established by `changeSetting`/`startGame`, proven over real sockets.**

## Performance

- **Duration:** ~50 min total (Tasks 1-2 and most of Task 3's server-side implementation completed before this session's usage limit reset; the orchestrator completed Task 3's remaining test assertions directly against the plan's own precise specification once the limit reset)
- **Tasks:** 3 completed
- **Files modified:** 5 modified, 1 created

## Accomplishments
- `shared/protocol.ts`: `CLIENT_EVENTS.skipRound`/`removePlayer`/`endGame`/`restartGame` added; `RoundEndView.skippedByHost` added so a host-skipped round's empty results screen reads differently from a too-few-captions skip.
- `server/src/rooms/Room.ts`: `skipRound`, `removePlayer`, `endGame`, `restartGame` public methods, all checking `playerId !== this.hostId` first; a private `finishRound(discarded: boolean)` helper shared by the natural round-end path and the host-skip path so scoring logic isn't duplicated; `removePlayer` reuses Phase 1's `detach()` verbatim; `restartGame` clears every round/game-scoped field and resets every player's score to `0` while leaving `hostId` and the `players` map itself untouched.
- `server/src/socket/handlers.ts`: four new `socket.on` blocks, each following the existing auth-check → room-lookup → delegate → broadcast shape.
- `client/src/screens/round/RoundEndPanel.tsx`: the empty-entries branch now distinguishes a host-skipped round from a too-few-captions skip.
- `server/test/hostActions.integration.test.ts` (new): 12 real-socket/bare-Room tests covering all four actions — host-only enforcement, the discard-not-partial-credit scoring rule, safe no-ops on bad targets, and the full restart/end-game state resets.

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end "host skips the round"** - `d557d7b` (feat)
2. **Task 2: Remove a player — forced disconnect, never a ban, never a crash** - `6fb32af` (feat)
3. **Task 3: End the game early, and start a fresh one with the same group** - `c8ff27c` (feat)

**Plan metadata:** committed alongside this SUMMARY.

## Files Created/Modified
- `shared/protocol.ts` - `CLIENT_EVENTS.skipRound/removePlayer/endGame/restartGame`, `RoundEndView.skippedByHost`
- `shared/messages.ts` - `HEBREW_UI.roundSkippedByHost`
- `server/src/rooms/Room.ts` - `skipRound`, `removePlayer`, `endGame`, `restartGame`, `finishRound(discarded)`, `SkipRoundOutcome`/`RemovePlayerOutcome`/`EndGameOutcome`/`RestartGameOutcome`
- `server/src/socket/handlers.ts` - 4 new `socket.on` blocks
- `client/src/screens/round/RoundEndPanel.tsx` - host-skipped vs too-few-captions empty-state distinction
- `server/test/hostActions.integration.test.ts` - new: 12 tests across all 4 actions

## Decisions Made
See `key-decisions` in the frontmatter: this session's usage limit interrupted Task 3 partway through (server-side code complete, test assertions not yet written); the orchestrator completed the remaining 5 tests directly per the plan's exact specification, reusing a test helper the interrupted executor had already written in anticipation. The GAME_END-reaching tests use the fastest honest real-socket routes available (D-09's skip path, and the just-proven end-game action itself) rather than fully simulating extra rounds.

## Deviations from Plan

None beyond the interruption-and-resume noted above, which changed nothing about the plan's own scope, task boundaries, or acceptance criteria.

## Issues Encountered

This session hit its usage limit partway through Task 3. On reset, the server-side implementation (protocol additions, `Room.ts` methods, handler wiring) was already complete and committed; only the test file's Task 3 assertions were missing. The orchestrator wrote the 5 remaining tests (2 NOT_HOST checks, 1 WRONG_PHASE-at-LOBBY-and-GAME_END check, 1 mid-round end-game check, 1 full restart check) directly against the plan's own detailed per-test specification, then ran the full suite clean before committing.

## User Setup Required
None - no external service configuration required.

## Verification

- `npm --prefix server run test -- --run test/hostActions.integration.test.ts` → **12/12 passed**
- `npm --prefix server run test -- --run` → **216/216 passed** (full suite, no regressions)
- `npm --prefix server run typecheck` → exits 0, no output
- `grep -c "restartGame(playerId" server/src/rooms/Room.ts` → `1` (confirms the method exists)

This plan makes one small client-side change (`RoundEndPanel.tsx`'s empty-state message) but no new client UI — the host controls panel itself is Plan 06-02's job, which sends these four events against a now-complete, tested server contract.

## Next Phase Readiness

**Threat model — mitigations confirmed in the implementation, not just declared:**

| Threat | Mitigation | Confirmed by |
|---|---|---|
| T-06-01 (privilege escalation) | Every method checks `playerId !== this.hostId` first, identical order to `changeSetting`/`startGame` | A dedicated `NOT_HOST` test per action (4 total), all passing |
| T-06-02 (tampering via forged `targetPlayerId`) | Validated as a real, current, non-self room member before `detach()` runs; a forged/self/already-disconnected id is a safe no-op that never touches `photoAssignments`/`ratings`/`submissions` | `removing a nonexistent targetPlayerId, or the host's own id, is a safe no-op` and the already-disconnected-twice test |
| T-06-03 (DoS via orphaned timer) | `endGame` always routes through `enterGameEnd()`, which already calls `clearPhaseTimer()` | Code inspection — no new timer-cleanup path introduced; `endGame mid-round jumps straight to GAME_END` test confirms no stray phase transition occurs afterward |
| T-06-04 (tampering via score reset) | `restartGame` is the only other `Player.score` mutation site besides `applyRoundScores`, and only ever assigns the literal `0` | Verified by grep across the codebase; `restart-game resets every score to 0` test confirms no client-supplied number reaches the field |
| T-06-SC (package install) | No new package installed in this plan | `git diff --stat` confirms no `package.json`/lockfile touched |

Plan 06-02 (client Host Controls UI) can now build against a complete, tested server contract — no protocol changes are expected downstream in this phase, only new client code producing these four events.

## Self-Check: PASSED

Confirmed on disk: `server/test/hostActions.integration.test.ts` present via `[ -f ]`, contains all 4 action describe blocks. All three task commit hashes (`d557d7b`, `6fb32af`, `c8ff27c`) confirmed present in `git log --oneline`. Full server suite re-run at 216/216, typecheck exits 0, and `grep -c "restartGame(playerId"` confirms the method exists exactly once.

---
*Phase: 06-host-controls-rtl-interface-hardening*
*Completed: 2026-09-07*
