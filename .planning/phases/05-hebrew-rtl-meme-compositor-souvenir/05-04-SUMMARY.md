---
phase: 05-hebrew-rtl-meme-compositor-souvenir
plan: 04
subsystem: ui
tags: [web-share-api, canvas, react, hebrew, vitest]

# Dependency graph
requires:
  - phase: 05-hebrew-rtl-meme-compositor-souvenir/05-03
    provides: "the multi-box drag editor and compositor.ts's rasterize/blobToBase64/memeDataUrl pipeline this plan's save/share flow builds on top of"
provides:
  - "client/src/share/saveOrShareMeme.ts — saveOrShareMeme(meme) three-branch (shared/dismissed/fallback) flow mirroring shareJoinLink.ts's proven shape"
  - "client/src/screens/round/SaveMemeFallback.tsx — full-screen long-press-to-save modal for the fallback branch"
  - "client/src/screens/round/SaveShareButton.tsx — the one reusable button+fallback-modal component RatingPanel and GameEndPanel both mount"
  - "RatingPanel.tsx's youAreAuthor branch renders SaveShareButton, giving every author a save/share chance during their own meme's real rating-step dwell time (MEME-03)"
  - "GameEndPanel.tsx's best-of-night entries each render SaveShareButton, letting any player save/share any top-3 entry including others' memes, view/export only (D-03)"
affects: []

# Actuals (#2632)
actuals:
  tokens: 3073
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Three-branch save/share result mirrors shareJoinLink.ts exactly: navigator.canShare({ files }) true + share() resolves -> shared; share() rejects with AbortError DOMException -> dismissed (not a failure); canShare absent/false or any other share() failure -> fallback with the decoded Blob. Tested via vi.stubGlobal('navigator', {...}) — no real browser or device needed for the branching logic itself."
    - "base64<->Blob round-trip uses plain atob/btoa + Uint8Array, matching compositor.ts's dependency-free approach — no Buffer usage in client code (client/src has no Node types in its tsconfig 'types' field, so Buffer would fail typecheck even with @types/node installed as a devDependency)."
    - "SaveMemeFallback revokes its own URL.createObjectURL result in the same useEffect's cleanup (T-05-07), so the object URL is never left reachable after the modal closes or the component unmounts."

key-files:
  created:
    - client/src/share/saveOrShareMeme.ts
    - client/src/share/saveOrShareMeme.test.ts
    - client/src/screens/round/SaveMemeFallback.tsx
    - client/src/screens/round/SaveShareButton.tsx
  modified:
    - client/src/screens/round/RatingPanel.tsx
    - client/src/screens/round/GameEndPanel.tsx
    - shared/messages.ts
    - client/src/index.css

key-decisions:
  - "Test file's SAMPLE_MEME and blobToBase64 helper use btoa/atob + manual byte iteration instead of the plan action block's suggested Buffer.from(...).toString('base64') — Buffer failed typecheck under client/tsconfig.app.json's restricted 'types': ['vite/client'] field (Rule 1 auto-fix: the plan's illustrative snippet, not a locked contract, produced a real typecheck failure that had to be fixed before the task's own <verify> command could pass)."
  - "Updated RatingPanel.tsx's top-of-component doc comment (previously said the meme's author 'sees a waiting state and no buttons at all') to describe the save/share button now rendered there, and to name MEME-03/plan 05-04 as why — a documentation-accuracy fix scoped to this plan's own file, matching 05-03-SUMMARY.md's precedent for the same kind of fix."

requirements-completed: [MEME-03]

coverage:
  - id: D1
    description: "saveOrShareMeme resolves 'shared' when navigator.canShare({ files }) is true and share() succeeds, without ever calling share() when canShare is absent or returns false."
    requirement: MEME-03
    verification:
      - kind: unit
        ref: "client/src/share/saveOrShareMeme.test.ts#returns shared when canShare({ files }) is true and share() resolves"
        status: pass
      - kind: unit
        ref: "client/src/share/saveOrShareMeme.test.ts#returns fallback with a blob and never calls share() when canShare is absent"
        status: pass
      - kind: unit
        ref: "client/src/share/saveOrShareMeme.test.ts#returns fallback with a blob and never calls share() when canShare returns false"
        status: pass
    human_judgment: false
  - id: D2
    description: "A user dismissing the native share sheet (AbortError) resolves 'dismissed', not treated as a failure; the fallback Blob round-trips back to the original base64 string; saveOrShareMeme never throws under any branch."
    requirement: MEME-03
    verification:
      - kind: unit
        ref: "client/src/share/saveOrShareMeme.test.ts#returns dismissed when share() rejects with an AbortError DOMException"
        status: pass
      - kind: unit
        ref: "client/src/share/saveOrShareMeme.test.ts#the fallback blob round-trips back to the original base64 string"
        status: pass
      - kind: unit
        ref: "client/src/share/saveOrShareMeme.test.ts#never throws under any branch, including an unexpected share() failure"
        status: pass
    human_judgment: false
  - id: D3
    description: "Every author — not just best-of-night winners — gets a real save/share chance: RatingPanel's youAreAuthor branch renders SaveShareButton with meme={ratingStep.meme} during the real (8-15s) rating-step dwell time."
    requirement: MEME-03
    verification:
      - kind: other
        ref: "grep -c \"SaveShareButton\" client/src/screens/round/RatingPanel.tsx == 2 (import + usage)"
        status: pass
      - kind: other
        ref: "npm --prefix client run build (vite build succeeds, confirming the full RatingPanel -> SaveShareButton -> saveOrShareMeme chain typechecks and bundles)"
        status: pass
    human_judgment: false
  - id: D4
    description: "At GAME_END, every best-of-night entry (including ones authored by someone other than the viewer) renders SaveShareButton with meme={entry.meme}, purely additive with no change to entry's shape, scoring, or protocol types (D-03)."
    requirement: MEME-03
    verification:
      - kind: other
        ref: "grep -c \"SaveShareButton\" client/src/screens/round/GameEndPanel.tsx == 2 (import + usage)"
        status: pass
      - kind: other
        ref: "code review: GameEndPanel.tsx's best-of-night <li> map only adds a <SaveShareButton> line; no change to BestOfEntry's fields, scoreboard sort, or gameEnd.winners computation"
        status: pass
    human_judgment: false
  - id: D5
    description: "[FLAGGED ASSUMPTION] The actual iOS Safari navigator.share/canShare behavior across real device/OS versions can only be proven on a genuine iPhone — jsdom's vi.stubGlobal('navigator', ...) proves the branching logic correctly but dispatches no real share sheet."
    requirement: MEME-03
    verification: []
    human_judgment: true
    rationale: "jsdom has no real Web Share API implementation; this plan's own <done> criterion for Task 1 and CLAUDE.md's own flagged LOW-confidence note both name a real-device check (Plan 05-05) as still required before Phase 5 is considered fully done — consistent with 05-03-SUMMARY.md's D5 precedent for the equivalent touch-drag assumption."

# Metrics
duration: ~10min
completed: 2026-09-07
status: complete
---

# Phase 5 Plan 4: Save/Share + Best-of-Night Reuse Summary

**A save/share button reachable by every meme's author during their own rating-step dwell time (not just the ~3 best-of-night winners), plus the same button reused on every best-of-night entry at GAME_END for view/export of others' memes.**

## Performance

- **Duration:** ~10 min
- **Tasks:** 2 completed
- **Files modified:** 8 (4 created, 4 modified)

## Accomplishments
- `client/src/share/saveOrShareMeme.ts` (new): the three-branch save/share flow (`shared`/`dismissed`/`fallback`), mirroring `shareJoinLink.ts`'s proven shape exactly — `navigator.canShare({ files })` tried first, an `AbortError` DOMException treated as dismissal not failure, everything else degrading to a fallback `Blob`.
- `client/src/share/saveOrShareMeme.test.ts` (new): 6 tests covering every behavior line in the plan (shared, dismissed, fallback-when-absent, fallback-when-false, base64/blob round-trip integrity, never-throws).
- `client/src/screens/round/SaveMemeFallback.tsx` (new): full-screen long-press-to-save modal, revoking its own object URL on cleanup (T-05-07).
- `client/src/screens/round/SaveShareButton.tsx` (new): the one reusable button+fallback-modal component both render surfaces mount.
- `client/src/screens/round/RatingPanel.tsx`: `youAreAuthor` branch now renders `<SaveShareButton meme={ratingStep.meme} />` alongside the existing waiting-state text — MEME-03's real gap-fill, since this is the one point every author already dwells looking at their own finished meme.
- `client/src/screens/round/GameEndPanel.tsx`: each best-of-night `<li>` now renders `<SaveShareButton meme={entry.meme} />` — D-03's view/export reuse, purely additive.
- `shared/messages.ts`: added `saveMemeButton`, `longPressInstructions`, `doneButton` to `HEBREW_UI` under a new `// plan 05-04` comment group.
- `client/src/index.css`: `.save-share-button` (outlined-secondary convention, matching `.swap-photo-button`) and `.save-meme-fallback`/`.save-meme-fallback img` (full-screen dark modal) rules.

## Task Commits

Each task was committed atomically:

1. **Task 1: The save/share flow — base64 decode, native share, long-press fallback** - `96bf89a` (feat)
2. **Task 2: Wire the save/share button into RatingPanel and GameEndPanel** - `7a5ba55` (feat)

**Plan metadata:** committed alongside this SUMMARY.

## Files Created/Modified
- `client/src/share/saveOrShareMeme.ts` - new: `saveOrShareMeme`, `SaveShareResult`
- `client/src/share/saveOrShareMeme.test.ts` - new: 6 unit tests covering all behaviors
- `client/src/screens/round/SaveMemeFallback.tsx` - new: full-screen long-press modal
- `client/src/screens/round/SaveShareButton.tsx` - new: reusable button + fallback-modal wiring
- `client/src/screens/round/RatingPanel.tsx` - `youAreAuthor` branch gains `SaveShareButton`; doc comment updated
- `client/src/screens/round/GameEndPanel.tsx` - best-of-night entries each gain `SaveShareButton`
- `shared/messages.ts` - three new `HEBREW_UI` keys
- `client/src/index.css` - `.save-share-button`, `.save-meme-fallback`, `.save-meme-fallback img`

## Decisions Made
See `key-decisions` in the frontmatter: (1) the test file's sample-data and round-trip helper use `btoa`/`atob` instead of the plan's illustrative `Buffer.from(...)` snippet, since `Buffer` isn't in scope under `client/tsconfig.app.json`'s restricted `types` field and failed `npm --prefix client run typecheck` — a Rule 1 auto-fix required to make the task's own required `<verify>` command pass; (2) `RatingPanel.tsx`'s stale doc comment (still describing "no buttons at all") updated to reflect the now-present save/share button, matching 05-03-SUMMARY.md's precedent for the same kind of fix.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Replaced Buffer-based base64 helpers in the test file with btoa/atob**
- **Found during:** Task 1 (writing `saveOrShareMeme.test.ts`)
- **Issue:** The plan's `<action>` block suggested `Buffer.from("x").toString("base64")` for the sample meme string and a `Buffer`-based round-trip helper. `client/tsconfig.app.json` restricts `"types"` to `["vite/client"]` only, so `Buffer` is not an ambient global in client code even though `@types/node` is installed as a devDependency — `npm --prefix client run typecheck` failed with `TS2591`/`TS2552`.
- **Fix:** Rewrote `SAMPLE_MEME` as `btoa("x")` and the round-trip helper as a small `arrayBuffer -> Uint8Array -> String.fromCharCode -> btoa` loop, mirroring the dependency-free byte-handling style `saveOrShareMeme.ts` itself already uses (`atob`/`Uint8Array`).
- **Files modified:** `client/src/share/saveOrShareMeme.test.ts`
- **Verification:** `npm --prefix client run typecheck` exits 0; `npm --prefix client run test -- --run saveOrShareMeme.test.ts` → 6/6 passed.
- **Committed in:** `96bf89a` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** The fix only touched test-file helper code, not the shipped `saveOrShareMeme.ts` module's logic or its behavior contract. No scope creep.

## Issues Encountered

None beyond the Buffer/typecheck issue documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `npm --prefix server run test -- --run` → 203/203 passed (no server regressions from this client-only plan)
- `npm --prefix client run test -- --run` → 57/57 passed (8 test files, including the new `saveOrShareMeme.test.ts`'s 6 tests)
- `npm --prefix client run typecheck` → exits 0
- `npm --prefix client run build` → succeeds (`built in 555ms`)
- `grep -c "SaveShareButton" client/src/screens/round/RatingPanel.tsx client/src/screens/round/GameEndPanel.tsx` → 2 and 2 (both wired)

**Threat model — mitigations confirmed in the implementation, not just declared:**

| Threat | Mitigation | Confirmed by |
|---|---|---|
| T-05-07 (information disclosure via `URL.createObjectURL`) | `SaveMemeFallback`'s `useEffect` revokes the object URL in its own cleanup function | Code review of `SaveMemeFallback.tsx`'s `useEffect` return value |
| T-05-08 (best-of-night save/share of another author's meme, D-03) | View/export only — no scoring, protocol, or server-state change; confirmed no `BestOfEntry`/`Room.ts` diffs in either task commit | `git diff --stat` for both task commits shows only client-side render/share files and `shared/messages.ts` changed |
| T-05-SC (package install) | This plan installs no new package — no `package.json`/lockfile changes | `git diff --stat` for both task commits shows no `package.json`/`package-lock.json` changes |

This plan fully implements MEME-03's save/share mechanism and D-03's best-of-night view/export reuse, closing the real gap CONTEXT.md left open — every author, every round, now has a genuine save/share opportunity, not only the handful whose memes reach best-of-night. The real-device iOS Safari check (D5 above) remains open until Plan 05-05, exactly as this plan's own `<verification>`/`<success_criteria>` blocks and CLAUDE.md's own flagged LOW-confidence note said it would be.

## Self-Check: PASSED

Confirmed on disk: `client/src/share/saveOrShareMeme.ts`, `client/src/share/saveOrShareMeme.test.ts`, `client/src/screens/round/SaveMemeFallback.tsx`, `client/src/screens/round/SaveShareButton.tsx` all present via `[ -f ]`. Both task commit hashes (`96bf89a`, `7a5ba55`) confirmed present in `git log --oneline`. Full client suite re-run at 57/57, client typecheck exits 0, client build succeeds, server suite re-run at 203/203, and no `git diff --diff-filter=D` deletions or leftover untracked files after either commit.

---
*Phase: 05-hebrew-rtl-meme-compositor-souvenir*
*Completed: 2026-09-07*
