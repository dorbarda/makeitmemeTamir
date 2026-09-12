---
phase: 05-hebrew-rtl-meme-compositor-souvenir
plan: 02
subsystem: ui
tags: [canvas, react, rtl, hebrew, fontsource, vitest]

# Dependency graph
requires:
  - phase: 05-hebrew-rtl-meme-compositor-souvenir/05-01
    provides: "shared/protocol.ts's opaque meme: string field on RatingStepView/RoundEndEntry/BestOfEntry, and server/src/rooms/Room.ts's shape/size-only submitCaption validation"
provides:
  - "client/src/canvas/compositor.ts — CaptionBox, drawFrame, rasterize, blobToBase64, memeDataUrl, CANVAS_WIDTH/HEIGHT, BOX_WIDTH/HEIGHT: the pure, canvas-injectable composition primitives every later Phase 5 wave (drag editor, save/share) builds on"
  - "client/src/screens/round/WritingPanel.tsx rewritten as a single-box canvas compositor that rasterizes to base64 PNG at submit and emits { meme }"
  - "RatingPanel.tsx, RoundEndPanel.tsx, GameEndPanel.tsx each render <img src={memeDataUrl(x.meme)}> in place of the old separate photo+caption pair"
  - "@fontsource/heebo added to client/package.json, imported and gated behind document.fonts.ready before any canvas text draw"
affects: []

# Actuals (#2632)
actuals:
  tokens: 5300
  tasks: 2
  commits: 2

tech-stack:
  added: ["@fontsource/heebo"]
  patterns:
    - "Rasterize-and-transmit: WritingPanel is the only render surface that ever calls drawFrame with live-edited state; every downstream surface (RatingPanel/RoundEndPanel/GameEndPanel) treats the stored meme as an immutable, already-rendered PNG and only ever calls memeDataUrl() to build an <img src> — no canvas code, no font-loading gate needed downstream."
    - "Canvas-injectable pure functions: drawFrame/rasterize/blobToBase64 all take their canvas/context as a parameter rather than reading from a module-level ref, which is what makes compositor.test.ts able to unit-test them against a hand-built fake ctx object without a real browser Canvas 2D implementation (jsdom has none)."
    - "The empty-caption validation moved entirely client-side: handleSubmit checks `boxes.some(b => b.text.trim().length > 0)` before ever touching the canvas, because a rasterized image is always non-empty bytes even when its visible text is blank — the server (Plan 05-01) can no longer distinguish the two."

key-files:
  created:
    - client/src/canvas/compositor.ts
    - client/src/canvas/compositor.test.ts
  modified:
    - client/package.json
    - client/src/screens/round/WritingPanel.tsx
    - client/src/screens/round/RatingPanel.tsx
    - client/src/screens/round/RoundEndPanel.tsx
    - client/src/screens/round/GameEndPanel.tsx
    - client/src/index.css

key-decisions:
  - "The <canvas> element was placed at the same top-level position the old <img className=\"meme-photo\"> occupied (rendered unconditionally, outside the youSubmitted/form branch) rather than nested inside the <form>, matching the original component's structure exactly — the plan's action text described the canvas replacing the img line, and preserving the original render position (rather than only showing the canvas pre-submission) keeps the photo visibly present after submission too, consistent with pre-existing behavior."
  - "compositor.test.ts's blobToBase64 test uses the browser-native `btoa()` instead of Node's `Buffer` — `Buffer` isn't declared in this project's client tsconfig types (`[\"vite/client\"]`, no `@types/node` in the types array), so using it would fail typecheck even though the test itself would run fine under vitest's Node-backed jsdom environment. btoa is available in both jsdom and real browsers and needed no config change."

requirements-completed: [MEME-01, HEB-03]

coverage:
  - id: D1
    description: "A single caption box composes live on a canvas in WritingPanel (photo + Hebrew text with a semi-transparent backing), rasterizes to base64 PNG on submit, and that exact PNG renders identically as an <img> in RatingPanel/RoundEndPanel/GameEndPanel — the rasterize-and-transmit pipeline proven end to end."
    requirement: MEME-01
    verification:
      - kind: unit
        ref: "client/src/canvas/compositor.test.ts (drawFrame calls ctx.drawImage once with the photo; skips fillRect/fillText for empty text; rasterize resolves/rejects correctly; blobToBase64 round-trips exact bytes; memeDataUrl builds the exact data URL)"
        status: pass
      - kind: other
        ref: "npm --prefix client run build (vite build succeeds, confirming the full WritingPanel -> RatingPanel/RoundEndPanel/GameEndPanel chain typechecks and bundles)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Submit is refused client-side (no socket emit) when the caption box's trimmed text is empty."
    requirement: MEME-01
    verification:
      - kind: other
        ref: "code review of WritingPanel.tsx's handleSubmit: `if (!boxes.some((b) => b.text.trim().length > 0)) { setError(...); return; }` runs before any canvas/socket call"
        status: pass
    human_judgment: false
  - id: D3
    description: "document.fonts.ready gates every canvas text draw, and ctx.direction='rtl' is set before fillText — the mechanism HEB-03 depends on."
    requirement: HEB-03
    verification:
      - kind: unit
        ref: "client/src/canvas/compositor.test.ts#sets ctx.direction to rtl and calls fillText with the box's exact, unmodified mixed text"
        status: pass
      - kind: other
        ref: "grep -c \"document.fonts.ready\" client/src/screens/round/WritingPanel.tsx == 1"
        status: pass
    human_judgment: false
  - id: D4
    description: "[FLAGGED ASSUMPTION] Real bidi/glyph-shaping correctness for mixed Hebrew/digit/Latin captions can only be proven by visual inspection on a real device — this plan's jsdom-based tests can only prove the caption string reaches fillText unmodified."
    requirement: HEB-03
    verification: []
    human_judgment: true
    rationale: "jsdom has no real Canvas 2D implementation; no automated test in this environment can render actual pixels or verify browser bidi reordering. Plan 05-05's real-device check is the designated place this gets confirmed, per this plan's own explicit flagged-assumption truth."

# Metrics
duration: ~35min
completed: 2026-09-07
status: complete
---

# Phase 5 Plan 2: Rasterize-and-Transmit Tracer Summary

**Single-box canvas compositor (Canvas 2D + `ctx.direction='rtl'` + `@fontsource/heebo`) proves the full rasterize-and-submit-as-base64-PNG pipeline end to end, from WritingPanel through RatingPanel/RoundEndPanel/GameEndPanel.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 2 completed
- **Files modified:** 7 (2 created, 5 modified)

## Accomplishments
- `client/src/canvas/compositor.ts` (new): pure, canvas-injectable `drawFrame`, `rasterize`, `blobToBase64`, `memeDataUrl` functions plus the `CaptionBox`/`CANVAS_WIDTH`/`CANVAS_HEIGHT`/`BOX_WIDTH`/`BOX_HEIGHT` constants — no React/DOM-lifecycle code, unit-testable without a real browser canvas.
- `client/src/canvas/compositor.test.ts` (new): 7 tests covering `drawImage` call shape, empty-text skip behavior, `ctx.direction='rtl'` + exact mixed-text `fillText` calls (Hebrew + digits + Latin), `rasterize`'s resolve/reject branches, `blobToBase64`'s exact byte round-trip, and `memeDataUrl`'s literal output.
- `client/src/screens/round/WritingPanel.tsx` rewritten: renders a `<canvas>` (photo + one centered caption box, live redraw as the player types) instead of the old `<img>` + `<textarea>`; `handleSubmit` refuses to emit when the box's trimmed text is empty, awaits `document.fonts.ready`, redraws once more, then rasterizes and emits `{ meme }` via the exact same `socket.once` error/state round-trip pattern; submit button disabled while `submitting` to prevent a double-tap double-rasterize.
- `RatingPanel.tsx`, `RoundEndPanel.tsx`, `GameEndPanel.tsx`: each now renders a single `<img src={memeDataUrl(x.meme)}>` in place of the old separate photo `<img>` + caption `<p>` pair.
- `client/src/index.css`: adds `.meme-canvas`, sized identically to the existing `.meme-photo` so the live compositor and every downstream `<img>` read as the same visual element.
- `@fontsource/heebo` added to `client/package.json` (pre-approved in RESEARCH.md's Package Legitimacy Audit table).

## Task Commits

Each task was committed atomically:

1. **Task 1: The tracer — single-box canvas compositor in WritingPanel, rasterize, submit as meme** - `30d5045` (feat)
2. **Task 2: Downstream rendering — RatingPanel, RoundEndPanel, GameEndPanel show the composited meme** - `6586b95` (feat)

**Plan metadata:** committed alongside this SUMMARY.

## Files Created/Modified
- `client/src/canvas/compositor.ts` - new: `CaptionBox`, `drawFrame`, `rasterize`, `blobToBase64`, `memeDataUrl`, size constants
- `client/src/canvas/compositor.test.ts` - new: unit tests for all five exports
- `client/src/screens/round/WritingPanel.tsx` - canvas-based single-box compositor, `MAX_CAPTION_BOX_GRAPHEMES` (renamed/resized from `MAX_CAPTION_GRAPHEMES`), `{ meme }` submit payload
- `client/src/screens/round/RatingPanel.tsx` - `<img src={memeDataUrl(ratingStep.meme)}>` replaces photo+caption pair
- `client/src/screens/round/RoundEndPanel.tsx` - `<img src={memeDataUrl(entry.meme)}>` replaces the caption `<p>`
- `client/src/screens/round/GameEndPanel.tsx` - `<img src={memeDataUrl(entry.meme)}>` replaces photo+caption pair
- `client/src/index.css` - `.meme-canvas` rule
- `client/package.json` / `client/package-lock.json` - `@fontsource/heebo` dependency

## Decisions Made
See `key-decisions` in the frontmatter: the `<canvas>` element's placement mirrors the original `<img>`'s exact top-level position (not nested in the form) so it stays visible after submission, matching pre-existing WritingPanel behavior; `compositor.test.ts` uses `btoa()` instead of `Buffer` to avoid a client tsconfig types mismatch.

## Deviations from Plan

None - plan executed exactly as written. Both tasks matched their `<action>` blocks; all `<verify>` and `<acceptance_criteria>` items passed without needing any Rule 1-4 auto-fixes.

## Issues Encountered

`compositor.test.ts`'s originally-written `Buffer.from(...)` call for asserting `blobToBase64`'s output failed `tsc` typecheck (`Cannot find name 'Buffer'`) because this client package's `tsconfig.app.json` `types` array is `["vite/client"]` only, with no Node types declared. Swapped to the browser-native `btoa()`, which is available in both jsdom (the test's actual runtime) and real browsers, and required no tsconfig change.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness

- `npm --prefix server run test -- --run` → 203/203 passed (no server regressions from this client-only plan)
- `npm --prefix server run typecheck` → exits 0
- `npm --prefix client run test -- --run` → 41/41 passed (6 test files, including the new `compositor.test.ts`'s 7 tests)
- `npm --prefix client run typecheck` → exits 0
- `npm --prefix client run build` → succeeds (`built in 1.01s`)

**Threat model — mitigations confirmed in the implementation, not just declared:**

| Threat | Mitigation | Confirmed by |
|---|---|---|
| T-05-04 (tampering via `<img src={memeDataUrl(x.meme)}>`) | React sets `src` as a plain attribute, never `dangerouslySetInnerHTML`; the `data:image/png;base64,` prefix is a fixed literal `memeDataUrl` controls | Code review of `RatingPanel.tsx`/`RoundEndPanel.tsx`/`GameEndPanel.tsx`; `compositor.ts`'s `memeDataUrl` implementation |
| T-05-05 (information disclosure via pre-submit canvas state) | Only the authoring player's own browser holds the canvas until `handleSubmit` rasterizes and emits — nothing transmitted before that | Code review of `WritingPanel.tsx`'s `handleSubmit`; no socket emit occurs before rasterization |
| T-05-SC (package install) | `@fontsource/heebo` is the only new package, pre-approved in RESEARCH.md's Package Legitimacy Audit table | `git diff --stat` confirms only `@fontsource/heebo` added to `client/package.json` |

This plan is the tracer every remaining Phase 5 wave extends. Plan 05-03 (drag editor, up to 3 boxes) builds directly on `CaptionBox`/`drawFrame`'s existing shape — no rework needed, only extension (add/remove/drag on the same array). The HEB-03 real-bidi-rendering flagged assumption (D4 above) remains open until Plan 05-05's real-device check, exactly as this plan's own frontmatter documented it would be.

## Self-Check: PASSED

Confirmed on disk: `client/src/canvas/compositor.ts`, `client/src/canvas/compositor.test.ts` both present via `[ -f ]`. Both task commit hashes (`30d5045`, `6586b95`) confirmed present in `git log --oneline`. Full client suite re-run at 41/41, client typecheck exits 0, client build succeeds, server suite re-run at 203/203 with server typecheck exiting 0, and no `git diff --diff-filter=D` deletions or leftover untracked files after either commit.

---
*Phase: 05-hebrew-rtl-meme-compositor-souvenir*
*Completed: 2026-09-07*
