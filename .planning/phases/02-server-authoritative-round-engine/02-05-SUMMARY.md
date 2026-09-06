---
phase: 02-server-authoritative-round-engine
plan: 05
subsystem: api
tags: [socket.io, vitest, react, hebrew-rtl, state-machine, timers]

# Dependency graph
requires:
  - phase: 02-server-authoritative-round-engine
    provides: "plan 02-01's phaseTimer/schedulePhase/collapseDeadline primitives and RoundEndEntry/RoundEndView wire contract; plan 02-04's rotation/eligibleRaters and the ratings/eligibleAtClose maps"
provides:
  - "Room.buildRoundEndView() — the round-end/game-end view carrying per-meme ratings and the eligible-rater count at close, never reduced to a score"
  - "The fully closed WRITING -> REVEAL_BREAK -> RATING -> ROUND_END -> next round -> GAME_END loop, confirmed correct with no code changes needed beyond the round-end view"
  - "client/src/screens/round/RoundEndPanel.tsx — the round-end and game-end screens"
  - "server/test/neverStalls.integration.test.ts — the LIVE-03 battery proving no phase can be held open by a departed, disconnected or silent player"
  - "server/test/fullLoop.integration.test.ts — a scripted 4-client game over real sockets reaching GAME_END with a mid-game disconnect"
affects: [phase-3-real-content, phase-4-scoring]

# Actuals (#2632)
actuals:
  tokens: 7544
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "buildRoundEndView() maps rotation -> RoundEndEntry directly off Room's own existing per-step maps (ratings, eligibleAtClose) and the submissions map — no new state was needed, only a read-side projection, confirming plans 02-01/02-04 already captured everything Phase 4 needs."
    - "neverStalls.integration.test.ts's phase-walk loop (WRITING/REVEAL_BREAK/RATING/ROUND_END) is now the single machine-readable definition of LIVE-03 — detach every player at each phase in turn and assert it still advances. Any future phase transition that grows a wait-on-a-specific-player condition breaks this loop."
    - "Never submit ALL players' captions in a fake-timer test that also does one big vi.advanceTimersByTime() spanning multiple phases — doing so triggers D-07's early-finish collapse, which cascades the single large time-advance straight through several rounds at once instead of landing on the intended phase. Submit fewer than the full roster (mirroring ratingStep.integration.test.ts's own reachStep0 helper) whenever a test needs the FULL writingSeconds/ratingSeconds window to actually elapse."
    - "A rating-step submission's own broadcast echoes phase:\"RATING\" for the SAME still-open step — a real-socket test waiting for the next rating step must match on ratingStep.index, not just phase, or it resolves on the echo instead of the next step opening."

key-files:
  created:
    - client/src/screens/round/RoundEndPanel.tsx
    - server/test/neverStalls.integration.test.ts
    - server/test/fullLoop.integration.test.ts
  modified:
    - server/src/rooms/Room.ts
    - client/src/screens/Round.tsx
    - client/src/index.css
    - shared/messages.ts

key-decisions:
  - "Added one Hebrew string (HEBREW_UI.roundEndTooFewCaptions) to shared/messages.ts despite the plan's interfaces section marking messages.ts as fixed/not-to-modify — Task 2's own action text explicitly requires rendering a too-few-captions line, and no existing HEBREW_UI key covers it. Treated as Rule 3 (blocking issue): the task cannot be completed as specified without it. A single additive key, no existing entries touched."
  - "reachRatingStep0's test helper submits exactly two captions (players[0], players[1]), never the full roster — submitting everyone triggers the writing phase's own D-07 early-finish collapse, which (discovered via a failing first test run) cascades a single large vi.advanceTimersByTime() straight through multiple rounds instead of landing cleanly on REVEAL_BREAK. This mirrors ratingStep.integration.test.ts's own established reachStep0 pattern exactly."
  - "fullLoop.integration.test.ts seeds room.settings.rounds = 1 (down from the default 3) and very short writing/rating windows (0.2s/0.15s) — D-11's fixed pacing beats (BETWEEN_PHASES_MS + BETWEEN_MEMES_MS = 8s for a two-step round) are not host-configurable and already consume most of the suite's 10s testTimeout, so round count was reduced per the plan's own explicit instruction rather than raising the timeout."

patterns-established:
  - "Round-end/game-end view construction is a pure read-side projection off existing per-round state (rotation, submissions, ratings, eligibleAtClose, players) — never a new mutation path, and never a reduction of ratings to a score, leaving that decision entirely to Phase 4."
  - "The never-stalls phase-walk loop (visit every non-terminal phase, detach everyone, assert the phase still advances) is the reusable template for proving LIVE-03-shaped properties in any future phase that adds a server-timed transition."

requirements-completed: [VOTE-04, LIVE-03]

coverage:
  - id: D1
    description: "Fewer than two submitted captions skips the rating phase entirely and advances straight to the next round (or game end); exactly two submissions produce exactly two rating steps (D-09)."
    requirement: VOTE-04
    verification:
      - kind: unit
        ref: "server/test/neverStalls.integration.test.ts#a bare Room driven with fake timers from startGame with zero submissions never reports phase === RATING at any point in the round (D-09)"
        status: pass
      - kind: unit
        ref: "server/test/neverStalls.integration.test.ts#visits WRITING, REVEAL_BREAK, RATING and ROUND_END in turn (uses exactly two submissions -> two rating steps)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Between the end of one round and the start of the next there is a 3-second beat, after which the next round's writing phase opens by itself; after the last round the game reaches a terminal GAME_END with a null deadline and nothing further scheduled."
    requirement: VOTE-04
    verification:
      - kind: unit
        ref: "server/test/neverStalls.integration.test.ts#the host detaching mid-game does not disturb the round clock, and Phase 1's host transfer still fires on its own schedule (asserts round 2 WRITING opens after the ROUND_END beat)"
        status: pass
      - kind: unit
        ref: "server/test/neverStalls.integration.test.ts#a bare Room driven with fake timers from startGame with zero submissions never reports phase === RATING (asserts GAME_END and a null-safe roundEnd)"
        status: pass
      - kind: e2e
        ref: "server/test/fullLoop.integration.test.ts#four clients play a round to GAME_END while one disconnects after round 1 and never returns (asserts deadlineAt === null at GAME_END)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The round-end view carries, for every meme in the round, its individual ratings and the eligible-rater count at the moment its step closed — never reduced to a score — and is null in every phase except ROUND_END/GAME_END."
    requirement: VOTE-04
    verification:
      - kind: unit
        ref: "server/test/neverStalls.integration.test.ts#a RoundEndEntry for a step rated by two of four eligible raters has a ratings array of length 2 and eligibleAtClose equal to 4"
        status: pass
    human_judgment: false
  - id: D4
    description: "No phase, anywhere, can be held open by a player who left, disconnected or never responded: departure only ever makes a phase end sooner (via D-07's early-finish exclusion) or leaves the ordinary deadline to fire regardless, never later and never never."
    requirement: LIVE-03
    verification:
      - kind: unit
        ref: "server/test/neverStalls.integration.test.ts (11 tests: WRITING/RATING early-finish exclusion, every-eligible-rater-departs, host-departs-mid-game, mid-game detach schedules no fade (D-17), reconnect mid-round, the WRITING/REVEAL_BREAK/RATING/ROUND_END phase-walk loop, dispose() from all four non-terminal phases)"
        status: pass
      - kind: e2e
        ref: "server/test/fullLoop.integration.test.ts#four clients play a round to GAME_END while one disconnects after round 1 and never returns"
        status: pass
    human_judgment: false
  - id: D5
    description: "The round-end and game-end screens render the server's roundEnd.entries in received order (no ranking, no scoring) with a distinct line when the round skipped rating; ROUND_END advances to the next round and GAME_END to a stable terminal screen entirely on their own, visible on a real phone-width device."
    verification:
      - kind: automated_ui
        ref: "npm --prefix client run build / typecheck (exit 0, includes tsc type-checking JSX prop usage)"
        status: pass
    human_judgment: true
    rationale: "Task 2's own human-check (three browser windows playing a full game, watching rounds advance and the game end on their own, a skipped-rating round showing the too-few-captions line, and a closed window never blocking the others) can only really be confirmed in a real multi-window browser session. No real phone/browser is available in this execution environment."
---

# Phase 2 Plan 5: Closing the Loop — Round-End View and the Never-Stalls Battery Summary

**The round-end/game-end view (`Room.buildRoundEndView`) exposing per-meme ratings and eligible-rater-at-close counts without ever reducing them to a score, plus an 11-test fake-timer battery and a real-socket 4-client scripted game proving no phase in the round engine can be held open by a player who left, disconnected, or stayed silent.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-09-06
- **Tasks:** 3 completed
- **Files modified:** 4 modified, 3 created

## Accomplishments
- `Room.buildRoundEndView()` populates `snapshotFor`'s `roundEnd` field during `ROUND_END` and `GAME_END` only (`null` everywhere else, T-02-20): each `RoundEndEntry` carries the author's id and current name, their caption, the raw rating values that step received, and `eligibleAtClose` — deliberately never summed into a score, leaving sum-vs-average entirely to Phase 4 (D-10).
- Confirmed, with no code change required, that `closeWriting`'s D-09 skip branch, `enterRoundEnd`'s `this.settings.rounds` continue-or-finish branch, and `enterGameEnd`'s terminal cleanup were all already correct from plans 02-01/02-04 — this plan's own Task 1 verified rather than re-implemented the loop-closing logic, and spent its actual new code entirely on the round-end view.
- `client/src/screens/round/RoundEndPanel.tsx`: renders `roundEnd.entries` in the exact order the server sent them (no sort, no summation) for both `ROUND_END` and `GAME_END`, with a distinct too-few-captions line when a round skipped rating entirely.
- `server/test/neverStalls.integration.test.ts` (11 tests, bare `Room` + fake timers): proves a departed player is excluded from — never counted against — the writing/rating early-finish expectation; every eligible rater for a step detaching still lets it close on schedule with an empty ratings array; the host detaching mid-game never disturbs the round clock while Phase 1's own host-transfer fires independently underneath it; a mid-game detach schedules no roster fade (D-17); a returning player sees the unchanged deadline; and — the single most load-bearing test in the file — a loop that visits `WRITING`, `REVEAL_BREAK`, `RATING` and `ROUND_END` in turn, detaches every player at each, and asserts the phase still advances on its own timer. A companion loop proves `dispose()` halts advancement from all four non-terminal phases.
- `server/test/fullLoop.integration.test.ts` (real sockets, real timers): four clients play a scripted round — two submit captions and rate each other's memes — to `GAME_END`, while a fourth client disconnects after rating and never returns; the departed player keeps a roster entry with `connected: false` (Phase 1 D-17) and the remaining three clients still reach `GAME_END` with a null `deadlineAt`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Close the loop — the too-few-captions skip, the round-end beat, and the data Phase 4 needs** - `1760aa0` (feat)
2. **Task 2: The round-end and game-end screens** - `a26f988` (feat)
3. **Task 3: The never-stalls battery and a full scripted game** - `3715058` (test)

## Files Created/Modified
- `server/src/rooms/Room.ts` - `buildRoundEndView()`; `roundEnd` populated in `snapshotFor` for `ROUND_END`/`GAME_END`
- `client/src/screens/round/RoundEndPanel.tsx` - new: the round-end/game-end screen
- `client/src/screens/Round.tsx` - mounts `RoundEndPanel` for `ROUND_END` and `GAME_END`
- `client/src/index.css` - `.round-end-panel`, `.round-end-entry` — mobile-first, RTL, captions wrap rather than widening the layout
- `shared/messages.ts` - added `HEBREW_UI.roundEndTooFewCaptions` (see Deviations)
- `server/test/neverStalls.integration.test.ts` - new: 11 bare-`Room` fake-timer tests, the LIVE-03 battery
- `server/test/fullLoop.integration.test.ts` - new: 1 real-socket, 4-client scripted game to `GAME_END`

## Decisions Made
- See `key-decisions` in the frontmatter: the one additive Hebrew string, the `reachRatingStep0` two-submitter test-helper shape (and why submitting the full roster is a trap for fake-timer tests spanning multiple phases), and the reduced round count / short seeded timers in `fullLoop.integration.test.ts` to fit the suite's 10s `testTimeout`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added a missing Hebrew string for the too-few-captions line**
- **Found during:** Task 2 (`RoundEndPanel.tsx`)
- **Issue:** The plan's `<interfaces>` section marks `shared/messages.ts` as authored-and-fixed by plan 02-01 ("this plan does not modify..."), but Task 2's own `<action>` text explicitly requires rendering "a short line saying the round had too few captions to rate" when `roundEnd.entries` is empty. No existing `HEBREW_UI` key covers this — plan 02-01's own string list for this plan only names `roundEndHeading`, `gameEndHeading`, `roundLabel`, `ofSeparator`, `placeholderContentPrefix`, none of which fit.
- **Fix:** Added one additive key, `HEBREW_UI.roundEndTooFewCaptions`, under a `// plan 02-05` comment group — no existing entry was touched or renamed.
- **Files modified:** `shared/messages.ts`
- **Verification:** `npm --prefix client run typecheck` / `build` exit 0; `RoundEndPanel.tsx` renders it when `entries.length === 0`.
- **Committed in:** `a26f988` (Task 2 commit)

**2. [Rule 1 - Bug] Test helper's collapse-cascade fixed before it reached a commit**
- **Found during:** Task 3, first run of `neverStalls.integration.test.ts` (4 of 11 tests failed)
- **Issue:** The initial `reachRatingStep0` helper had every player submit a caption before doing one large `vi.advanceTimersByTime(writingSeconds * 1000)`. Submitting from every connected player triggers `maybeCollapseWriting`'s D-07 early-finish collapse, shortening the deadline to `WRITING_COLLAPSE_MS` — so the subsequent large time-advance (sized for the ORIGINAL, uncollapsed deadline) overshot straight through the collapsed writing close, the reveal break, all of that round's rating steps, the round-end beat, and into the next round's `WRITING`, landing tests on the wrong phase entirely.
- **Fix:** Changed the helper to submit exactly two captions (`players[0]`, `players[1]`) — mirroring `ratingStep.integration.test.ts`'s own established `reachStep0()` pattern, which never has every connected player submit for exactly this reason.
- **Files modified:** `server/test/neverStalls.integration.test.ts` (caught and fixed before any commit — no separate correction commit needed)
- **Verification:** all 11 tests in the file pass; re-verified against the full suite and 3 repeated runs of `fullLoop.integration.test.ts` for timing stability.
- **Committed in:** `3715058` (Task 3 commit — the fix was applied before this, the only, commit for the file)

---

**Total deviations:** 2 auto-fixed (1 blocking-missing-string, 1 bug caught pre-commit by the test's own first failing run)
**Impact on plan:** Both necessary to complete the plan as specified; no scope creep. Neither touched any file outside this plan's own `files_modified` list.

## Issues Encountered
- `fullLoop.integration.test.ts`'s real-time budget is tight against the suite's 10s `testTimeout`: D-11's fixed pacing beats (`BETWEEN_PHASES_MS` + `BETWEEN_MEMES_MS` = 8s for a two-rating-step round) are not host-configurable, so the only available levers were reducing the seeded round count (3 -> 1, per the plan's own explicit instruction) and shortening the seeded `writingSeconds`/`ratingSeconds` to 0.2s/0.15s. The test passed consistently across 6+ repeated local runs at ~9.1-9.3s — comfortable but not generous margin. If this test becomes flaky in CI under load, the next lever (in the order the plan itself prescribes) would be further reducing the seeded timer values, not raising the timeout.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness

**Verification results (all commands run and their actual output recorded, not assumed):**
- `npm --prefix server run test -- --run` → **168/168 passed** (baseline 156 + 12 new: 11 in `neverStalls.integration.test.ts`, 1 in `fullLoop.integration.test.ts`) — confirmed stable across 4 repeated runs
- `npm --prefix client run test -- --run` → **34/34 passed** (unchanged — no client test file was added or touched this plan)
- `npm --prefix server run typecheck` → exits 0, no output
- `npm --prefix client run typecheck` → exits 0, no output
- `npm --prefix client run build` → exits 0, "✓ 63 modules transformed" / "✓ built in ~430-500ms"

**Never-stalls scenarios proven (checklist against this plan's own edge-case list):**
| Scenario (from PLAN.md's `<behavior>` list) | Proven by |
|---|---|
| Every player except one detaches during WRITING: phase still closes exactly at its deadline | `neverStalls.integration.test.ts#closes WRITING exactly at its own deadline when every player but one has detached` |
| A departed pre-submission player is excluded from WRITING's early-finish expectation | `neverStalls.integration.test.ts#a player detaching during WRITING before submitting is excluded from the early-finish expectation...` |
| A departed pre-rating player is excluded from a RATING step's early-finish expectation | `neverStalls.integration.test.ts#a player detaching during a RATING step before rating does not block the remaining eligible raters...` |
| Every eligible rater for a step detaches: step still closes empty, no invented value | `neverStalls.integration.test.ts#every eligible rater for a step detaching leaves the step to close on its own deadline with an empty ratings array...` |
| Host detaches mid-game: round clock undisturbed, Phase 1 host-transfer still fires | `neverStalls.integration.test.ts#the host detaching mid-game does not disturb the round clock...` |
| Mid-game detach schedules no roster fade (D-17) | `neverStalls.integration.test.ts#a mid-game detach schedules no roster fade (Phase 1 D-17)...` |
| Returning player sees current phase and correct remaining time | `neverStalls.integration.test.ts#a detached player who reconnects mid-round sees the current phase and the unchanged deadline...` |
| Every phase visited in turn, detach-everyone-and-still-advances | `neverStalls.integration.test.ts#visits WRITING, REVEAL_BREAK, RATING and ROUND_END in turn...` |
| `dispose()` halts advancement from each non-terminal phase | `neverStalls.integration.test.ts#dispose() halts advancement from each of WRITING, REVEAL_BREAK, RATING and ROUND_END` |
| Real sockets, 4 clients, 3-round-shaped game completes with a mid-game disconnect | `fullLoop.integration.test.ts#four clients play a round to GAME_END while one disconnects after round 1 and never returns` (round count reduced to 1 per the plan's own explicit fallback — see Issues Encountered) |

**`shared/protocol.ts` contract changes:** none — this plan implements against the wire contract plan 02-01 already authored (`RoundEndEntry`, `RoundEndView`, `LobbySnapshot.roundEnd`) with zero type changes.

**Carried-forward planner assumption (flagged in PLAN.md, not resolved by this plan):** the LIVE-03 edge probe left one item explicitly for human review — an empty room (every player departed) is never torn down; it keeps ticking through its remaining rounds to `GAME_END` and then sits in a terminal state until the process restarts. No source artifact in this phase decides whether an empty room should self-dispose. This plan's own tests confirm the room's timers keep firing correctly with zero connected players (that is exactly what "never stalls" requires), but whether an EMPTY room should be torn down entirely is a resource-cleanup decision, not a correctness one — Phase 6 (host controls) or Phase 7 (deployment) are the likelier homes for it, per the plan's own flag.

**What only a real browser/real party can confirm (not proven here, no real phone/browser available in this execution environment):**
- Task 2's own human-check: three browser windows playing a full game and watching the round-end list appear, the game auto-advance to the next round about three seconds later, the game-end screen appear and stay after the last round with no countdown, a round with nobody writing skip straight to the too-few-captions line, and a closed window never blocking the others. The server-side round-end view is machine-proven (see coverage D1-D4 above); the visual/live-browser experience remains this plan's own flagged human-check.

**Ready for Phase 3 / Phase 4:** `RoundEndEntry.ratings`/`eligibleAtClose` are exactly the two numbers Phase 4's scoring decision (sum vs. average vs. some floor, D-10's flag) needs without any engine rework; `RoundEndPanel.tsx` is a deliberately unranked placeholder Phase 4 replaces with the real ranked round-results screen (VOTE-06) and the winner/best-of-night screens (SCORE-04/MEME-02). Phase 3 swaps in real photos wherever `HEBREW_UI.placeholderContentPrefix` currently appears — untouched by this plan.

**Phase 2 as a whole is now closed**: server 168/168, client 34/34, both typechecks clean, client build succeeds — the state machine this phase exists to build (LOBBY -> WRITING -> REVEAL_BREAK -> RATING (repeated) -> ROUND_END (repeated) -> GAME_END) is fully implemented, tested, and proven immune to a player leaving, disconnecting, or staying silent at any point in that chain.

**No blockers.**

## Self-Check: PASSED

All 3 created files confirmed present on disk; all 3 task commit hashes (`1760aa0`, `a26f988`, `3715058`) confirmed present in git history.

---
*Phase: 02-server-authoritative-round-engine*
*Completed: 2026-09-06*
