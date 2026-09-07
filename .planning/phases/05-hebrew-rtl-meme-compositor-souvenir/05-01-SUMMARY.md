---
phase: 05-hebrew-rtl-meme-compositor-souvenir
plan: 01
subsystem: api
tags: [socket.io, vitest, wire-protocol, meme, security]

# Dependency graph
requires: []
provides:
  - "shared/protocol.ts — RatingStepView.meme, RoundEndEntry.meme, BestOfEntry.meme (a single opaque base64-PNG field, replacing every prior caption/photoUrl pair on these three types); ErrorCode.MEME_TOO_LARGE"
  - "server/src/config.ts — MEME_MAX_BASE64_CHARS, SOCKET_MAX_BUFFER_BYTES (replacing MAX_CAPTION_GRAPHEMES)"
  - "server/src/rooms/Room.ts — submitCaption(playerId, meme: unknown) validates non-empty, base64-shape (BASE64_PATTERN), and size bound before storage; every view builder (ratingStep, buildRoundEndView, updateBestOfNight) reads meme from submissions unmodified"
  - "server/test/fixtures/meme.ts — fakeMeme(marker?), the shared valid-base64 stand-in every server test now submits instead of plain caption text"
affects: []

# Actuals (#2632)
actuals:
  tokens: 68000
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "The server treats a submitted meme as fully opaque data — no PNG structure inspection, no text sanitization, no truncation. Only three checks gate storage: non-empty, correctly base64-shaped, and under MEME_MAX_BASE64_CHARS. This mirrors submitRating's untrusted-payload pass-through pattern rather than the old prepareCaption pre-sanitize approach, since there is no longer any text to sanitize."
    - "A single opaque wire field (meme: string) replaces two previously-separate fields (caption text + photoUrl reference) across all three downstream view types — the plurality of caption boxes the client will compose in Plan 05-02 never reaches the wire; it is flattened to one rasterized image before submission, so the protocol itself stays exactly as simple as the old single-caption shape."
    - "Test migration convention: every literal caption string or `{ text: '...' }` payload across the suite becomes fakeMeme('marker') / `{ meme: fakeMeme('marker') }`, with markers chosen for readability only — content no longer carries test meaning except in the handful of tests that specifically prove privacy/identity (captionPrivacy, gameEnd, realContent), which assert on the exact fakeMeme() value flowing through unmodified."

key-files:
  created:
    - server/test/fixtures/meme.ts
    - server/test/memeValidation.test.ts
  modified:
    - shared/protocol.ts
    - shared/messages.ts
    - server/src/config.ts
    - server/src/app.ts
    - server/src/rooms/Room.ts
    - server/src/socket/handlers.ts
    - server/test/writingPhase.integration.test.ts
    - server/test/ratingStep.integration.test.ts
    - server/test/neverStalls.integration.test.ts
    - server/test/noRepeatPhotos.integration.test.ts
    - server/test/scoring.integration.test.ts
    - server/test/bestOfNight.integration.test.ts
    - server/test/captionPrivacy.integration.test.ts
    - server/test/fullLoop.integration.test.ts
    - server/test/gameEnd.integration.test.ts
    - server/test/photoSwap.integration.test.ts
    - server/test/ratingPrivacy.integration.test.ts
    - server/test/realContent.integration.test.ts

key-decisions:
  - "This session's Claude usage limit was hit mid-Task-3, after 11 of 14 test files were migrated and both new fixture/test files were created but uncommitted. Rather than re-dispatching a fresh executor for the whole task once the limit reset, the orchestrator (this session) verified exactly which file was still unmigrated (realContent.integration.test.ts — its one failure was a 15s test timeout, not a flake, because it was still submitting the old { text: ... } shape against the new meme-only validation), applied the remaining migration directly per the plan's own precise per-file instructions, and verified the full suite before committing — no re-derivation of scope, no redone work on the 11 already-correct files."
  - "Server validation for `meme` is a shape/size check only (non-empty, base64 pattern, max length) — never a minimum-content floor. The old MIN caption-length concept has no equivalent: a rasterized image is always non-empty bytes even when its visible text is blank, so 'at least one non-empty caption box' (MEME-01's empty-submission edge case) is enforced entirely client-side starting in Plan 05-02, not here."

requirements-completed: [MEME-01]

coverage:
  - id: D1
    description: "The server never treats a submitted meme as text to sanitize or truncate — it is opaque rasterized image data whose only server-side checks are non-emptiness, a maximum size bound, and a valid base64 shape."
    requirement: MEME-01
    verification:
      - kind: unit
        ref: "server/test/memeValidation.test.ts (all 5 branches: empty, non-string, oversized, non-base64, valid-and-round-trips)"
        status: pass
    human_judgment: false
  - id: D2
    description: "An oversized or non-base64-shaped submitted meme is refused before it is stored or broadcast to any other player's device (threat model T-05-01/T-05-02)."
    requirement: MEME-01
    verification:
      - kind: unit
        ref: "server/test/memeValidation.test.ts#refuses MEME_TOO_LARGE for an oversized payload"
        status: pass
      - kind: unit
        ref: "server/test/memeValidation.test.ts#refuses CAPTION_REQUIRED for non-base64-shaped content"
        status: pass
    human_judgment: false
  - id: D3
    description: "RatingStepView, RoundEndEntry, and BestOfEntry all carry the exact same submitted meme value for a given author, flowing through Room.submissions unmodified into every downstream view."
    requirement: MEME-01
    verification:
      - kind: integration
        ref: "server/test/realContent.integration.test.ts#assigns distinct real photos, carries the correct one into the rating step, and lands a real server-computed score on the right player (now asserts ratingStep?.meme equals the exact fakeMeme() value submitted, a stronger identity proof than the old photoUrl filename check)"
        status: pass
      - kind: integration
        ref: "server/test/gameEnd.integration.test.ts (asserts .meme, never .caption/.photoUrl, on ratingStep/bestOfNight content)"
        status: pass
      - kind: integration
        ref: "server/test/captionPrivacy.integration.test.ts (proves no submitted meme value leaks into another player's WRITING snapshot)"
        status: pass
    human_judgment: false

# Metrics
duration: ~55min (interrupted once by a session usage-limit reset between Task 2 and the tail of Task 3)
completed: 2026-09-07
status: complete
---

# Phase 5 Plan 1: Wire Contract Migration to Opaque Meme Field Summary

**The wire contract and server-side authority move from a plain-text `caption` + separate `photoUrl` to a single opaque `meme` (base64 PNG) field, with the full existing 32-file server test suite migrated to match — the atomic foundation every later Phase 5 wave builds on.**

## Performance

- **Duration:** ~55 min total (executor ran Tasks 1-2 and most of Task 3 before hitting this session's usage limit; the orchestrator completed the final file of Task 3's test migration directly once the limit reset, per the plan's own exact per-file instructions)
- **Tasks:** 3 completed
- **Files modified:** 17 modified, 2 created

## Accomplishments
- `shared/protocol.ts`: `RatingStepView`, `RoundEndEntry`, and `BestOfEntry` each replace their prior `caption`/`photoUrl` fields with a single `meme: string` (base64-encoded PNG); `ErrorCode` gains `MEME_TOO_LARGE`; `CLIENT_EVENTS.submitCaption`'s documented payload shape becomes `{ meme: string }`.
- `server/src/config.ts`: `MEME_MAX_BASE64_CHARS` and `SOCKET_MAX_BUFFER_BYTES` added, replacing the now-removed `MAX_CAPTION_GRAPHEMES`.
- `server/src/app.ts`: Socket.IO's `maxHttpBufferSize` configured to accommodate base64-encoded PNG payloads (RESEARCH.md's rasterize-and-transmit decision), as the second, transport-level layer above the application-level size check.
- `server/src/rooms/Room.ts`: `submitCaption` takes `meme: unknown`, validates in order (non-empty → `BASE64_PATTERN` shape → `MEME_MAX_BASE64_CHARS` size) before storing, with `MEME_TOO_LARGE` added to `SubmitCaptionOutcome`; every view builder (`ratingStep`, `buildRoundEndView`, `updateBestOfNight`) reads `this.submissions.get(authorId)` straight into the new `meme` field.
- `server/src/socket/handlers.ts`: the `submit-caption` handler destructures `{ meme }` and passes it straight through to `room.submitCaption(data.playerId, meme)` with no pre-sanitization — matching `submitRating`'s untrusted-payload pass-through pattern.
- `shared/messages.ts`: `HEBREW_ERRORS.MEME_TOO_LARGE` added.
- `server/test/fixtures/meme.ts` (new): `fakeMeme(marker?)` — a tiny, validly base64-shaped stand-in for a real rasterized PNG, used across the entire migrated suite.
- `server/test/memeValidation.test.ts` (new): proves all 5 validation branches Task 2 added (empty, non-string, oversized, non-base64, valid-and-round-trips-verbatim) — closing the Nyquist gap RESEARCH.md's own "Wave 0 Gaps" section flagged.
- All 12 remaining pre-existing integration test files migrated from literal caption strings / `{ text: "..." }` payloads to `fakeMeme(...)` / `{ meme: fakeMeme(...) }`, following the plan's exact per-file instructions (see Files Created/Modified below for the handful with file-specific semantics: `captionPrivacy`, `gameEnd`, `realContent`, `ratingPrivacy`).

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire contract — meme field, MEME_TOO_LARGE error, size/buffer constants** - `7587802` (feat)
2. **Task 2: Room + handlers — validate, store, and serve meme as opaque data** - `f890202` (feat)
3. **Task 3: Migrate the existing suite to the new wire shape, and add the new meme-validation tests** - `42f68dd` (test)

**Plan metadata:** committed alongside this SUMMARY.

## Files Created/Modified
- `shared/protocol.ts` - `RatingStepView.meme`, `RoundEndEntry.meme`, `BestOfEntry.meme`, `ErrorCode.MEME_TOO_LARGE`
- `shared/messages.ts` - `HEBREW_ERRORS.MEME_TOO_LARGE`
- `server/src/config.ts` - `MEME_MAX_BASE64_CHARS`, `SOCKET_MAX_BUFFER_BYTES`
- `server/src/app.ts` - Socket.IO `maxHttpBufferSize` configuration
- `server/src/rooms/Room.ts` - `submitCaption`'s new signature/validation order, `BASE64_PATTERN`, `SubmitCaptionOutcome.MEME_TOO_LARGE`, every view builder reading `meme`
- `server/src/socket/handlers.ts` - `submit-caption` handler destructures `{ meme }`, opaque pass-through
- `server/test/fixtures/meme.ts` - new: `fakeMeme(marker?)`
- `server/test/memeValidation.test.ts` - new: all 5 validation branches
- `server/test/writingPhase.integration.test.ts` - literals → `fakeMeme(...)`, two `""` empty-string tests left untouched
- `server/test/ratingStep.integration.test.ts` - bare-Room and real-socket payloads → `fakeMeme(...)`
- `server/test/neverStalls.integration.test.ts`, `noRepeatPhotos.integration.test.ts`, `scoring.integration.test.ts`, `bestOfNight.integration.test.ts` - bare-Room literals → `fakeMeme(...)`
- `server/test/fullLoop.integration.test.ts`, `photoSwap.integration.test.ts`, `ratingPrivacy.integration.test.ts` - `{ text: "..." }` → `{ meme: fakeMeme(...) }`
- `server/test/captionPrivacy.integration.test.ts` - `distinctiveCaption` → `distinctiveMeme`, leak assertion now checks the meme value
- `server/test/gameEnd.integration.test.ts` - `hostCaption`/`bCaption` → `hostMeme`/`bMeme`, `memeByPlayerId` map, `toMatchObject` assertions compare `meme`
- `server/test/photoSwap.integration.test.ts`, `server/test/ratingPrivacy.integration.test.ts` - `RATING_STEP_KEYS` and payloads updated to the `meme`-only shape
- `server/test/realContent.integration.test.ts` - `memeByPlayerId` map, both `photoUrl(...)`-based assertions replaced with direct `meme` identity checks (a stronger proof than the old filename check); unused `photoUrl` import removed

## Decisions Made
See `key-decisions` in the frontmatter: this session's usage limit interrupted Task 3 partway through (11 of 14 files migrated, both new files created, all uncommitted); the orchestrator resumed by identifying the exact gap (`realContent.integration.test.ts`, failing with a 15s timeout because it still submitted the old `{ text }` shape) and completed only that file per the plan's own precise instructions, rather than re-running the whole task. Server-side `meme` validation is shape/size-only, with no minimum-content floor — the empty-submission check moves entirely client-side in Plan 05-02.

## Deviations from Plan

None beyond the interruption-and-resume noted above, which changed nothing about the plan's own scope or acceptance criteria — the same 14 files were migrated, using the same fixture, following the same per-file instructions the plan specified.

## Issues Encountered

This session hit its usage limit partway through Task 3's test migration. On reset, `git status`/`git diff --stat` showed 11 of 14 files already correctly migrated and committed-ready, plus both new files (`fixtures/meme.ts`, `memeValidation.test.ts`) complete on disk but uncommitted. Running the full suite confirmed exactly one failure (`realContent.integration.test.ts`, a genuine 15s timeout — not a flake — because the writing phase never closed against a payload the new validation didn't recognize). The remaining migration was completed directly against the plan's own exact per-file instructions for that file, then the full suite was re-run clean before committing.

## User Setup Required
None - no external service configuration required.

## Verification

Full regression suite, run after Task 3's migration completed:

- `npm --prefix server run test -- --run` → **203/203 passed** (32 test files)
- `npm --prefix server run typecheck` → exits 0, no output
- `grep -rn "\.caption\b" server/test/*.test.ts` → no matches (clean; confirms no stray old-field reference survived the migration)

This plan makes no client-side changes, so `npm --prefix client run typecheck`/`build`/`test` were not run here — they are exercised for the first time against this new protocol shape in Plan 05-02, which is where the client actually starts sending `{ meme }` instead of `{ text }`.

## Next Phase Readiness

**Threat model — mitigations confirmed in the implementation, not just declared:**

| Threat | Mitigation | Confirmed by |
|---|---|---|
| T-05-01 (DoS via oversized meme payload) | `meme.length > MEME_MAX_BASE64_CHARS` checked before storage/broadcast; `maxHttpBufferSize` on the Socket.IO transport as a second layer | `memeValidation.test.ts`'s oversized-payload test; `server/src/app.ts`'s transport config |
| T-05-02 (tampering via non-base64/malformed content) | `BASE64_PATTERN.test(meme)` rejects non-base64-shaped content before storage; downstream rendering (Plan 05-02) will treat the value as an opaque `<img>` src, never `dangerouslySetInnerHTML` | `memeValidation.test.ts`'s non-base64 tests (Hebrew text, `"not-base64!!"`) |
| T-05-03 (identity spoofing) | Author is always `data.playerId` from the authenticated socket, exactly like every other mutating handler — the payload carries no forgeable identity field | Code review of `handlers.ts`; unchanged from the pre-existing `submitRating`/`swapPhoto` pattern |
| T-05-SC (package install) | No new package installed in this plan | `git diff --stat` confirms no `package.json`/lockfile touched |

This plan is the foundation for all four remaining Phase 5 plans. Plan 05-02 can now build the client-side canvas compositor and WritingPanel rewrite against a stable, fully-migrated `meme` wire contract — no protocol changes are expected downstream, only new client code that produces and consumes the `meme` field this plan defined.

## Self-Check: PASSED

Confirmed on disk: `server/test/fixtures/meme.ts`, `server/test/memeValidation.test.ts` both present via `[ -f ]`. All three task commit hashes (`7587802`, `f890202`, `42f68dd`) confirmed present in `git log --oneline`. Full server suite re-run at 203/203, typecheck exits 0, and the `.caption` grep across `server/test/*.test.ts` returns no matches.

---
*Phase: 05-hebrew-rtl-meme-compositor-souvenir*
*Completed: 2026-09-07*
