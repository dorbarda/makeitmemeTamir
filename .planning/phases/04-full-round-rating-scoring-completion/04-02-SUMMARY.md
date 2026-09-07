---
phase: 04-full-round-rating-scoring-completion
plan: 02
subsystem: api
tags: [socket.io, vitest, react, hebrew-rtl, scoring, game-end]

# Dependency graph
requires:
  - phase: 04-full-round-rating-scoring-completion (plan 01)
    provides: "RoundEndEntry.score (VOTE-06's real per-meme point total) and applyRoundScores' untouched running-total accumulation — this plan's updateBestOfNight/buildGameEndView read both directly, inventing no new source of truth"
provides:
  - "shared/protocol.ts — BestOfEntry, GameEndView, and LobbySnapshot.gameEnd (GAME_END-only)"
  - "server/src/rooms/Room.ts — bestOfNight (the running top-3, mutated only by updateBestOfNight), updateBestOfNight (called once, immediately after applyRoundScores, from enterRoundEnd), buildGameEndView (every tied top scorer, no tiebreaker)"
  - "client/src/screens/round/GameEndPanel.tsx — the dedicated GAME_END screen: winner banner, scoreboard, best-of-the-night list"
  - "Round.tsx's split ROUND_END/GAME_END panel mounting — RoundEndPanel and GameEndPanel are now fully independent"
affects: []

# Actuals (#2632)
actuals:
  tokens: 8739
  tasks: 3
  commits: 2

tech-stack:
  added: []
  patterns:
    - "A running top-N list (bestOfNight) is maintained by mutating in place at the exact same chokepoint the round's own score mutation already runs (enterRoundEnd, right after applyRoundScores) — push this round's new entries, re-sort the whole (small, capped) list, then truncate. No history table, no re-scan, no cache invalidation to get wrong."
    - "A tied-winner computation (buildGameEndView) is a pure, uncached read of the room's own live Player.score values, computed fresh on every snapshotFor call — cheap enough at this player-count that no incremental tracking is needed for winners, only for the top-3 memes list."
    - "GameEndPanel.tsx is a sibling of RoundEndPanel.tsx, not an extension of it — matching the codebase's established one-component-per-file convention and deliberately avoiding the Phase 3 duplicate-player-list bug class by keeping GAME_END's player-listing surface (winner banner + scoreboard) in exactly one component, never two."

key-files:
  created:
    - client/src/screens/round/GameEndPanel.tsx
    - server/test/gameEnd.integration.test.ts
    - server/test/bestOfNight.integration.test.ts
  modified:
    - shared/protocol.ts
    - shared/messages.ts
    - server/src/rooms/Room.ts
    - client/src/screens/Round.tsx
    - client/src/screens/round/RoundEndPanel.tsx
    - client/src/index.css
    - server/test/neverStalls.integration.test.ts

key-decisions:
  - "GameEndPanel.tsx is a brand-new component rather than an extension of RoundEndPanel.tsx, per this plan's own explicit architectural instruction — this is what keeps RoundEndPanel.tsx scoped to ROUND_END only and avoids reintroducing the duplicate-roster bug class Phase 3's real-phone playtest found and fixed."
  - "This sandboxed environment has no reachable physical phone: the machine's own LAN-facing address resolves to 192.0.2.2, a TEST-NET-1 documentation-range IP (RFC 5737), not a dialable LAN address — matching the identical carried-forward limitation already documented in 03-01-SUMMARY.md and 04-01-SUMMARY.md. Task 3's real-device human-check could not be performed; the automated /health check and the full regression suite were run and passed instead."
  - "Fixed a pre-existing assertion in neverStalls.integration.test.ts that read `roundEnd` at GAME_END — this plan's own Task 1 intentionally scoped `roundEnd` to ROUND_END only (with `gameEnd` now GAME_END's dedicated view), so the test's zero-submissions D-09 proof was updated to assert `gameEnd.bestOfNight` is empty instead."

requirements-completed: [SCORE-02, SCORE-04, MEME-02]

coverage:
  - id: D1
    description: "Once the last round ends, every player tied for the single highest score is shown as a winner in a dedicated winner banner — never just one on a tie."
    requirement: SCORE-04
    verification:
      - kind: integration
        ref: "server/test/gameEnd.integration.test.ts#winners lists the sole highest scorer and bestOfNight carries both this game's real memes, ranked by real score"
        status: pass
      - kind: unit
        ref: "server/test/bestOfNight.integration.test.ts#two players tied for the highest (non-zero) score both appear in gameEnd.winners; a lower-scoring third player does not"
        status: pass
      - kind: unit
        ref: "server/test/bestOfNight.integration.test.ts#a game where every round is skipped for too few captions (D-09) reaches GAME_END with every player as a winner, each scoring 0, and no crash"
        status: pass
    human_judgment: true
    rationale: "The tests above prove the server computes and delivers the correct winners array (including a real tie and the all-zero edge case), and GameEndPanel.tsx's render logic type-checks against it (npm --prefix client run build), but no test asserts the winner banner's actual rendered DOM — its visual prominence, RTL word order in 'Name — N points', and layout on a narrow phone viewport are rendering properties only a human can confirm, matching the precedent set by 04-01-SUMMARY.md's D6 for RoundEndPanel.tsx."
  - id: D2
    description: "A 'best of the night' screen shows the real top 3 highest-scoring individual memes from across the whole game — photo, caption, author, and score — built incrementally round by round rather than recomputed by re-scanning history."
    requirement: MEME-02
    verification:
      - kind: integration
        ref: "server/test/gameEnd.integration.test.ts#winners lists the sole highest scorer and bestOfNight carries both this game's real memes, ranked by real score"
        status: pass
      - kind: unit
        ref: "server/test/bestOfNight.integration.test.ts#bestOfNight never exceeds length 3 and evicts the lowest-scoring entry as strictly higher-scoring memes arrive across more than 3 rounds"
        status: pass
      - kind: unit
        ref: "server/test/bestOfNight.integration.test.ts#when a new candidate's score exactly ties the current #3 survivor's score, the earlier-inserted entry keeps the slot and the new tied candidate is dropped"
        status: pass
      - kind: unit
        ref: "server/test/bestOfNight.integration.test.ts#a game with no rated memes at all reaches GAME_END with bestOfNight exactly empty, never padded or fabricated"
        status: pass
    human_judgment: true
    rationale: "The tests above prove updateBestOfNight tracks the real top-3 incrementally (cap, eviction, boundary-tie stability, empty case) with real photo/caption/author/score content reaching the client, but GameEndPanel.tsx's rendered best-of list (real photos loading, caption wrapping, layout on a narrow phone) is unverified by any test in this plan and was also the one item Task 3's real-device human-check could not confirm in this sandboxed environment (see Next Phase Readiness)."
  - id: D3
    description: "The running score total keeps accumulating into every player's total exactly as it already did (applyRoundScores, unchanged) across a full multi-round game, confirmed coherent end to end — no redesign."
    requirement: SCORE-02
    verification:
      - kind: unit
        ref: "server/test/scoring.integration.test.ts (pre-existing, unchanged by this plan — confirms the sum-across-rounds contract this plan's winners/bestOfNight logic reads from)"
        status: pass
      - kind: integration
        ref: "server/test/gameEnd.integration.test.ts and server/test/bestOfNight.integration.test.ts (both re-exercise Player.score accumulation as a precondition for their own winner/best-of assertions)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The complete Phase 4 feature set (swap, ranked round results, winner screen with ties, best-of-the-night) confirmed working on a real phone."
    verification: []
    human_judgment: true
    rationale: "This sandboxed environment has no reachable physical phone (LAN IP resolves to the documentation-range address 192.0.2.2, per RFC 5737) — matches the identical limitation already carried forward in 03-01-SUMMARY.md and 04-01-SUMMARY.md. The full automated regression suite (server tests, server typecheck, client typecheck, client tests, client build) was run and passed, and the server's own /health endpoint was confirmed reachable, but the human-check itself could not be performed here."

# Metrics
duration: ~40min
completed: 2026-09-07
status: complete
---

# Phase 4 Plan 2: Winner Screen With Ties and Incrementally-Tracked Best-of-the-Night Summary

**A dedicated GameEndPanel shows every player tied for the highest score (no tiebreaker) and a real, incrementally-tracked top-3 best-of-the-night list — both server-computed and proven end to end over real sockets, closing out Phase 4's game loop.**

## Performance

- **Duration:** ~40 min
- **Started:** 2026-09-07T04:58:00Z
- **Completed:** 2026-09-07T05:08:00Z
- **Tasks:** 3 completed
- **Files modified:** 7 modified, 3 created

## Accomplishments
- `shared/protocol.ts` gained `BestOfEntry` (author/caption/photo/score) and `GameEndView` (`winners` + `bestOfNight`); `LobbySnapshot.gameEnd` is now populated only in `GAME_END`, while `roundEnd` was narrowed to `ROUND_END`-only — the two views are now fully independent.
- `Room.ts` gained `bestOfNight` (the running top-3, `<= 3` entries, always sorted highest-first, mutated exclusively by `updateBestOfNight()`), `updateBestOfNight()` (called once, immediately after `applyRoundScores()`, inside `enterRoundEnd()` — never re-derived from round history, relying on `Array.prototype.sort`'s guaranteed stability so a later tie at the eviction boundary never displaces an earlier survivor), and `buildGameEndView()` (every player whose score equals the room's own max score, with zero tiebreaker logic, reading `bestOfNight` but never recomputing it).
- `shared/messages.ts` gained `winnerHeading`, `bestOfNightHeading`, and `bestOfNightEmpty` Hebrew UI strings.
- `client/src/screens/round/GameEndPanel.tsx` — a brand-new component (not an extension of `RoundEndPanel.tsx`), rendering the winner banner (every tied winner), the same scoreboard section `RoundEndPanel.tsx` already established (copied, not imported), and the best-of-the-night list (real photo, caption, author, score, capped at 3, with an explicit empty-state message).
- `client/src/screens/Round.tsx` now mounts `RoundEndPanel` for `ROUND_END` only and `GameEndPanel` for `GAME_END` only, replacing the single combined conditional; `PANEL_ALREADY_LISTS_PLAYERS` needed no change since it already suppressed the baseline roster for both phases.
- `client/src/screens/round/RoundEndPanel.tsx`'s doc comment updated to describe its narrowed ROUND_END-only scope — no behavioral change.
- `client/src/index.css` gained `.game-end-panel`, `.winner-banner`, `.winner-list`, `.winner-entry`, `.best-of-night`, `.best-of-list`, `.best-of-entry`, `.best-of-meta` — all mobile-first, no fixed pixel widths, no letter-spacing on Hebrew text.
- Two new test files prove the whole plan end to end: `server/test/gameEnd.integration.test.ts` (real sockets — a played-out one-round game's real winner and real best-of-the-night content, matching the exact submitted captions/photos/scores) and `server/test/bestOfNight.integration.test.ts` (bare-`Room`, fake timers — a real tie for first excluding a lower scorer, the all-D-09-skipped all-zero-winners edge case, the length-3 cap with correct eviction across 4+ rounds, the eviction-boundary tie keeping the earlier survivor, and the zero-rated-memes empty case).
- Fixed a pre-existing `neverStalls.integration.test.ts` assertion broken by this plan's own intentional `roundEnd`/`gameEnd` split (see Deviations below).

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end game conclusion — winner(s) with ties and the incrementally-tracked best-of-the-night** - `cd91834` (feat)
2. **Task 2: Hardening — ties, the best-of eviction order, and the zero-memes edge case** - `9580b99` (test)
3. **Task 3: Full regression, start the server, and a real-device check across the whole phase** - no source changes; verification-only (see Verification below)

**Plan metadata:** committed alongside this SUMMARY.

## Files Created/Modified
- `shared/protocol.ts` - `BestOfEntry`, `GameEndView`, `LobbySnapshot.gameEnd`
- `shared/messages.ts` - `HEBREW_UI.winnerHeading`/`bestOfNightHeading`/`bestOfNightEmpty`
- `server/src/rooms/Room.ts` - `bestOfNight`, `updateBestOfNight`, `buildGameEndView`; `snapshotFor`'s split `roundEnd`/`gameEnd`
- `client/src/screens/round/GameEndPanel.tsx` - new: winner banner, scoreboard, best-of-the-night list
- `client/src/screens/Round.tsx` - split `RoundEndPanel`/`GameEndPanel` mounting, updated doc comments
- `client/src/screens/round/RoundEndPanel.tsx` - doc comment only, narrowed to ROUND_END
- `client/src/index.css` - `.game-end-panel`, `.winner-banner`, `.winner-list`, `.winner-entry`, `.best-of-night`, `.best-of-list`, `.best-of-entry`, `.best-of-meta`
- `server/test/gameEnd.integration.test.ts` - new: real-socket end-to-end winner/best-of proof
- `server/test/bestOfNight.integration.test.ts` - new: tie, cap, boundary-tie, all-zero, empty edge cases
- `server/test/neverStalls.integration.test.ts` - fixed a `roundEnd`-at-`GAME_END` assertion broken by this plan's own protocol split

## Decisions Made
See `key-decisions` in the frontmatter: `GameEndPanel.tsx` built as a sibling component per the plan's own architectural instruction; the real-device check could not be performed in this sandboxed environment (documentation-range IP); a pre-existing test was fixed to match this plan's intentional `roundEnd`/`gameEnd` split.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed a pre-existing test assertion broken by this plan's own `roundEnd`/`gameEnd` split**
- **Found during:** Task 3 (full regression run)
- **Issue:** `server/test/neverStalls.integration.test.ts`'s D-09 zero-submissions test asserted `room.snapshotFor(players[0].id).roundEnd?.entries` equals `[]` at `GAME_END` — correct under the OLD contract (where `roundEnd` was populated for both `ROUND_END` and `GAME_END`), but this plan's own Task 1 intentionally narrowed `roundEnd` to `ROUND_END`-only, so at `GAME_END` it is now `null` and the assertion failed with "expected undefined to deeply equal []".
- **Fix:** Updated the assertion to check `roundEnd` is `null` and `gameEnd?.bestOfNight` equals `[]` instead — the semantically equivalent proof under the new contract that a zero-submissions game reaches `GAME_END` with nothing fabricated.
- **Files modified:** `server/test/neverStalls.integration.test.ts`
- **Verification:** Full server suite passes (196/196, up from the pre-fix 195/196 with this one failure).
- **Committed in:** `9580b99` (Task 2 commit — the fix was made and verified alongside Task 2's own hardening tests, before Task 3's regression pass)

---

**Total deviations:** 1 auto-fixed (1 bug — a test asserting behavior this plan's own PLAN.md explicitly instructed changing).
**Impact on plan:** No production-code change beyond what the plan specified; a test-only fix required to keep the "no regressions" acceptance criterion honest. No scope creep.

## Issues Encountered
None beyond the deviation above.

## User Setup Required
None - no external service configuration required.

## Verification

Full regression suite, run in the order Task 3 specifies, with actual output recorded (not assumed):

- `npm --prefix server run test -- --run` → **196/196 passed** (baseline 190 + 1 gameEnd tracer test + 5 bestOfNight hardening tests)
- `npm --prefix server run typecheck` → exits 0, no output
- `npm --prefix client run typecheck` → exits 0, no output
- `npm --prefix client run test -- --run` → **34/34 passed** (unchanged — no client test file touched this plan)
- `npm --prefix client run build` → exits 0, "✓ 64 modules transformed" / "✓ built in ~400-450ms"
- `grep -c "GameEndPanel" client/src/screens/Round.tsx` → `4` (import + doc comments + mount)
- Server started (`npm --prefix server run start`) and confirmed reachable: `node -e "fetch('http://localhost:3001/health')..."` → `{"ok":true}`
- Server stopped cleanly after the health check (no background process left running)

**What the real-device human-check could NOT confirm in this sandboxed environment:** This machine's own LAN-facing address resolves to `192.0.2.2` — a TEST-NET-1 documentation-range IP per RFC 5737, not a dialable address any real phone on a real WiFi network could reach. This is the identical carried-forward limitation already documented in `03-01-SUMMARY.md` and `04-01-SUMMARY.md`. As a result, none of the following could be confirmed on an actual phone in this session:
- The swap-photo button's instant replace, submit-lock, and one-swap-per-round refusal (D-01/D-02) — visual/interaction confirmation only, mechanics already proven server-side in 04-01
- The round-results screen's highest-first ordering and plain point display reading clearly at a glance on a real phone screen
- The winner banner's visual prominence and correct rendering of a real tie (both tied names + scores, RTL word order) on a narrow viewport
- The best-of-the-night section's real photos and captions loading and laying out correctly, capped at 3 entries, on a real phone
- Whether anything freezes, crashes, or shows mismatched content between two real devices mid-game

Everything server-side these screens depend on (real winner computation including ties, real incrementally-tracked best-of-the-night with correct capping/eviction/boundary-tie behavior, real running score accumulation) is proven above by the automated suite, matching this project's own established pattern (per `04-CONTEXT.md`'s canonical refs) of never trusting a UI change to a green test suite alone — this gap is being surfaced explicitly, not silently treated as "done."

## Next Phase Readiness

**Threat model — mitigations confirmed in the implementation, not just declared:**

| Threat | Mitigation | Confirmed by |
|---|---|---|
| T-04-05 (Player.score tampering via winners) | `buildGameEndView` reads `Player.score`, still written exclusively by `applyRoundScores` — no new write path | Code review of `Room.ts`; `bestOfNight.integration.test.ts`'s tie test confirms winners reflect real accumulated scores |
| T-04-06 (Room.bestOfNight tampering) | `updateBestOfNight()` is a private method called only from `enterRoundEnd()`, itself only reachable from the server's own phase timers — no `CLIENT_EVENTS` member touches it | Code review of `Room.ts` and `handlers.ts` (no new socket handler added by this plan) |
| T-04-07 (BestOfEntry disclosure, accepted) | MEME-02's own intended reveal — no player-identifying data beyond a display name already visible on every roster | `gameEnd.integration.test.ts` confirms `authorName`/`caption`/`photoUrl` are exactly the real submitted values, nothing more |
| T-04-SC (package install) | No new package installed — no `package.json`/lockfile change in this plan | `git diff --stat` confirms no `package.json`/`package-lock.json` touched |

This is the last plan of Phase 4. All three of this phase's `must_haves` (SCORE-02's coherent running total, SCORE-04's every-tied-winner rule, MEME-02's real incrementally-tracked top-3) are implemented and proven by the automated suite above. The one gap — real-device confirmation — is an environment limitation carried forward from every prior phase in this project, not a defect in this plan's own work, and is flagged above rather than silently treated as complete. A future session with a reachable LAN and a real phone should run Task 3's own human-check verbatim before the party.

## Self-Check: PASSED

Confirmed on disk: `client/src/screens/round/GameEndPanel.tsx`, `server/test/gameEnd.integration.test.ts`, `server/test/bestOfNight.integration.test.ts` all present via `[ -f ]`. Both task commit hashes (`cd91834`, `9580b99`) confirmed present in `git log --oneline`. Full server suite re-run at 196/196, client suite at 34/34, both typechecks and the client build all exit 0.

---
*Phase: 04-full-round-rating-scoring-completion*
*Completed: 2026-09-07*
