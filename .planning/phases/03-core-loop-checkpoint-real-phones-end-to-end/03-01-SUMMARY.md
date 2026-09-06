---
phase: 03-core-loop-checkpoint-real-phones-end-to-end
plan: 01
subsystem: api
tags: [socket.io, vitest, react, hebrew-rtl, scoring, static-assets]

# Dependency graph
requires:
  - phase: 02-server-authoritative-round-engine
    provides: "plan 02-01's phaseTimer/schedulePhase primitives, plan 02-03's writing snapshot, plan 02-04's ratingStep/rotation/eligibleRaters, and plan 02-05's ratings/eligibleAtClose maps and RoundEndView — this plan reduces the ratings maps to a real score for the first time"
provides:
  - "server/src/rooms/photos.ts — PHOTO_FILENAMES/assignPhotos/photoUrl, enumerating client/public/tamir-photos at load time, never a hardcoded filename"
  - "Room.photoAssignments/photoUrlFor — a real, distinct-where-possible photo per player per round, including a lazy fallback for a mid-round late joiner"
  - "Room.applyRoundScores — the sole site that ever mutates Player.score, called from enterRoundEnd before the phase transitions (SCORE-01)"
  - "shared/protocol.ts RatingStepView.photoUrl / LobbySnapshot.yourPhotoUrl — replacing the Phase 2 numbered placeholders"
  - "The three locked Hebrew tier-name buttons (D-02) and a ranked name+score scoreboard on RoundEndPanel.tsx (D-03)"
affects: [phase-4-no-repeat-photos, phase-4-photo-swap, phase-4-round-results-ranking, phase-4-winner-screen]

# Actuals (#2632)
actuals:
  tokens: 8234
  tasks: 3
  commits: 2

tech-stack:
  added: []
  patterns:
    - "photos.ts follows the exact 'pure module living beside Room' shape rotation.ts/gameSettings.ts established: a handful of exported functions, no class, no side effects beyond documented ones, with an injectable pool parameter purely for deterministic testing."
    - "A round-clock reduction (ratings -> score) is applied at the same chokepoint the round-end view itself is built (enterRoundEnd, before phase flips to ROUND_END) — the same 'compute from the room's own state first, then transition' ordering schedulePhase's callbacks already use."
    - "A snapshot field that must never be empty for a currently-live player (yourPhotoUrl, ratingStep.photoUrl) gets a private lazy-fallback accessor (photoUrlFor) rather than a null-check pushed onto every call site — mirrors how eligibleRaters/buildRotation are read-side projections, not mutations."

key-files:
  created:
    - server/src/rooms/photos.ts
    - server/test/realContent.integration.test.ts
    - server/test/photos.test.ts
    - server/test/scoring.integration.test.ts
  modified:
    - server/src/rooms/Room.ts
    - shared/protocol.ts
    - shared/messages.ts
    - client/src/screens/round/WritingPanel.tsx
    - client/src/screens/round/RatingPanel.tsx
    - client/src/screens/round/RoundEndPanel.tsx
    - client/src/index.css

key-decisions:
  - "Task 2's photos.test.ts/scoring.integration.test.ts (9 tests) all passed on their first run against Task 1's own photos.ts/Room.ts — no defect was found, so no production code changed in Task 2 (the plan's own instruction: modify only if a test exposes a defect)."
  - "Task 3's server start/health-check automation was completed, but the actual two-real-phone walkthrough could not be performed — this sandboxed execution environment has no physical phones and reports a documentation-range IP (192.0.2.2) rather than a real LAN address a device could dial into. This mirrors 02-05-SUMMARY.md's own carried-forward note for an analogous human-check. See 'What only a real phone can confirm' below."

patterns-established:
  - "Room.applyRoundScores is the single, sole mutation site for Player.score — no socket handler in server/src/socket/handlers.ts was touched by this plan and none has ever assigned to .score, so a forged score has no code path to travel through (T-03-01)."
  - "A round that skips rating (D-09, empty rotation) is a correctness no-op for applyRoundScores, not a special case — the forEach over an empty array never invents a score."

requirements-completed: [ROUND-01, ROUND-03, VOTE-01, VOTE-02, SCORE-01, SCORE-03]

coverage:
  - id: D1
    description: "Every player's writing-phase snapshot carries their own real, distinct photo of Tamir (yourPhotoUrl), never a numbered placeholder, drawn from client/public/tamir-photos."
    requirement: ROUND-01
    verification:
      - kind: integration
        ref: "server/test/realContent.integration.test.ts#assigns distinct real photos, carries the correct one into the rating step, and lands a real server-computed score on the right player"
        status: pass
      - kind: unit
        ref: "server/test/photos.test.ts (assignPhotos distinct-pool-member coverage, PHOTO_FILENAMES real-filesystem smoke check)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The same photo and caption appear on every player's screen at once during rating, and the three rating buttons read exactly 'דנה מגנזי' (3), 'תמיר פטריות' (2) and 'תמיר בפאניקה' (1) — never digits."
    requirement: VOTE-01
    verification:
      - kind: integration
        ref: "server/test/realContent.integration.test.ts (ratingStep.photoUrl equals photoUrl(room.photoAssignments.get(authorId)) for both steps)"
        status: pass
      - kind: other
        ref: "grep -cE \"דנה מגנזי|תמיר פטריות|תמיר בפאניקה\" shared/messages.ts (== 3); grep -cE \"ratingTierFunniest|ratingTierFine|ratingTierMeh\" client/src/screens/round/RatingPanel.tsx (== 3)"
        status: pass
    human_judgment: false
  - id: D3
    description: "A player's round score is the exact server-computed sum of the ratings their own meme received, written once inside Room.applyRoundScores before the round-end view is built — no client message can set or influence a score."
    requirement: SCORE-01
    verification:
      - kind: integration
        ref: "server/test/realContent.integration.test.ts (step-0 author scores exactly 3, step-1 author scores exactly 1, confirmed identically from a second client's own snapshot)"
        status: pass
      - kind: integration
        ref: "server/test/scoring.integration.test.ts#a player's score after two rounds equals the exact sum of both rounds' rating contributions to their own meme — never reset, never overwritten"
        status: pass
      - kind: integration
        ref: "server/test/scoring.integration.test.ts#a round with fewer than MIN_SUBMISSIONS_TO_RATE submissions reaches ROUND_END with every player's score exactly unchanged"
        status: pass
    human_judgment: false
  - id: D4
    description: "Between rounds every player sees a ranked scoreboard (name, score, highest first, no per-round delta) built from LobbySnapshot.players, accumulating across the whole game session."
    requirement: SCORE-03
    verification:
      - kind: automated_ui
        ref: "npm --prefix client run build / typecheck (exit 0, RoundEndPanel.tsx's .scoreboard section type-checks against snapshot.players)"
        status: pass
    human_judgment: true
    rationale: "The plan's own acceptance criteria require reviewing that RoundEndPanel.tsx renders no per-round delta — a rendering/visual-absence property automated tests here don't directly assert against a live DOM (no client component test exists for RoundEndPanel in this phase). Confirmed by code review against D-03's prohibition; a human UAT pass over the rendered screen is the stronger check."
  - id: D5
    description: "A room with more players than photos in the pool still assigns every player a real photo, cycling through additional shuffled draws rather than crashing or leaving a gap; a mid-round late joiner also gets a real photo."
    requirement: ROUND-01
    verification:
      - kind: unit
        ref: "server/test/photos.test.ts#with more players than photos, returns one filename per player, every one a pool member, and every pool member appears at least once"
        status: pass
      - kind: integration
        ref: "server/test/scoring.integration.test.ts#a player who joins a room after enterWriting() has already run still receives a non-null yourPhotoUrl on their next snapshot"
        status: pass
    human_judgment: false
  - id: D6
    description: "The complete loop — join, write with a real photo, rate meme-by-meme with the real tier names, see a real accumulated score on the scoreboard — has been played start-to-finish on two distinct real phones on the same network with no stalls, crashes, or desyncs."
    requirement: ROUND-01
    verification:
      - kind: manual_procedural
        ref: "Task 3 human-check (two real phones on the same WiFi, full round walkthrough) — see 'What only a real phone can confirm' in this SUMMARY"
        status: unknown
    human_judgment: true
    rationale: "No physical phones are reachable from this sandboxed execution environment (the machine's own reported address, 192.0.2.2, is a documentation-range IP, not a dialable LAN address) — this is the same category of environment limitation 02-05-SUMMARY.md already flagged for an analogous human-check. The server-side mechanics this checkpoint depends on (real photo delivery, real tier-name wire values, real score computation, no phase ever stalling per Phase 2's LIVE-03 battery) are all independently proven by the automated suite above; only the literal two-device walkthrough remains unconfirmed."

# Metrics
duration: ~50min
completed: 2026-09-06
status: complete
---

# Phase 3 Plan 1: Core Loop Checkpoint (Real Phones, End-to-End) Summary

**Real Tamir photos replace numbered placeholders end to end, the three rating buttons carry the locked Hebrew inside-joke tier names instead of digits, and a rated meme's score is a real server-computed sum landing on a ranked between-rounds scoreboard — all proven over real sockets, with the literal two-phone walkthrough left as an environment-limited human-check.**

## Performance

- **Duration:** ~50 min
- **Started:** 2026-09-06T23:33:00Z
- **Completed:** 2026-09-06T23:42:42Z
- **Tasks:** 3 completed
- **Files modified:** 7 modified, 4 created

## Accomplishments
- `server/src/rooms/photos.ts`: a new pure module (same shape as `gameSettings.ts`/`rotation.ts`) that enumerates `client/public/tamir-photos` once at load time, throws loud if the folder is empty (T-03-02), and draws a distinct-where-possible photo per player per round via a Fisher-Yates shuffle that cycles through additional passes when players outnumber photos (T-03-03).
- `Room.photoAssignments`/`Room.photoUrlFor`: every player's writing snapshot (`yourPhotoUrl`) and every rating step (`ratingStep.photoUrl`) now carries a real photo URL, including a lazy-assignment fallback for a player who joins mid-round.
- `Room.applyRoundScores`: the sole site that ever mutates `Player.score` — sums each rating step's raw values onto its author, called as the first line of `enterRoundEnd()` before the phase flips to `ROUND_END`. No socket handler touches `.score` (SCORE-01, T-03-01).
- `RatingPanel.tsx`'s three buttons now read exactly "דנה מגנזי" / "תמיר פטריות" / "תמיר בפאניקה" (D-02) instead of digit placeholders; `WritingPanel.tsx` and `RatingPanel.tsx` render the real `<img>` via the new `.meme-photo` CSS class (relative-width, mirrors `.qr-code`'s established pattern).
- `RoundEndPanel.tsx` gained a `.scoreboard` section: `snapshot.players` sorted by score descending, name and score only, no per-round delta (D-03) — reusing the existing round-end infrastructure rather than a new screen.
- `server/test/realContent.integration.test.ts` (Task 1's own tracer proof, real sockets): two players get distinct real photos matching the real `PHOTO_FILENAMES` set; the rating step for each meme carries exactly that author's assigned photo (`photoUrl(room.photoAssignments.get(authorId))`); a step rated 3 and a step rated 1 land those exact scores on the correct authors, confirmed identically from a second client's own next snapshot.
- `server/test/photos.test.ts` and `server/test/scoring.integration.test.ts` (Task 2, 9 tests): `assignPhotos` proven correct at, below, and above pool size; a late joiner mid-`WRITING` gets a real photo; a player's score across two rounds is the exact sum of both rounds' contributions, never reset; a round skipped for too few captions (D-09) leaves every score exactly unchanged. All 9 passed on the first run against Task 1's implementation — no defect found, so Task 2 changed zero production code.

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end real content — real photo, real tier names, real score reaches the scoreboard** - `105186e` (feat)
2. **Task 2: Hardening — photo-pool cycling, a late joiner, and score accumulation across rounds** - `ee0a889` (test)
3. **Task 3: Start the server for a real two-phone check and confirm the full loop end-to-end** - no commit (no source changes; server build/start/health-check only, per the plan's own `files: none`)

**Plan metadata:** committed alongside this SUMMARY (see `<final_commit>` in the execution log).

## Files Created/Modified
- `server/src/rooms/photos.ts` - `PHOTO_FILENAMES`, `assignPhotos`, `photoUrl` — the pure photo-assignment module
- `server/src/rooms/Room.ts` - `photoAssignments`, `photoUrlFor`, `applyRoundScores`; wired into `enterWriting`/`enterRoundEnd`/`snapshotFor`
- `shared/protocol.ts` - `RatingStepView.placeholderId` -> `photoUrl: string`; `LobbySnapshot.yourPlaceholderId` -> `yourPhotoUrl: string | null`
- `shared/messages.ts` - added `ratingTierFunniest`/`ratingTierFine`/`ratingTierMeh`/`photoAlt`/`scoreboardHeading`; removed `placeholderContentPrefix`/`ratingTierPlaceholder1/2/3`
- `client/src/screens/round/WritingPanel.tsx` - renders `snapshot.yourPhotoUrl` as an `<img>` instead of the placeholder line
- `client/src/screens/round/RatingPanel.tsx` - renders `ratingStep.photoUrl` as an `<img>`; `TIER_LABELS` reads the three real Hebrew tier names
- `client/src/screens/round/RoundEndPanel.tsx` - new `.scoreboard` section, ranked by `snapshot.players` score descending
- `client/src/index.css` - `.meme-photo` (mirrors `.qr-code`'s relative-width pattern), `.scoreboard`/`.scoreboard-list`/`.scoreboard-entry`
- `server/test/realContent.integration.test.ts` - new: the tracer's real-socket proof (photos, tier-name wiring, and score computation)
- `server/test/photos.test.ts` - new: unit tests over `assignPhotos`/`photoUrl` plus a real-filesystem smoke check
- `server/test/scoring.integration.test.ts` - new: late-joiner, two-round accumulation, and D-09-skip fake-timer tests

## Decisions Made
See `key-decisions` in the frontmatter: Task 2 found no defects (zero production-code changes), and Task 3's server-start automation succeeded while the literal two-phone walkthrough is an environment limitation, not a skipped step.

## Deviations from Plan

None - plan executed exactly as written. No `shared/protocol.ts` contract changes beyond the two renames the plan itself specified (`RatingStepView.placeholderId` -> `photoUrl`, `LobbySnapshot.yourPlaceholderId` -> `yourPhotoUrl`); no new Hebrew strings beyond the five the plan's own `planner_discretion_notes` already named (`ratingTierFunniest`/`Fine`/`Meh`, `photoAlt`, `scoreboardHeading`).

## Issues Encountered
- `server/test/realContent.integration.test.ts` runs in ~9.8s against the suite's 10s default `testTimeout` (writing + two rating steps, each with a real `BETWEEN_PHASES_MS`/`BETWEEN_MEMES_MS` pacing beat, at the plan's own seeded `writingSeconds`/`ratingSeconds` of 1s each). Gave this one test an explicit 15s timeout (the same lever `02-05-SUMMARY.md`'s `fullLoop.integration.test.ts` used for an analogous real-timer budget problem) rather than shortening the plan's specified 1s/1s seed values. Passed consistently across repeated runs at ~9.7-9.9s — comfortable margin against the 15s test-level timeout, tighter against the suite's global 10s default (which no longer applies to this specific `it` because of the explicit override).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness

**Verification results (all commands run and their actual output recorded, not assumed):**
- `npm --prefix server run test -- --run` → **178/178 passed** (baseline 168 + 1 tracer test + 9 hardening tests) — confirmed on a clean run
- `npm --prefix client run test -- --run` → **34/34 passed** (unchanged — no client test file was added or touched this plan)
- `npm --prefix server run typecheck` → exits 0, no output
- `npm --prefix client run build` → exits 0, "✓ 63 modules transformed" / "✓ built in ~544-934ms"
- `grep -cE "דנה מגנזי|תמיר פטריות|תמיר בפאניקה" shared/messages.ts` → `3`
- `grep -cE "ratingTierFunniest|ratingTierFine|ratingTierMeh" client/src/screens/round/RatingPanel.tsx` → `3`
- `node -e "fetch('http://localhost:3001/health')..."` (Task 3) → `{"ok":true}`, server started cleanly from the production build and stopped cleanly afterward

**Threat model — mitigations confirmed in the implementation, not just declared:**
| Threat | Mitigation | Confirmed by |
|---|---|---|
| T-03-01 (score tampering) | `applyRoundScores` is the only site that ever writes `Player.score`; no `CLIENT_EVENTS` member or handler carries/forwards a score | Code review of `server/src/socket/handlers.ts` (untouched by this plan) + `realContent.integration.test.ts`'s cross-client score confirmation |
| T-03-02 (empty photo directory DoS) | `photos.ts` throws a descriptive `Error` at import time if `PHOTO_FILENAMES` enumerates to zero | Code in `photos.ts`'s `loadPhotoFilenames`; not independently re-triggered by a test (would require deleting the real photo directory), but the real directory's non-emptiness is itself asserted by `photos.test.ts`'s `PHOTO_FILENAMES` smoke check |
| T-03-03 (more players than photos) | `assignPhotos` cycles additional shuffled passes; `photoUrlFor`'s lazy fallback covers a late joiner | `photos.test.ts#with more players than photos...`; `scoring.integration.test.ts#a player who joins a room after enterWriting()...` |
| T-03-04 (photo URL info disclosure) | `yourPhotoUrl` only exposes the recipient's own assignment; `ratingStep.photoUrl` only the current step's meme | Unchanged personalization pattern in `snapshotFor` — same mechanism Phase 2's D-14 discipline already relies on |

**What only a real phone can confirm (not proven here — no physical device reachable from this execution environment):**
Task 3's own human-check — two real phones on the same WiFi network, joining a room, both seeing a real photo of Tamir (not a placeholder), typing and submitting distinct Hebrew captions, seeing the SAME photo/caption and the three real tier-name buttons during rating, tapping a rating on the other phone's meme, and confirming the resulting scoreboard's numeric score visibly matches what was tapped, with nothing freezing, crashing, or desyncing between the two devices. This environment's own reported network address (`192.0.2.2`) is a documentation-range IP rather than a real LAN address a phone could dial into, so the literal walkthrough could not be attempted here — this is the same category of limitation `02-05-SUMMARY.md` already flagged for its own analogous three-browser-window human-check. Everything the server-side mechanics of that walkthrough depend on — real photo delivery, real tier-name wire values reaching the client, real score computation reaching every client identically, and no phase stalling (Phase 2's own `neverStalls.integration.test.ts` battery, untouched by this plan) — is independently proven above; the checkpoint's own remaining unknown is purely the literal two-device, same-room experience.

**Ready for Phase 4:** the scoreboard, tier names, and photo delivery mechanism are all explicitly reversible display/data-shape choices (per the plan's own `<reversibility>` note) — Phase 4's no-repeat-photos-across-the-game (ROUND-02), one-time photo swap (ROUND-06), round-results ranking screen (VOTE-06), cross-game score finalization (SCORE-02), and winner/best-of-night screens (SCORE-04/MEME-02) all build directly on `photoAssignments`/`applyRoundScores`/`snapshot.players` without requiring any rework of what this plan shipped.

**No blockers** for continuing to Phase 4 on the automated-verification side; the human-check above should be run against a real deployment (per PROJECT.md's Render hosting plan) before the actual party, not assumed complete from this sandboxed run.

## Self-Check: PASSED

All 4 created files confirmed present on disk; both task commit hashes (`105186e`, `ee0a889`) confirmed present in git history; the server's own `/health` endpoint confirmed reachable during Task 3's automation before being stopped.

---
*Phase: 03-core-loop-checkpoint-real-phones-end-to-end*
*Completed: 2026-09-06*
