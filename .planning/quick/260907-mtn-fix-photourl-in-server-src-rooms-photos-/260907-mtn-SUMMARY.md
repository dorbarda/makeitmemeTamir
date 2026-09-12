---
task: 260907-mtn
type: execute
subsystem: api
tags: [encodeURIComponent, url-encoding, rtl, static-files, vitest]

# Dependency graph
requires: []
provides:
  - photoUrl() now percent-encodes filenames before building the /tamir-photos/ path
affects: [rooms, photos, meme-round-photo-assignment]

# Actuals (#2632)
actuals:
  tokens: 439
  tasks: 1
  commits: 2

tech-stack:
  added: []
  patterns:
    - "TDD RED/GREEN cycle for a single pure-function fix"

key-files:
  created: []
  modified:
    - server/src/rooms/photos.ts
    - server/test/photos.test.ts

key-decisions:
  - "Used encodeURIComponent() on the filename only, leaving the /tamir-photos/ prefix and every other exported function in photos.ts untouched — pure output-encoding fix scoped to photoUrl()."

patterns-established: []

requirements-completed: []

coverage:
  - id: D1
    description: "photoUrl() percent-encodes filenames with spaces/parentheses so real uploaded photo URLs resolve instead of 404ing"
    verification:
      - kind: unit
        ref: "server/test/photos.test.ts#photoUrl > percent-encodes a filename containing a space and parentheses"
        status: pass
      - kind: unit
        ref: "server/test/photos.test.ts#photoUrl > returns exactly /tamir-photos/<filename>"
        status: pass
    human_judgment: false

duration: 2min
completed: 2026-09-07
status: complete
---

# Quick Task 260907-mtn: Fix photoUrl() percent-encoding Summary

**`photoUrl()` in `server/src/rooms/photos.ts` now percent-encodes the filename via `encodeURIComponent()`, fixing broken `/tamir-photos/` URLs for real uploaded photo filenames containing spaces and parentheses.**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-09-07T16:29:00Z
- **Completed:** 2026-09-07T16:30:37Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- `photoUrl()` builds the served path with `encodeURIComponent(filename)` instead of the raw filename, so reserved characters (spaces, parentheses, non-ASCII, etc.) are correctly percent-encoded.
- New test in `server/test/photos.test.ts` proves the fix for a filename containing a space and parentheses (`"IMG_1617 (2).jpg"`): asserts no raw space in the output, presence of `%20`, and a correct round-trip through `new URL(...)` / `decodeURIComponent`.
- Pre-existing `photoUrl("x.jpg")` test still passes unchanged, confirming plain filenames are unaffected.
- Full `photos.test.ts` suite (13 tests, including `assignPhotos`, `assignPhotosFromEligiblePools`, `drawOnePhoto`, and the real-filesystem `PHOTO_FILENAMES` smoke check) passes.

## Task Commits

TDD RED/GREEN cycle, each step committed atomically:

1. **Task 1 RED: add failing test for photoUrl percent-encoding** - `4bf2867` (test)
2. **Task 1 GREEN: percent-encode filename in photoUrl()** - `cfa8f55` (fix)

No refactor commit needed — the GREEN implementation was already minimal and clean.

## Files Created/Modified
- `server/src/rooms/photos.ts` - `photoUrl()` now wraps the filename in `encodeURIComponent()` before interpolating it into the `/tamir-photos/` path; added a doc comment explaining why.
- `server/test/photos.test.ts` - Added a test asserting a filename with a space and parentheses encodes correctly and round-trips through `new URL(...)` / `decodeURIComponent`.

## Decisions Made
- Scoped the fix strictly to `photoUrl()` — `loadPhotoFilenames()`, `PHOTO_FILENAMES`, `assignPhotos`, `drawOnePhoto`, and `assignPhotosFromEligiblePools` were left completely untouched, per the plan's explicit scope boundary.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Real uploaded photo filenames containing spaces/parentheses (e.g. `WhatsApp Image 2026-09-06 at 23.14.43 (1).jpeg`, `IMG_1617_(2).jpg`, `IMG_2755_(1).jpg`) now produce valid, resolvable `/tamir-photos/` URLs sent to clients during round photo assignment.
- No blockers. This was an isolated bug fix; no follow-up work required.

---
*Task: 260907-mtn*
*Completed: 2026-09-07*

## Self-Check: PASSED

- FOUND: server/src/rooms/photos.ts
- FOUND: server/test/photos.test.ts
- FOUND: .planning/quick/260907-mtn-fix-photourl-in-server-src-rooms-photos-/260907-mtn-SUMMARY.md
- FOUND commit: 4bf2867
- FOUND commit: cfa8f55
