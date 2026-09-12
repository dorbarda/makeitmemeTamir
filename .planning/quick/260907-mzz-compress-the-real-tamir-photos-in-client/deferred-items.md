# Deferred Items — 260907-mzz

## Out-of-scope: flaky test failure from unencoded filename comparison

**Files:** `server/test/realContent.integration.test.ts`, `server/test/photoSwap.integration.test.ts`

**Discovered during:** Task 2 (`npm --prefix server run test -- --run`) verification of this
quick task.

**Root cause:** commit `cfa8f55` (quick task `260907-mtn`) changed `photoUrl()` in
`server/src/rooms/photos.ts` to `encodeURIComponent()` the filename when building the served
URL. Both integration tests still compare the *encoded* URL suffix directly against the *raw*
entries in `PHOTO_FILENAMES` (`expect(PHOTO_FILENAMES).toContain(yourPhotoUrl!.replace("/tamir-photos/", ""))`)
without decoding first. This assertion only fails when the player is randomly assigned a photo
whose filename contains characters `encodeURIComponent` escapes (spaces, parentheses — e.g. the
`WhatsApp Image ... (1).jpeg` files or `IMG_1617_(2).jpg`). Confirmed flaky by re-running the
full suite 4 times: failed 2/4 runs, passed 2/4 runs, with the specific failing assertion always
being this same encoding mismatch on whichever test happened to draw an affected filename.

**Why out of scope here:** This quick task (260907-mzz) only recompresses photo *byte content*
in place — it does not rename any file or touch `photoUrl()`/test code. The bug reproduces
identically on the pre-compression byte content and is unrelated to compression; it was already
latent in the repo before this task started.

**Recommended follow-up:** a small quick task to fix both assertions to
`decodeURIComponent(yourPhotoUrl!.replace("/tamir-photos/", ""))` before the `toContain` check.

**Status:** open, not fixed by this task.
