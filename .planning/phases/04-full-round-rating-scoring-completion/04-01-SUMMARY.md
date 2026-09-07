---
phase: 04-full-round-rating-scoring-completion
plan: 01
subsystem: api
tags: [socket.io, vitest, react, hebrew-rtl, photo-assignment, scoring]

# Dependency graph
requires:
  - phase: 03-core-loop-checkpoint-real-phones-end-to-end
    provides: "photos.ts's assignPhotos/photoUrl/PHOTO_FILENAMES, Room.photoAssignments/photoUrlFor, and applyRoundScores/buildRoundEndView's raw ratings/eligibleAtClose maps — this plan extends all four directly"
provides:
  - "photos.ts — assignPhotosFromEligiblePools and drawOnePhoto, the per-player eligible-pool draw and single-photo picker ROUND-02/ROUND-06 build on"
  - "Room.photosSeenByPlayer/swapUsed/eligiblePoolFor/markPhotoSeen/drawPhotosForRound/swapPhoto — cross-game no-repeat photo tracking with graceful reset, and the one-time instant photo swap"
  - "Room.buildRoundEndView's new score field — the server-computed real point total per meme (VOTE-06)"
  - "shared/protocol.ts CLIENT_EVENTS.swapPhoto / LobbySnapshot.youCanSwapPhoto / RoundEndEntry.score / ErrorCode.SWAP_ALREADY_USED"
  - "WritingPanel.tsx's swap button and RoundEndPanel.tsx's real score-ranked entries"
affects: [phase-4-winner-and-best-of-night, phase-4-plan-02]

# Actuals (#2632)
actuals:
  tokens: 12287
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "A per-player eligible pool is computed lazily (Room.eligiblePoolFor) rather than precomputed and stored — the seen-set is the only persisted state, and the pool filter (plus its own-set reset once exhausted) is recomputed fresh every draw, so there is exactly one place the exhaustion/reset rule can ever diverge from what actually gets drawn."
    - "swapPhoto follows the exact same typed-outcome shape (SwapPhotoOutcome) every other mutating Room method already uses — ok:true with a payload, or ok:false with a closed error-code union — and the swap-photo socket handler is a line-for-line copy of the no-payload startGame handler shape."
    - "A round-clock reduction to a score (VOTE-06) is applied at the exact chokepoint the round-end view itself is built (buildRoundEndView), computing `values` once and reusing it for both the existing raw `ratings` field and the new `score` field — no other file ever re-derives a meme's score from its raw ratings array."

key-files:
  created:
    - server/test/photoSwap.integration.test.ts
    - server/test/noRepeatPhotos.integration.test.ts
    - server/test/ratingPrivacy.integration.test.ts
  modified:
    - server/src/rooms/photos.ts
    - server/src/rooms/Room.ts
    - shared/protocol.ts
    - shared/messages.ts
    - server/src/socket/handlers.ts
    - client/src/screens/round/WritingPanel.tsx
    - client/src/screens/round/RoundEndPanel.tsx
    - client/src/index.css
    - server/test/photos.test.ts

key-decisions:
  - "Task 2's multi-round exhaustion test specified 'exactly 2 real players', which conflicts with MIN_PLAYERS_TO_START=3 — used 3 players instead (only one ever submits per round), preserving the test's actual intent without changing production code."
  - "Task 1's tracer test has both eligible non-author raters vote the same value per step (3 for step 0, 1 for step 1) rather than a single voter, so the RATING_COLLAPSE_MS early-finish path triggers deterministically and the test completes in real time (~13s) instead of waiting out a full default ratingSeconds twice."

requirements-completed: [ROUND-02, ROUND-06, VOTE-03, VOTE-05, VOTE-06]

coverage:
  - id: D1
    description: "A player can swap their assigned photo exactly once per round, instantly and with no preview, before submitting — never after submission or after their one swap is used."
    requirement: ROUND-06
    verification:
      - kind: integration
        ref: "server/test/photoSwap.integration.test.ts#swaps instantly, locks after one use, refuses once WRITING closes, and ranks round results by real distinguishable scores"
        status: pass
      - kind: unit
        ref: "server/test/noRepeatPhotos.integration.test.ts#swapPhoto refuses SWAP_ALREADY_USED on a second attempt in the same round, and photoAssignments is unchanged by the refused attempt"
        status: pass
      - kind: unit
        ref: "server/test/noRepeatPhotos.integration.test.ts#swapPhoto refuses ALREADY_SUBMITTED once submitCaption has succeeded for that player, even if their one swap was never used"
        status: pass
    human_judgment: false
  - id: D2
    description: "No player is assigned a photo they've already seen this game until they've seen every photo in the pool at least once, at which point their own seen-set gracefully resets and repeats become possible again."
    requirement: ROUND-02
    verification:
      - kind: integration
        ref: "server/test/noRepeatPhotos.integration.test.ts#a single player run through more rounds than PHOTO_FILENAMES.length never repeats a photo until every real photo has been shown once, then gracefully allows a repeat"
        status: pass
      - kind: unit
        ref: "server/test/photos.test.ts (assignPhotosFromEligiblePools: disjoint pools, shared single-filename pool degradation, empty input, three-player distinct draw)"
        status: pass
    human_judgment: false
  - id: D3
    description: "A photo swap draws from the player's own not-yet-seen pool wherever the pool allows it, never handing back a photo they've already seen this game."
    requirement: ROUND-02
    verification:
      - kind: integration
        ref: "server/test/noRepeatPhotos.integration.test.ts#swapPhoto draws its replacement from the player's own not-yet-seen pool, excluding photos already recorded in their photosSeenByPlayer set wherever the pool allows it"
        status: pass
    human_judgment: false
  - id: D4
    description: "A meme's author still cannot rate their own meme, and sees the existing waiting state (youAreAuthor true, youMayRate false) — unbroken by this plan's changes."
    requirement: VOTE-03
    verification:
      - kind: integration
        ref: "server/test/ratingPrivacy.integration.test.ts (VOTE-03 smoke-check: authorSnapshotAtOpen.ratingStep.youAreAuthor===true, youMayRate===false)"
        status: pass
    human_judgment: false
  - id: D5
    description: "While a meme's rating step is open, no individual player's rating value or per-rater identity is present anywhere in any player's snapshot — only a live rated/eligible count — and the real total score is revealed only once that step closes."
    requirement: VOTE-05
    verification:
      - kind: integration
        ref: "server/test/ratingPrivacy.integration.test.ts#carries only the nine documented ratingStep keys throughout, hides roundEnd until close, and reveals the exact real score once closed"
        status: pass
    human_judgment: false
  - id: D6
    description: "The round-results screen ranks that round's memes by their real total score, highest first, with author identity still visible — replacing the rater-count placeholder."
    requirement: VOTE-06
    verification:
      - kind: integration
        ref: "server/test/photoSwap.integration.test.ts (rankedEntries[0].score=6 > rankedEntries[1].score=2, matching the two authors' real distinguishable totals)"
        status: pass
      - kind: automated_ui
        ref: "npm --prefix client run build (RoundEndPanel.tsx's rankedEntries sort and .round-end-score render type-check against RoundEndEntry.score)"
        status: pass
    human_judgment: true
    rationale: "RoundEndPanel.tsx's visual rendering of the ranked list (author identity still visible, score displayed with the correct Hebrew suffix, no layout regression) is a rendering property no test in this plan asserts against a live DOM — confirmed by code review against the plan's own prohibitions; a human UAT pass over the rendered screen is the stronger check, consistent with 03-01-SUMMARY.md's own D4 precedent for RoundEndPanel.tsx."

# Metrics
duration: ~35min
completed: 2026-09-07
status: complete
---

# Phase 4 Plan 1: Photo Swap, No-Repeat Tracking & Real Ranked Round Results Summary

**Per-player cross-game no-repeat photo tracking with graceful pool-exhaustion reset, a one-time instant photo swap that locks on submit, and round-results ranking by a real server-computed point total — all proven end to end over real sockets.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-09-07T04:35:00Z
- **Completed:** 2026-09-07T04:52:00Z
- **Tasks:** 3 completed
- **Files modified:** 9 modified, 3 created

## Accomplishments
- `server/src/rooms/photos.ts` gained `drawOnePhoto` (a single uniform-random pick) and `assignPhotosFromEligiblePools` (ROUND-02's per-player draw: each player draws from their OWN eligible pool, falling back to a within-round repeat only once every eligible photo for that player has already been claimed by an earlier player in the same draw) — `assignPhotos` itself is completely untouched.
- `Room.ts` gained `photosSeenByPlayer`/`swapUsed` state, `eligiblePoolFor` (filters the real pool down to a player's not-yet-seen photos, resetting their own seen-set once they've seen everything — the deliberate graceful degradation for a small photo pool), `markPhotoSeen`, `drawPhotosForRound` (the new chokepoint `enterWriting` and `photoUrlFor`'s late-joiner fallback both route through), and `swapPhoto` (ROUND-06/D-01/D-02: refuses `WRONG_PHASE` outside WRITING, `ALREADY_SUBMITTED` once the caption has locked in, `SWAP_ALREADY_USED` on a second attempt; otherwise draws a real, different, not-yet-seen photo instantly with no preview).
- `Room.buildRoundEndView` now computes each meme's real `score` (a plain sum of that step's ratings) once, alongside the existing raw `ratings` array — its own doc comment was rewritten to say VOTE-06 has made the sum-highest-first decision Phase 3 explicitly deferred.
- `shared/protocol.ts`/`shared/messages.ts`: `SWAP_ALREADY_USED` error code and Hebrew message, `CLIENT_EVENTS.swapPhoto`, `LobbySnapshot.youCanSwapPhoto`, `RoundEndEntry.score`, and the `swapPhotoButton`/`roundResultsPointsSuffix` Hebrew UI strings.
- `server/src/socket/handlers.ts`: a new `swap-photo` handler, a line-for-line copy of the existing no-payload `start-game` handler's shape, identity taken exclusively from `socket.data.playerId`.
- `client/src/screens/round/WritingPanel.tsx`: a `handleSwap` function copying `handleSubmit`'s exact once-listener/cleanup pattern, and a swap button rendered only when `snapshot.youCanSwapPhoto` is true.
- `client/src/screens/round/RoundEndPanel.tsx`: `rankedEntries` sorts `roundEnd.entries` by `entry.score` descending (never computed client-side) and renders the real point total with `HEBREW_UI.roundResultsPointsSuffix`, replacing the rater-count placeholder line.
- `client/src/index.css`: `.swap-photo-button` (outlined secondary button, inherits the 44px tap-target floor) and `.round-end-score` (matches `.writing-progress`'s "important number" weight/word-spacing convention).
- Three new test files prove the whole plan end to end: `photoSwap.integration.test.ts` (real sockets — instant swap, one-time lock, WRITING-bounded refusal, and real distinguishable round-results ranking), `noRepeatPhotos.integration.test.ts` (bare-Room, fake timers — more rounds than photos with graceful reset, swap excludes seen photos, both swap refusal paths), and `ratingPrivacy.integration.test.ts` (real sockets — VOTE-05's exact nine-key `ratingStep` whitelist proven both at open and immediately after a rating is cast, `roundEnd` null while open, the real score revealed only on close; VOTE-03's `youAreAuthor`/`youMayRate` contract smoke-checked unbroken). `photos.test.ts` also gained direct unit coverage of `assignPhotosFromEligiblePools`/`drawOnePhoto`.

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end photo integrity — no-repeat tracking, one-time swap, real ranked round results** - `8ea7ab7` (feat)
2. **Task 2: Hardening — no-repeat photos across more rounds than photos, and swap edge cases** - `320cefb` (test)
3. **Task 3: Verify VOTE-03 still holds and prove VOTE-05's hidden-until-close guarantee structurally** - `2a99077` (test)

**Plan metadata:** committed alongside this SUMMARY.

## Files Created/Modified
- `server/src/rooms/photos.ts` - `assignPhotosFromEligiblePools`, `drawOnePhoto` (new exports beside the unchanged `assignPhotos`)
- `server/src/rooms/Room.ts` - `photosSeenByPlayer`, `swapUsed`, `eligiblePoolFor`, `markPhotoSeen`, `drawPhotosForRound`, `swapPhoto`, `SwapPhotoOutcome`; `buildRoundEndView`'s new `score` field
- `shared/protocol.ts` - `ErrorCode.SWAP_ALREADY_USED`, `CLIENT_EVENTS.swapPhoto`, `LobbySnapshot.youCanSwapPhoto`, `RoundEndEntry.score`
- `shared/messages.ts` - `HEBREW_ERRORS.SWAP_ALREADY_USED`, `HEBREW_UI.swapPhotoButton`/`roundResultsPointsSuffix`
- `server/src/socket/handlers.ts` - new `swap-photo` handler
- `client/src/screens/round/WritingPanel.tsx` - `handleSwap`, the swap button
- `client/src/screens/round/RoundEndPanel.tsx` - `rankedEntries` sorted by `entry.score` descending, real point display
- `client/src/index.css` - `.swap-photo-button`, `.round-end-score`
- `server/test/photoSwap.integration.test.ts` - new: the tracer's real-socket proof (swap + ranked results)
- `server/test/noRepeatPhotos.integration.test.ts` - new: multi-round exhaustion/reset and swap edge cases
- `server/test/ratingPrivacy.integration.test.ts` - new: VOTE-05 structural proof and VOTE-03 smoke-check
- `server/test/photos.test.ts` - new `assignPhotosFromEligiblePools`/`drawOnePhoto` unit coverage

## Decisions Made
See `key-decisions` in the frontmatter: Task 2 used 3 players instead of the plan's literal "2" (MIN_PLAYERS_TO_START conflict); Task 1's tracer test has both eligible raters per step vote the same value to trigger the deterministic early-finish collapse and keep real-socket test runtime bounded (~13s).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Task 2's multi-round exhaustion test used 3 players instead of the plan's specified 2**
- **Found during:** Task 2 (writing `noRepeatPhotos.integration.test.ts`)
- **Issue:** The plan's action text says "start a room with exactly 2 real players," but `Room.startGame` refuses with `NOT_ENOUGH_PLAYERS` below `MIN_PLAYERS_TO_START` (3) — a 2-player room could never reach WRITING.
- **Fix:** Used 3 real players; only one of them (`target`) ever submits a caption each round, preserving the test's actual intent (repeated single-submission rounds, D-09 skip, exhaustion/reset over more rounds than photos) without any production-code change.
- **Files modified:** `server/test/noRepeatPhotos.integration.test.ts`
- **Verification:** Test passes; confirmed `MIN_PLAYERS_TO_START = 3` in `server/src/config.ts` is unrelated to and unaffected by this plan.
- **Committed in:** `320cefb` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking — plan's literal player count would have made `startGame` fail).
**Impact on plan:** No production-code change; a test-construction detail only. No scope creep.

## Issues Encountered
None beyond the deviation above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness

**Verification results (all commands run and their actual output recorded, not assumed):**
- `npm --prefix server run test -- --run` → **190/190 passed** (baseline 178 + 1 tracer + 6 photos.test.ts additions + 4 noRepeatPhotos + 1 ratingPrivacy)
- `npm --prefix client run test -- --run` → **34/34 passed** (unchanged — no client test file touched this plan)
- `npm --prefix server run typecheck` → exits 0, no output
- `npm --prefix client run build` → exits 0, "✓ 63 modules transformed" / "✓ built in ~400-550ms"
- `grep -c "swapPhotoButton" client/src/screens/round/WritingPanel.tsx` → `1`

**Threat model — mitigations confirmed in the implementation, not just declared:**
| Threat | Mitigation | Confirmed by |
|---|---|---|
| T-04-01 (swap identity forgery) | `swapPhoto(data.playerId)` reads identity exclusively from `socket.data.playerId`; the `swap-photo` payload carries no identity field | Code review of `server/src/socket/handlers.ts`'s new handler — matches every other handler's identity rule |
| T-04-02 (swap phase/lock bypass) | D-02's lock-on-submit and one-swap-per-round are both enforced server-side inside `Room.swapPhoto` before any mutation | `photoSwap.integration.test.ts` (SWAP_ALREADY_USED, WRONG_PHASE-after-writing); `noRepeatPhotos.integration.test.ts` (SWAP_ALREADY_USED unchanged assignment, ALREADY_SUBMITTED) |
| T-04-03 (score field disclosure, accepted) | `RoundEndEntry.score` only reveals a meme's own aggregate total, gated by the existing `roundEnd` phase check — never an individual rater's value | `ratingPrivacy.integration.test.ts` proves `roundEnd` stays null until close and `ratingStep` never carries a per-rater field |
| T-04-04 (VOTE-05 regression, mitigate) | `snapshotFor`'s RATING branch is unchanged by this plan | `ratingPrivacy.integration.test.ts`'s exact nine-key structural assertion, both at open and immediately after a rating is cast |
| T-04-SC (package install) | No new package installed — no `package.json`/lockfile change in this plan | `git diff --stat` confirms no `package.json`/`package-lock.json` touched |

**What only a real phone can confirm (not proven here):** The swap button's visual placement and tap-target feel on a real phone screen, and whether the round-results screen's new score display reads clearly at a glance in a loud room — matches 03-01-SUMMARY.md's own carried-forward note that this sandboxed environment has no physical phones reachable (reports a documentation-range IP, not a dialable LAN address). Everything the server-side mechanics depend on is proven above.

**Ready for Plan 04-02:** VOTE-06's real per-meme score (`RoundEndEntry.score`) is exactly what the winner and best-of-the-night screens (SCORE-04/MEME-02) need to read — no rework required. `Player.score`'s accumulation (`applyRoundScores`, untouched by this plan) remains the sole running-total mutation site.

## Self-Check: PASSED

All 3 created test files confirmed present on disk; all three task commit hashes (`8ea7ab7`, `320cefb`, `2a99077`) confirmed present in git history via `git log --oneline`.

---
*Phase: 04-full-round-rating-scoring-completion*
*Completed: 2026-09-07*
