---
task: 260907-mzz
type: execute
autonomous: true
files_modified:
  - client/public/tamir-photos/*.jpg, *.jpeg, *.JPG (53 files recompressed in place — same filenames, content only, no renames, no new/removed files)
---

<objective>
Recompress every real photo currently in `client/public/tamir-photos/` (53 files, ~41-42MB total,
verified all `.jpg`/`.jpeg`/`.JPG` — no `.png` files present in the directory) using the exact same
treatment Phase 3 already established for the original 5 photos: resize to a max of 1600px on the
longest edge (preserve aspect ratio, never upscale), re-encode as JPEG quality 78 (mozjpeg), and
auto-rotate/strip EXIF orientation — overwriting each file in place under its exact original
filename. `sharp` is installed temporarily in an isolated scratch directory outside the repo (never
added to `client/package.json` or `server/package.json`) purely to run this one-off compression.

Purpose: the user just uploaded ~50 real camera/WhatsApp originals directly via GitHub's web UI,
bypassing any compression step — some are up to 2.6MB. Every player's phone must load its assigned
photo from this directory during a live countdown on mixed, possibly-slow venue phones/networks;
shipping these uncompressed is exactly the "getting stuck" failure mode the game must avoid.

Output: all 53 files in `client/public/tamir-photos/` recompressed in place with unchanged
filenames, directory total size reduced substantially below the ~41-42MB starting point, the full
server test suite still passing unchanged (photo tests are filename-based, not content-based), and
zero diff in any `package.json`/`package-lock.json` in the repo (proving `sharp` was never
persisted as a dependency).
</objective>

<context>
@client/public/tamir-photos/
@server/src/rooms/photos.ts
@server/test/photos.test.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Compress all 53 photos in place via a temporary, scratch-installed sharp script</name>
  <files>client/public/tamir-photos/*.jpg, *.jpeg, *.JPG (content only — same 53 filenames)</files>
  <action>
    Create an isolated scratch directory outside the repo with `mktemp -d` (assign its path to a
    shell variable, e.g. `SCRATCH`). Inside `$SCRATCH`, run `npm init -y --silent` followed by
    `npm install sharp --no-audit --no-fund` — this creates a throwaway `package.json` and
    `node_modules/sharp` entirely inside `$SCRATCH`, never touching the repo's own
    `client/package.json`, `server/package.json`, or any lockfile.

    Write a CommonJS script named `compress.cjs` inside `$SCRATCH` (so `require("sharp")` resolves
    against `$SCRATCH/node_modules`). The script: requires `sharp`, `node:fs`, and `node:path`; sets
    `PHOTOS_DIR` to the absolute path `/home/user/makeitmemeTamir/client/public/tamir-photos`; reads
    `fs.readdirSync(PHOTOS_DIR)` and filters out `.gitkeep`, leaving all 53 real filenames untouched
    (do not rename anything — filenames may contain spaces, parentheses, and mixed-case extensions
    like `IMG_9938.JPG`, and `photoUrl()` already percent-encodes at serve time). Defines an async
    `main()` that iterates the 53 filenames sequentially (a plain `for...of` loop with `await` inside
    is fine — no need for concurrency at this file count) and for each filename: reads the original
    file into a Buffer via `fs.readFileSync(absPath)`, records `originalSize = buffer.length`; builds
    `processedBuffer` via `sharp(buffer).rotate().resize({ width: 1600, height: 1600, fit: "inside",
    withoutEnlargement: true }).jpeg({ quality: 78, mozjpeg: true }).toBuffer()` — `.rotate()` with no
    arguments auto-orients from the EXIF orientation tag and then strips it from the output (so the
    baked-in pixels display correctly with no lingering orientation metadata), and the `resize` fit
    mode caps the longest edge at 1600px for either orientation while never enlarging an image
    already smaller than that; validates the result in a try/catch by calling
    `await sharp(processedBuffer).metadata()` and checking `processedBuffer.length > 0` — on any
    thrown error or zero-length buffer, logs a warning, leaves that file's original bytes untouched
    on disk, and continues to the next file (never lets one bad file abort the whole run); otherwise
    compares `processedBuffer.length` against `originalSize` and only calls
    `fs.writeFileSync(absPath, processedBuffer)` (overwriting the original in place) when the
    processed buffer is strictly smaller — if it is not smaller, the original file is left completely
    untouched and the script logs that it kept the original. The script accumulates running totals of
    bytes-before and bytes-after across all 53 files (using the original size for any file that was
    kept unchanged), and after the loop prints one line per file (`filename: originalSize ->
    finalSize (compressed|kept)`) plus a final summary line with total bytes before, total bytes
    after, and the overall percentage reduction.

    Run the script with `node "$SCRATCH/compress.cjs"` from anywhere (it uses an absolute
    `PHOTOS_DIR`, so working directory doesn't matter), capture and review its printed output for
    any "kept" or warning lines, then remove the scratch directory entirely with `rm -rf "$SCRATCH"`
    now that compression is done — `sharp` must not remain installed anywhere after this task.
  </action>
  <verify>
    <automated>node -e "const fs=require('fs');const path=require('path');const dir='/home/user/makeitmemeTamir/client/public/tamir-photos';const files=fs.readdirSync(dir).filter(f=>f!=='.gitkeep');let total=0,bad=0;if(files.length!==53){console.error('count mismatch:',files.length);process.exit(1)}for(const f of files){const p=path.join(dir,f);const buf=fs.readFileSync(p);total+=buf.length;if(buf.length===0||!(buf[0]===0xFF&&buf[1]===0xD8&&buf[2]===0xFF)){console.error('bad file:',f);bad++}}if(bad>0){process.exit(1)}if(total>=20000000){console.error('total too large:',total);process.exit(1)}console.log('PASS total='+total)"</automated>
  </verify>
  <done>
    All 53 files in `client/public/tamir-photos/` still exist under their exact original filenames
    (no renames, no additions, no deletions), every file is a valid, non-zero-byte JPEG (starts with
    the `FF D8 FF` magic bytes), no file that was compressed is larger than its original, any file
    the script could not safely shrink was left byte-for-byte untouched, the directory's total size
    has dropped from ~41-42MB to well under 20MB, and the scratch `sharp` install (`$SCRATCH`) has
    been removed so no trace of it remains on disk.
  </done>
</task>

<task type="auto">
  <name>Task 2: Confirm no regression, confirm sharp left no trace in any package.json, report final size</name>
  <files>(none modified — verification and reporting only)</files>
  <action>
    Run the full server test suite with `npm --prefix server run test -- --run` and confirm every
    test passes unchanged, in particular `server/test/photos.test.ts` (whose assertions are
    filename-based via injected pools, not content-based, so recompressing file bytes must not affect
    it) and any other suite that touches `PHOTO_FILENAMES`/photo assignment (e.g.
    `noRepeatPhotos.integration.test.ts`, `photoSwap.integration.test.ts`,
    `realContent.integration.test.ts`) — this is expected to be a no-op regression check.

    Confirm `sharp` left zero trace in the repo's own dependency manifests by running
    `git diff --stat -- client/package.json client/package-lock.json server/package.json
    server/package-lock.json package.json package-lock.json` and confirming the output is empty —
    this proves the scratch-directory install approach in Task 1 never touched any repo lockfile or
    manifest.

    Compute and report the final total size of `client/public/tamir-photos/` (e.g. via
    `du -sh client/public/tamir-photos`) compared against the ~41-42MB starting point, and report the
    per-file before/after totals captured from Task 1's script output, in the completion summary.
  </action>
  <verify>
    <automated>npm --prefix server run test -- --run && test -z "$(git diff --stat -- client/package.json client/package-lock.json server/package.json server/package-lock.json package.json package-lock.json 2>/dev/null)" && echo PASS</automated>
  </verify>
  <done>
    Full server test suite passes with zero failures, `git diff --stat` over every `package.json`
    and `package-lock.json` in the repo (root, client, server) is empty, and the final total size of
    `client/public/tamir-photos/` is reported and is substantially below the ~41-42MB starting point.
  </done>
</task>

</tasks>

<verification>
Run `npm --prefix server run test -- --run` — full suite passes, no regressions from recompressing
photo file content. Run `git diff --stat -- client/package.json client/package-lock.json
server/package.json server/package-lock.json package.json package-lock.json` — output is empty,
confirming `sharp` was never persisted as a dependency anywhere in the repo. Run
`du -sh client/public/tamir-photos` — total size is substantially below the ~41-42MB starting point.
Spot-check a handful of recompressed files by opening them in an image viewer or `sharp(...).metadata()`
to confirm they display correctly with no visible corruption or unexpected rotation.
</verification>

<success_criteria>
- All 53 files in `client/public/tamir-photos/` retain their exact original filenames — no renames,
  additions, or deletions.
- Every file that could be safely shrunk (max 1600px longest edge, quality 78 mozjpeg JPEG,
  EXIF-orientation baked in and stripped) was overwritten in place with a smaller version; any file
  that would have grown was left completely untouched.
- Directory total size drops from ~41-42MB to well under 20MB.
- Full server test suite (`npm --prefix server run test -- --run`) passes unchanged.
- No `package.json` or `package-lock.json` anywhere in the repo shows any diff — `sharp` was
  installed and removed entirely from an outside-the-repo scratch directory.
</success_criteria>

<output>
Create `.planning/quick/260907-mzz-compress-the-real-tamir-photos-in-client/260907-mzz-SUMMARY.md`
when done, including the reported before/after total size and a note of any file(s) that were kept
unchanged because compression would have made them larger.
</output>