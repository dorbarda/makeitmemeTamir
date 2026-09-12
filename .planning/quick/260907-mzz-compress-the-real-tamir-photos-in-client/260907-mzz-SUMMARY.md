---
task: 260907-mzz
subsystem: client/public/tamir-photos
tags: [image-compression, performance, quick-task]
dependency graph:
  requires: []
  provides: [compressed-tamir-photos]
  affects: [server/src/rooms/photos.ts, server/test/photos.test.ts]
tech-stack:
  added: []
  patterns: [scratch-directory-sharp-install, in-place-recompression]
key-files:
  created: []
  modified:
    - client/public/tamir-photos/*.jpg (49 of 53 files recompressed in place; 4 left untouched)
decisions:
  - "Recompressed all 53 real photos using the same treatment as Phase 3's original 5 photos (max 1600px longest edge, JPEG quality 78 mozjpeg, EXIF orientation baked in and stripped), overwriting in place under unchanged filenames."
  - "sharp was installed only in an outside-the-repo scratch directory (mktemp -d), used once, and fully removed afterward — never added to any package.json."
  - "Only overwrote a file when the recompressed buffer was strictly smaller than the original; 4 already-small WhatsApp-sourced files were left byte-for-byte untouched because recompression would not have shrunk them further."
actuals:
  tokens: 6200
  tasks: 2
  commits: 1
metrics:
  duration: 12 min
  completed: 2026-09-07
status: complete
---

# Quick Task 260907-mzz: Compress the real Tamir photos in client Summary

Recompressed all 53 real photos in `client/public/tamir-photos/` in place (49 shrunk, 4 kept
unchanged), dropping the directory from ~42.99MB to ~7.74MB (82.0% reduction) using a
throwaway, outside-the-repo `sharp` install, with zero trace left in any `package.json` or
`package-lock.json`.

## What Was Built

### Task 1: Compress all 53 photos in place via a temporary, scratch-installed sharp script

Created an isolated scratch directory with `mktemp -d`, ran `npm init -y --silent` and
`npm install sharp --no-audit --no-fund` inside it, then wrote and ran a CommonJS script
(`compress.cjs`) that, for each of the 53 real filenames in
`client/public/tamir-photos/` (excluding `.gitkeep`):

- Read the original file into a buffer and recorded its size.
- Ran it through `sharp(buffer).rotate().resize({ width: 1600, height: 1600, fit: "inside",
  withoutEnlargement: true }).jpeg({ quality: 78, mozjpeg: true }).toBuffer()` —
  auto-orienting from EXIF and stripping the orientation tag, capping the longest edge at
  1600px without ever upscaling, and re-encoding as quality-78 mozjpeg JPEG.
- Validated the result via `sharp(processedBuffer).metadata()` and a non-zero-length check
  before considering it safe to use.
- Only overwrote the original file when the processed buffer was strictly smaller; otherwise
  left the original bytes completely untouched.
- Printed a per-file before/after line and a final summary.

Result: 49 files compressed, 4 files kept unchanged (already smaller than the recompressed
output), zero errors/warnings across all 53 files. Total: 42,988,825 bytes -> 7,736,608 bytes
(82.0% reduction).

The scratch directory (`/tmp/tmp.TaxSkRWlAz`) was removed with `rm -rf` immediately after the
script ran and its output was reviewed; confirmed no trace remains on disk and `sharp` is not
installed anywhere in the repo.

**Files kept unchanged (recompression would not have shrunk them further):**
- `WhatsApp Image 2026-09-06 at 23.14.43 (1).jpeg` (47,850 bytes)
- `WhatsApp Image 2026-09-06 at 23.14.43 (2).jpeg` (75,609 bytes)
- `WhatsApp Image 2026-09-06 at 23.14.43.jpeg` (33,483 bytes)
- `WhatsApp Image 2026-09-06 at 23.38.16.jpeg` (74,906 bytes)

Automated verification passed: all 53 files present under unchanged filenames, every file is a
valid non-zero-byte JPEG (`FF D8 FF` magic bytes confirmed), total directory size (7,736,608
bytes) is well under the 20MB threshold.

Committed as `5e47c75` — 49 files changed (image content only, 0 text insertions/deletions since
these are binary files).

### Task 2: Confirm no regression, confirm sharp left no trace, report final size

- `git diff --stat` over `client/package.json`, `client/package-lock.json`,
  `server/package.json`, `server/package-lock.json`, `package.json`, `package-lock.json`:
  **empty** — confirms the scratch-directory install never touched any repo manifest/lockfile.
- Final directory size: `du -sh client/public/tamir-photos` reports **7.5M**, down from the
  ~41-42MB starting point (matches the exact byte count above, 7,736,608 bytes ≈ 7.5MiB).
- Spot-checked three recompressed/kept files with `file`: two recompressed files show
  `JPEG image data, progressive ... 900x1600` and `1067x1600` (longest edge correctly capped at
  1600px, no distortion), and the untouched WhatsApp file remains at its original
  `729x1296` baseline JPEG — no corruption, no unexpected rotation.

**Pre-existing flaky test failure discovered and fixed by the orchestrator (2026-09-07,
commit `84fbca6`, immediately after this task):** running the full server suite 4 times
surfaced an intermittent failure in `server/test/realContent.integration.test.ts` and
`server/test/photoSwap.integration.test.ts` (2 of 4 runs failed, 2 passed), plus a silently
weakened assertion in `server/test/noRepeatPhotos.integration.test.ts` (a false "not seen" for
an already-seen photo whose filename has special characters). Root cause: an earlier quick task
(`260907-mtn`, commit `cfa8f55`) added `encodeURIComponent()` to `photoUrl()`, but these three
tests still compared the *encoded* URL suffix directly against *raw* `PHOTO_FILENAMES`/
`photosSeenByPlayer` entries without decoding first — so the assertion only failed (or silently
passed when it shouldn't have) when a test happened to draw a filename containing spaces or
parentheses. This was out of scope for this task (byte-content-only image recompression) so it
was logged to `deferred-items.md` rather than fixed inline here, and the orchestrator applied
the recommended `decodeURIComponent(...)` fix immediately after this task completed, confirmed
clean across two full test-suite runs (204/204 both times, deterministic fix since
`decodeURIComponent(encodeURIComponent(x)) === x` for any input).

## Deviations from Plan

### Out-of-scope discoveries (not fixed, logged)

**1. [Out of scope — pre-existing bug] Flaky filename-encoding mismatch in two integration
tests**
- **Found during:** Task 2 verification (`npm --prefix server run test -- --run`)
- **Issue:** `realContent.integration.test.ts` and `photoSwap.integration.test.ts` compare an
  `encodeURIComponent`-encoded URL suffix against raw `PHOTO_FILENAMES` entries without
  decoding, causing intermittent failures when a filename contains spaces/parentheses.
- **Why not fixed:** Caused by an earlier, unrelated quick task's `photoUrl()` change
  (commit `cfa8f55`), not by this task's byte-content-only image recompression. Per the
  scope-boundary rule, pre-existing failures in unrelated files are logged, not auto-fixed.
- **Action taken:** Logged to `deferred-items.md` in this task's directory with a recommended
  follow-up fix. No files modified as part of this deviation.

No other deviations — the plan executed exactly as written otherwise.

## Known Stubs

None.

## Threat Flags

None — this task only recompresses existing static image bytes; no new network endpoints, auth
paths, or trust boundaries were introduced.

## Self-Check: PASSED

- FOUND: `client/public/tamir-photos/` — 53 files present, total 7,736,608 bytes.
- FOUND: commit `5e47c75` (`git log --oneline` confirms it exists).
- FOUND: `.planning/quick/260907-mzz-compress-the-real-tamir-photos-in-client/deferred-items.md`.
- Confirmed `git diff --stat` over all repo `package.json`/`package-lock.json` files is empty.
- Confirmed no trace of the scratch `sharp` install remains on disk.
