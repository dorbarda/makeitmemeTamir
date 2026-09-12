---
task: 260907-mtn
type: execute
autonomous: true
files_modified:
  - server/src/rooms/photos.ts
  - server/test/photos.test.ts
---

<objective>
Fix `photoUrl()` in `server/src/rooms/photos.ts` so it percent-encodes the filename before building
the `/tamir-photos/` path, and prove it with a test.

Purpose: ~50 real photos were just uploaded to `client/public/tamir-photos/` via GitHub's web UI.
Several real filenames contain spaces and parentheses (e.g. "WhatsApp Image 2026-09-06 at 23.14.43
(1).jpeg", "IMG_1617_(2).jpg", "IMG_2755_(1).jpg"). `photoUrl()` currently interpolates the raw
filename into the URL path with no encoding, so any photo whose real filename has a space or other
reserved character produces a broken URL — confirmed via curl that the unencoded form 404s/fails
while the `%20`-encoded equivalent returns 200. Every round's photo assignment sends this URL
straight to the client, so this is a silent, live risk to the actual game.

Output: `photoUrl()` returns a correctly percent-encoded path for any filename, and
`server/test/photos.test.ts` has a passing test proving it for a filename containing a space and
parentheses.
</objective>

<context>
@server/src/rooms/photos.ts
@server/test/photos.test.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Encode filename in photoUrl() + prove it with a test</name>
  <files>server/src/rooms/photos.ts, server/test/photos.test.ts</files>
  <behavior>
    - Existing test (must keep passing): `photoUrl("x.jpg")` still returns exactly
      `/tamir-photos/x.jpg` — a plain filename with no reserved characters is unaffected by encoding.
    - New test: given a filename containing a space and parentheses (e.g. `"IMG_1617 (2).jpg"`),
      `photoUrl(...)` returns a string that does NOT contain a raw space character and does contain
      `%20`, AND `new URL(photoUrl(input), "http://x")` parses without throwing, with its
      `.pathname` decoding (via `decodeURIComponent`) back to `` `/tamir-photos/${input}` ``.
  </behavior>
  <action>
    RED: in `server/test/photos.test.ts`, inside the existing `describe("photoUrl", ...)` block, add
    a new `it(...)` asserting the encoding behavior described above for an input filename containing
    a space and parentheses. Run the suite and confirm this new assertion fails against the current
    unencoded implementation (the existing "returns exactly /tamir-photos/&lt;filename&gt;" test
    should still pass unchanged, since a plain filename has nothing to encode).

    GREEN: in `server/src/rooms/photos.ts`, change `photoUrl()` to build the path using
    `encodeURIComponent(filename)` in place of the raw `filename`, so reserved/unsafe characters
    (spaces, parentheses, non-ASCII, etc.) are percent-encoded in the URL path segment. Do not touch
    `loadPhotoFilenames()`, the `readdirSync` enumeration, `PHOTO_FILENAMES`, or any other exported
    function (`assignPhotos`, `drawOnePhoto`, `assignPhotosFromEligiblePools`, `shuffle`) — this is a
    pure output-encoding fix scoped to the one function that builds the served path.

    Re-run the full `photos.test.ts` file to confirm every test passes, including the pre-existing
    ones (`assignPhotos`, `assignPhotosFromEligiblePools`, `drawOnePhoto`, and the real-filesystem
    `PHOTO_FILENAMES` smoke check).
  </action>
  <verify>
    <automated>npm --prefix server run test -- --run test/photos.test.ts</automated>
  </verify>
  <done>
    `photoUrl()` percent-encodes the filename via `encodeURIComponent()` before building the
    `/tamir-photos/` path. `server/test/photos.test.ts` contains a passing test proving a filename
    with a space and parentheses round-trips correctly through `new URL(...)` /
    `decodeURIComponent`, the pre-existing plain-filename test still passes unchanged, and the full
    `photos.test.ts` suite passes.
  </done>
</task>

</tasks>

<verification>
Run `npm --prefix server run test -- --run test/photos.test.ts` — all tests in the file pass,
including the new space/parentheses encoding test and every pre-existing test in the file.
</verification>

<success_criteria>
- `photoUrl(filename)` returns a properly percent-encoded path for any filename, including ones
  with spaces and parentheses.
- A test in `server/test/photos.test.ts` proves this for a filename containing a space and
  parentheses (asserts presence of `%20`, absence of a raw space, and a correct `new URL(...)`
  round-trip).
- No change to `PHOTO_FILENAMES`, the `readdirSync`-based enumeration, or any other exported
  function in `server/src/rooms/photos.ts`.
</success_criteria>

<output>
Create `.planning/quick/260907-mtn-fix-photourl-in-server-src-rooms-photos-/260907-mtn-SUMMARY.md` when done.
</output>
