---
phase: 02-server-authoritative-round-engine
plan: 04
subsystem: api
tags: [socket.io, vitest, react, hebrew-rtl, state-machine, timers]

# Dependency graph
requires:
  - phase: 02-server-authoritative-round-engine
    provides: "plan 02-01's phaseTimer/schedulePhase/collapseDeadline primitives and the RoomPhase/RatingStepView/RoundEndEntry wire contract; plan 02-03's submissions map (insertion-ordered, exactly the reveal-rotation source) and progress/D-14 field-omission discipline"
provides:
  - "server/src/rooms/rotation.ts — buildRotation and eligibleRaters, the pure functions deciding who is shown and who may rate"
  - "Room's rating-half state machine: rotation, stepIndex, ratings, eligibleAtClose, enterRevealBreak, enterRatingStep, closeRatingStep, submitRating, maybeCollapseRating"
  - "The submit-rating socket handler, wired to the same auth-check -> room-lookup -> delegate -> broadcast shape as every other handler"
  - "client/src/screens/round/RatingPanel.tsx — the one-meme-at-a-time rating screen with the three-point scale, the author's waiting state, and the rated-count line"
affects: [02-05-round-game-end]

# Actuals (#2632)
actuals:
  tokens: 9919
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "rotation.ts as a second pure module beside gameSettings.ts: buildRotation is literally [...submissions.keys()] — a Map's insertion order IS submission-arrival order in a single-threaded process, so there is no comparator to write and no re-derivation ever needed mid-round."
    - "closeRatingStep's phase==='RATING' guard at entry is the sole mechanism proving the adjacency property (advances exactly once, never re-opens a closed step) — no second timer-cancellation path was needed because schedulePhase already clears any prior timer before scheduling a new one."
    - "maybeCollapseRating mirrors plan 02-03's maybeCollapseWriting exactly: reuses the single collapseDeadline chokepoint, and guards eligible.length > 0 before checking 'every eligible rater rated' — the same JS Array.prototype.every-on-empty-array vacuous-true trap plan 02-03 already caught for writing, applied here to rating."
    - "ratingStep is built entirely inside snapshotFor, keyed off the requesting playerId — youAreAuthor/youMayRate/youHaveRated are personalized booleans computed server-side, never inferred client-side, continuing the D-14 discipline of 'nothing to leak because there is no field to leak it in'."

key-files:
  created:
    - server/src/rooms/rotation.ts
    - server/test/rotation.test.ts
    - server/test/ratingStep.integration.test.ts
    - client/src/screens/round/RatingPanel.tsx
  modified:
    - server/src/rooms/Room.ts
    - server/src/socket/handlers.ts
    - client/src/screens/Round.tsx
    - client/src/index.css

key-decisions:
  - "eligibleRaters is computed against the full players map, not the rotation — a non-submitter (skipped from the rotation per D-08) is still eligible to RATE every other meme. Only the submissions map decides who gets a rating step of their own; connectedness and non-authorship decide who may rate whichever step is currently on screen. This matches the plan's own distinction and was proven directly in ratingStep.integration.test.ts (players[3]/players[4] never submit yet count in eligibleAtClose)."
  - "maybeCollapseRating additionally guards against eligible.length === 0 (mirroring plan 02-03's zero-connected-players guard for writing) — if every non-author player has disconnected, Array.prototype.every on an empty array is vacuously true and would otherwise fire a spurious 2-second collapse for a step nobody but the author remains in. Not exercised by a dedicated test since the scenario doesn't arise in any of this plan's own test flows; left in as a Rule 2 correctness guard, consistent with 02-03's own precedent."

patterns-established:
  - "Every Room mutation a client intent can trigger at an invalid moment (now five: renamePlayer, startGame, changeSetting, submitCaption, submitRating) returns the same ok:true|false discriminated union, refusal order phase/replay-safety first, then identity, then value shape, then replay."
  - "The two-map close-time snapshot (ratings: stepIndex -> raterId -> value, eligibleAtClose: stepIndex -> count) is now the established pattern for any future per-step outcome the engine must record without inventing a value for silence."

requirements-completed: [VOTE-04]

coverage:
  - id: D1
    description: "The round's memes are revealed one at a time, the same meme on every player's screen at once, and each meme's rating step closes on its own server-owned countdown regardless of how many players have rated it (VOTE-04)."
    requirement: VOTE-04
    verification:
      - kind: unit
        ref: "server/test/ratingStep.integration.test.ts#writing closes into REVEAL_BREAK for exactly BETWEEN_PHASES_MS, then RATING at step 0 of 3"
        status: pass
      - kind: unit
        ref: "server/test/ratingStep.integration.test.ts#with nobody rating, step 0 still closes exactly at its deadline and the room spends exactly BETWEEN_MEMES_MS in REVEAL_BREAK before step 1"
        status: pass
      - kind: unit
        ref: "server/test/ratingStep.integration.test.ts#after the last step closes, the room enters ROUND_END"
        status: pass
    human_judgment: false
  - id: D2
    description: "The number of rating steps equals the number of submissions, not the number of players: a non-submitter is skipped from the rotation entirely and no blank meme is ever shown (D-08), while remaining eligible to rate every other meme."
    requirement: VOTE-04
    verification:
      - kind: unit
        ref: "server/test/rotation.test.ts#skips a player in the roster who never submitted (D-08): five players, three submissions, three-entry rotation"
        status: pass
      - kind: unit
        ref: "server/test/ratingStep.integration.test.ts#a step that closes with two of four eligible raters having rated stores exactly two rating values and an eligibleAtClose of 4 — no value is invented for the silent raters"
        status: pass
    human_judgment: false
  - id: D3
    description: "The reveal order is deterministic (submission-arrival order, computed once at writing close and never re-derived) and a collapse can only ever move a step's deadline earlier, never later; the adjacency case (last rating landing at the deadline instant) advances exactly one step."
    requirement: VOTE-04
    verification:
      - kind: unit
        ref: "server/test/rotation.test.ts#is deterministic: called twice on the same map, both arrays are element-for-element equal"
        status: pass
      - kind: unit
        ref: "server/test/ratingStep.integration.test.ts#collapses the deadline to exactly now + RATING_COLLAPSE_MS when every eligible rater has rated with 6s left on step 0"
        status: pass
      - kind: unit
        ref: "server/test/ratingStep.integration.test.ts#never extends: deadlineAt is exactly unchanged when every eligible rater has rated step 0 with only 800ms left"
        status: pass
      - kind: unit
        ref: "server/test/ratingStep.integration.test.ts#advances exactly one step — never two, never re-opened — when the last eligible rating lands the same instant the deadline would fire"
        status: pass
    human_judgment: false
  - id: D4
    description: "The four submitRating refusal codes (CANNOT_RATE_OWN, RATING_OUT_OF_RANGE, ALREADY_RATED, WRONG_PHASE) are enforced server-side, both at the unit level and over a real socket end to end."
    requirement: VOTE-04
    verification:
      - kind: unit
        ref: "server/test/ratingStep.integration.test.ts#submitRating refuses CANNOT_RATE_OWN for the current step's author"
        status: pass
      - kind: unit
        ref: "server/test/ratingStep.integration.test.ts#submitRating refuses RATING_OUT_OF_RANGE for 0, 4, and a non-integer value"
        status: pass
      - kind: unit
        ref: "server/test/ratingStep.integration.test.ts#submitRating refuses WRONG_PHASE for a stepIndex that is not the room's current step"
        status: pass
      - kind: unit
        ref: "server/test/ratingStep.integration.test.ts#submitRating refuses ALREADY_RATED on a second attempt from the same rater and never changes the stored value"
        status: pass
      - kind: integration
        ref: "server/test/ratingStep.integration.test.ts#reaches step 0 of RATING and refuses CANNOT_RATE_OWN, RATING_OUT_OF_RANGE, ALREADY_RATED and WRONG_PHASE"
        status: pass
    human_judgment: false
  - id: D5
    description: "The rating screen renders the current step's meme, position, and three-tap scale gated on youMayRate; the meme's own author sees a waiting state and no buttons; a rater who has rated sees the rated note and the live X-of-Y count with no per-player value ever shown; REVEAL_BREAK shows only the heading and countdown, no meme content."
    verification:
      - kind: automated_ui
        ref: "npm --prefix client run build (exit 0, includes tsc -b type-checking JSX prop usage)"
        status: pass
    human_judgment: true
    rationale: "The panel's live behavior — three browser windows showing the same meme simultaneously, the author's window genuinely differing from the raters' windows, the rated-count climbing live, and the screen advancing itself when the deadline or the collapse fires — can only really be confirmed in a real multi-window browser session. No real phone/browser is available in this execution environment; this is the plan's own Task 2 human-check."
  - id: D6
    description: "A live countdown ticking down through a real REVEAL_BREAK and a real RATING step, and the visual behavior of the rating buttons/waiting state on a genuinely narrow phone viewport."
    verification: []
    human_judgment: true
    rationale: "setTimeout/Date.now()-based phase-advance timing under a real browser tab, and CSS layout on a real narrow viewport, cannot be proven by a fake-timer unit test or a headless build — Phase 1 and plans 02-01/02-03 all already flagged this exact class of behavior as real-device-only. No real phone/browser is available in this execution environment."

duration: ~20min
completed: 2026-09-06
status: complete
---

# Phase 2 Plan 4: The Rating Rotation and Its Per-Meme Clock Summary

**Submission-derived rating rotation (`rotation.ts`'s `buildRotation`/`eligibleRaters`) walking itself through one meme at a time, each rating step closing on its own server-owned countdown that only ever shortens, with a silent rater contributing nothing and the eligible-rater count at close recorded for Phase 4's scoring decision.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-09-06
- **Tasks:** 3 completed
- **Files modified:** 4 modified, 4 created

## Accomplishments
- `server/src/rooms/rotation.ts` exports `buildRotation` (a round's submissions map -> its rating rotation, in submission-arrival order — literally `[...submissions.keys()]`, since a `Map`'s insertion order already IS that order) and `eligibleRaters` (every connected player except the current step's author).
- `Room.closeWriting` now builds the rotation once from `submissions`; if fewer than `MIN_SUBMISSIONS_TO_RATE` (2) submissions came in, the round skips rating entirely and goes straight to `enterRoundEnd()` (D-09 — plan 02-05 owns that branch's own tests). Otherwise the round enters a 3-second `REVEAL_BREAK`, then rating step 0.
- `Room.enterRatingStep`/`closeRatingStep`/`submitRating`/`maybeCollapseRating` implement the full per-step clock: each step's deadline is measured from the moment the step opens (never from when the preceding break started), a step still closes on time with zero ratings, an early finish (every eligible rater has rated) collapses the deadline to `RATING_COLLAPSE_MS` and never extends it, and `closeRatingStep`'s own `phase === "RATING"` guard makes the rotation advance exactly once even at the exact adjacency instant.
- `Room.ratings` (stepIndex -> raterId -> value) and `Room.eligibleAtClose` (stepIndex -> the eligible count at the moment that step closed) together give Phase 4 everything it needs to choose between a sum and an average without a rework (D-10) — no default value is ever invented for a silent rater.
- The `submit-rating` handler passes `stepIndex`/`value` straight through with zero coercion, matching the established auth-check -> room-lookup -> delegate -> broadcast shape; validation lives entirely inside `Room.submitRating`.
- `client/src/screens/round/RatingPanel.tsx`: renders the current step's position, placeholder content and caption, three rating buttons (gated on `youMayRate`, following the same `socket.once`/cleanup round-trip as `WritingPanel`), the author's waiting message with no buttons at all, the rated note once `youHaveRated`, and the live X-of-Y line — no per-player rating value is ever rendered. `Round.tsx` mounts it only during `RATING`; `REVEAL_BREAK` renders only the heading and countdown.
- 20 new server tests (8 pure-unit on `rotation.ts`, 11 bare-`Room` fake-timer, 1 real-socket with 4 refusal-code assertions) prove every clock and refusal property listed in the plan's `must_haves.truths`.

## Task Commits

Each task was committed atomically:

1. **Task 1: The rotation and the per-meme clock** - `7768f2a` (feat)
2. **Task 2: The rating screen — one meme, three taps, and a waiting state for its author** - `8566fcb` (feat)
3. **Task 3: The rotation and per-step-clock batteries** - `1a53e18` (test)

## Files Created/Modified
- `server/src/rooms/rotation.ts` - new: `buildRotation`, `eligibleRaters`
- `server/src/rooms/Room.ts` - `rotation`/`stepIndex`/`ratings`/`eligibleAtClose` state; `enterRevealBreak`/`enterRatingStep`/`closeRatingStep`/`submitRating`/`maybeCollapseRating`; `closeWriting` rewritten to build the rotation and branch on D-09; `snapshotFor` populates `ratingStep` only during `RATING`
- `server/src/socket/handlers.ts` - the `submit-rating` handler
- `client/src/screens/round/RatingPanel.tsx` - new: the rating screen
- `client/src/screens/Round.tsx` - mounts `RatingPanel` during `RATING`
- `client/src/index.css` - `.rating-panel`, `.rating-tiers`, `.rating-tier` — mobile-first, 44px+ tap targets, wraps rather than scrolling sideways
- `server/test/rotation.test.ts` - new: 8 pure-unit tests on `buildRotation`/`eligibleRaters`
- `server/test/ratingStep.integration.test.ts` - new: 11 bare-`Room` fake-timer tests plus 1 real-socket test (4 refusal-code assertions inside it)

## Decisions Made
- `eligibleRaters` is computed against the full player roster, not the rotation, because eligibility-to-rate and eligibility-to-be-rated are genuinely different questions (see key-decisions above) — proven directly by the two-of-four-eligible test where the two silent raters are non-submitters who are still counted as eligible.
- Added a zero-eligible-raters guard to `maybeCollapseRating`, mirroring plan 02-03's zero-connected-players guard for writing (Rule 2 — a defensive correctness fix with no observable effect in any of this plan's own scenarios).

## Deviations from Plan

None — plan executed exactly as written. The one guard added beyond the plan's literal wording (`maybeCollapseRating`'s `eligible.length > 0` check) is a direct structural mirror of a guard plan 02-03 already added and documented for the same underlying JavaScript trap (`Array.prototype.every` on an empty array is vacuously `true`), so it is not treated as a novel deviation so much as applying an already-established pattern consistently.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness

**Verification results (all commands run and their actual output recorded, not assumed):**
- `npm --prefix server run test -- --run` → **156/156 passed** (baseline 136 + 20 new: 8 in `rotation.test.ts`, 12 in `ratingStep.integration.test.ts`)
- `npm --prefix client run test -- --run` → **34/34 passed** (unchanged from baseline — no client test file was added or touched this plan)
- `npm --prefix server run typecheck` → exits 0, no output
- `npm --prefix client run typecheck` → exits 0, no output
- `npm --prefix client run build` → exits 0, "✓ 62 modules transformed" / "✓ built in ~410-490ms"

**What only a real browser/multi-window check can confirm (not proven here, no real phone/browser available in this execution environment):**
- Task 2's three-window human-check: after writing closes, a short break screen appears before the first meme; all three windows show the SAME meme at the same time; the author's window shows the waiting message and no buttons while the other windows show three tappable buttons; tapping shows the rated note and the X-of-Y count climbs on all three; once every eligible player has rated, the screens move to the next meme about two seconds later; a meme nobody rates still moves on by itself when its countdown reaches zero. The server-side clock and refusal properties are all machine-proven (see coverage D1-D4 above); what's unverified here is purely the *visual* experience of watching it happen live across real devices.
- Whether `.rating-panel`/`.rating-tiers`/`.rating-tier`'s layout stays legible and non-overflowing on a genuinely narrow/older phone viewport, beyond what `vite build`'s CSS output confirms is syntactically valid.

**Explicitly deferred to Phase 4 (per this plan's own phase boundary, ROADMAP.md, and D-10's flag) — NOT built here:**
- Real scoring math (sum vs. average vs. some floor for a step rated while some eligible raters were away) — the engine only guarantees `ratings`/`eligibleAtClose` are recorded so Phase 4 can decide without a rework.
- The ranked round-results screen and the scoreboard.
- The funny Hebrew tier names for the 1/2/3 scale — `RatingPanel` uses the placeholder digit labels `HEBREW_UI.ratingTierPlaceholder1/2/3`, exactly as this phase's `planner_discretion_notes` and CONTEXT.md's Deferred Ideas specify.
- Real photos of Tamir and photo-swap logic — `RatingPanel` renders `HEBREW_UI.placeholderContentPrefix` plus a numbered `placeholderId`, matching `WritingPanel`'s existing placeholder-content pattern; Phase 3 swaps this for the real image.
- Author identity for raters — `RatingStepView` deliberately carries `youAreAuthor` (a personalized boolean) and no `authorId`/`authorName`, so a rater cannot see whose meme they are rating mid-step (see `planner_discretion_notes` in the PLAN — flagged there as a discretionary call, not a locked decision, in case the intent was for authorship to be visible).

**Ready for 02-05 (round/game end):** `Room.ratings` and `Room.eligibleAtClose` are exactly the per-step data plan 02-05's `RoundEndEntry`/`RoundEndView` need (author id/name and caption are already retrievable from `rotation[stepIndex]`/`submissions`); `closeRatingStep`'s `enterRoundEnd()` call at the end of the rotation is the exact seam 02-05 hangs its round-end view off of. The D-09 skip-to-`enterRoundEnd()` branch in `closeWriting` (fewer than 2 submissions) is implemented here but its own tests are explicitly plan 02-05's responsibility per this plan's own `<action>` text.

**No blockers.**

## Self-Check: PASSED

All 4 created files confirmed present on disk; all 3 task commit hashes (`7768f2a`, `8566fcb`, `1a53e18`) confirmed present in git history.

---
*Phase: 02-server-authoritative-round-engine*
*Completed: 2026-09-06*
