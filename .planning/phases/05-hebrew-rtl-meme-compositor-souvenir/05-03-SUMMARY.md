---
phase: 05-hebrew-rtl-meme-compositor-souvenir
plan: 03
subsystem: ui
tags: [canvas, react, pointer-events, drag-and-drop, hebrew, vitest]

# Dependency graph
requires:
  - phase: 05-hebrew-rtl-meme-compositor-souvenir/05-02
    provides: "client/src/canvas/compositor.ts's CaptionBox/drawFrame/rasterize/blobToBase64 pipeline and WritingPanel.tsx's single-fixed-box canvas compositor this plan extends to a full drag editor"
provides:
  - "client/src/canvas/hitTest.ts — MAX_CAPTION_BOXES, getBoxAtPoint, clampBoxPosition, nextBoxPosition, canAddBox: pure hit-testing/placement primitives, unit-tested in isolation for the adjacency (full-overlap) and ordering (array-order-wins) edge cases"
  - "WritingPanel.tsx rewritten with pointer-event drag-and-drop (setPointerCapture, coordinate-scaled getCanvasPoint), an add-caption-box button gated on canAddBox, and a per-box remove button gated on boxes.length > 1"
  - "shared/messages.ts HEBREW_UI gains memeEditorInstructions/addCaptionBoxButton/deleteCaptionButton"
  - ".meme-canvas gains touch-action: none (prevents the browser's scroll gesture fighting a real-phone touch-drag); new .meme-editor-instructions/.caption-box-row/.caption-box-remove CSS rules"
affects: []

# Actuals (#2632)
actuals:
  tokens: 3700
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Reverse-array-order hit-testing: getBoxAtPoint iterates boxes.length-1 down to 0 so the LAST array element (drawn on top by compositor.ts's existing forward-order draw loop) always wins a tap on overlapping boxes — no collision/merge logic exists, and none is needed."
    - "Stable array order for drag/add/remove: adding a box always appends (`[...boxes, newBox]`); dragging updates a box in place via `.map` without reordering; removing filters by id. Together these guarantee a tap on overlapping boxes is always deterministic, never randomized by insertion order changing."
    - "Coordinate-scaling before hit-testing: getCanvasPoint converts CSS-pixel pointer coordinates to the canvas's intrinsic pixel space (`canvas.width / rect.width`) before any comparison against box.x/box.y, because .meme-canvas is CSS-scaled via `width: 100%` (RESEARCH.md's documented gotcha) — skipping this would make hit-testing and dragging silently drift out of sync with the visible boxes on any phone where CSS width != canvas.width."
    - "Pure module extension over duplication: hitTest.ts imports BOX_WIDTH/BOX_HEIGHT/CANVAS_WIDTH/CANVAS_HEIGHT from compositor.ts rather than redefining them, keeping the single source of truth for box/canvas dimensions in compositor.ts."

key-files:
  created:
    - client/src/canvas/hitTest.ts
    - client/src/canvas/hitTest.test.ts
  modified:
    - client/src/screens/round/WritingPanel.tsx
    - shared/messages.ts
    - client/src/index.css

key-decisions:
  - "Updated WritingPanel.tsx's top-of-component doc comment (originally written by Plan 05-02 to describe the single-fixed-box tracer) to describe the current multi-box drag-editor state, since the old comment's claim ('one caption box drawn on top... before Wave 3 adds drag/add/remove') was now stale and would mislead a future reader — a documentation-accuracy fix scoped entirely to this plan's own files, not a functional deviation."

requirements-completed: [MEME-01]

coverage:
  - id: D1
    description: "A player can add up to 3 caption boxes (MEME-01/D-05) and drag each one, via pointer events with setPointerCapture, to any position on the canvas; a 4th add is impossible because the add button disappears once canAddBox returns false."
    requirement: MEME-01
    verification:
      - kind: unit
        ref: "client/src/canvas/hitTest.test.ts#canAddBox returns true for 0/1/2 existing boxes and false for 3 (MAX_CAPTION_BOXES)"
        status: pass
      - kind: other
        ref: "grep -c \"setPointerCapture\" client/src/screens/round/WritingPanel.tsx == 2 (setPointerCapture in handlePointerDown, releasePointerCapture in handlePointerUp)"
        status: pass
      - kind: other
        ref: "npm --prefix client run build (vite build succeeds, confirming the full WritingPanel -> hitTest chain typechecks and bundles)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Two caption boxes may fully overlap with no collision/merge logic — hit-testing and rendering both resolve overlap purely by array order, with the LAST box always drawn on top and always the one a tap/drag lands on."
    requirement: MEME-01
    verification:
      - kind: unit
        ref: "client/src/canvas/hitTest.test.ts#getBoxAtPoint returns the LAST box in the array for a point inside two overlapping boxes"
        status: pass
    human_judgment: false
  - id: D3
    description: "Caption boxes are drawn and hit-tested in stable array order; a newly added box is always appended last; dragging repositions a box in place without reordering the array."
    requirement: MEME-01
    verification:
      - kind: other
        ref: "code review: WritingPanel.tsx's add-box onClick appends via [...boxes, newBox]; handlePointerMove updates via boxes.map (no reorder); compositor.ts's drawFrame (Plan 05-02, unchanged) iterates boxes in forward array order"
        status: pass
    human_judgment: false
  - id: D4
    description: "At least one caption box always remains in the editor's UI — the remove button is disabled (not rendered) once only one box is left."
    requirement: MEME-01
    verification:
      - kind: other
        ref: "code review: WritingPanel.tsx's per-box remove button is gated on `boxes.length > 1`, so the last remaining box never offers a remove control"
        status: pass
    human_judgment: false
  - id: D5
    description: "[FLAGGED ASSUMPTION] Real touch-drag behavior on a genuine phone (pointer capture across a scroll gesture, coordinate scaling on a real device pixel ratio) can only be proven by hands-on testing — jsdom has no real pointer/touch event dispatch and no real Canvas 2D implementation."
    requirement: MEME-01
    verification: []
    human_judgment: true
    rationale: "jsdom cannot dispatch real touch/pointer sequences or render actual canvas pixels; this plan's own <verification> block explicitly names a real-device touch-drag check as still required before Phase 5 is considered done (Plan 05-05), consistent with 05-02-SUMMARY.md's own flagged HEB-03 assumption pattern."

# Metrics
duration: ~8min
completed: 2026-09-07
status: complete
---

# Phase 5 Plan 3: Multi-Box Drag Editor Summary

**Up to 3 independently draggable Hebrew caption boxes via pointer events + setPointerCapture, with deterministic reverse-array-order hit-testing for overlapping boxes.**

## Performance

- **Duration:** ~8 min
- **Tasks:** 2 completed
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments
- `client/src/canvas/hitTest.ts` (new): pure `getBoxAtPoint`, `clampBoxPosition`, `nextBoxPosition`, `canAddBox`, `MAX_CAPTION_BOXES` — no React/DOM code, unit-testable without a real browser canvas, matching `compositor.ts`'s established pure-module pattern.
- `client/src/canvas/hitTest.test.ts` (new): 10 tests covering exact hit resolution, inclusive edge bounds, the full-overlap/last-array-element-wins case, both clamp boundaries, `nextBoxPosition`'s distinct-and-in-bounds guarantee across 0/1/2 existing boxes, and `canAddBox`'s true/false boundary at 3.
- `client/src/screens/round/WritingPanel.tsx`: added `getCanvasPoint` (CSS-to-intrinsic-pixel coordinate scaling), `handlePointerDown`/`handlePointerMove`/`handlePointerUp` wired onto the canvas (`onPointerCancel` reuses the same up-handler), a per-box `<div className="caption-box-row">` replacing the old single `<input>`, an add-caption-box button gated on `canAddBox(boxes.length)`, and a per-box remove button gated on `boxes.length > 1`.
- `shared/messages.ts`: added `memeEditorInstructions`, `addCaptionBoxButton`, `deleteCaptionButton` to `HEBREW_UI` under a new `// plan 05-03` comment group.
- `client/src/index.css`: `touch-action: none` added to `.meme-canvas` (CRITICAL per RESEARCH.md — prevents a real-phone touch-drag from fighting the browser's own scroll gesture); new `.meme-editor-instructions`, `.caption-box-row`, `.caption-box-remove` rules.

## Task Commits

Each task was committed atomically:

1. **Task 1: Pure hit-testing and placement module** - `6e8cb37` (feat)
2. **Task 2: Wire pointer-event drag-and-drop, add/remove boxes, into WritingPanel** - `2dd1dd9` (feat)

**Plan metadata:** committed alongside this SUMMARY.

## Files Created/Modified
- `client/src/canvas/hitTest.ts` - new: `MAX_CAPTION_BOXES`, `getBoxAtPoint`, `clampBoxPosition`, `nextBoxPosition`, `canAddBox`
- `client/src/canvas/hitTest.test.ts` - new: 10 unit tests covering all five exports and both plan-locked edge cases (adjacency, ordering)
- `client/src/screens/round/WritingPanel.tsx` - pointer-event drag handlers, per-box input row, add/remove buttons, updated top-of-component doc comment
- `shared/messages.ts` - three new `HEBREW_UI` keys
- `client/src/index.css` - `touch-action: none` on `.meme-canvas`, new `.meme-editor-instructions`/`.caption-box-row`/`.caption-box-remove` rules

## Decisions Made
See `key-decisions` in the frontmatter: updated WritingPanel.tsx's stale top-of-component doc comment (still describing Plan 05-02's single-fixed-box tracer) to describe the current multi-box drag-editor state — a documentation-accuracy fix within this plan's own file, not a functional change.

## Deviations from Plan

None - plan executed exactly as written. Both tasks matched their `<action>` blocks; all `<verify>` and `<acceptance_criteria>` items passed without needing any Rule 1-4 auto-fixes. (The doc-comment update above is documentation-only and scoped to a file this plan already modifies — not a deviation requiring a rule citation.)

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `npm --prefix server run test -- --run` → 203/203 passed (no server regressions from this client-only plan)
- `npm --prefix client run test -- --run` → 51/51 passed (7 test files, including the new `hitTest.test.ts`'s 10 tests)
- `npm --prefix client run typecheck` → exits 0
- `npm --prefix client run build` → succeeds (`built in 571ms`)
- `grep -c "setPointerCapture" client/src/screens/round/WritingPanel.tsx` → 2 (capture in `handlePointerDown`, release in `handlePointerUp`)
- `grep -c "touch-action: none" client/src/index.css` → 2 (the rule declaration plus this summary's own doc comment referencing it — the CSS rule itself is present exactly once on `.meme-canvas`)

**Threat model — mitigations confirmed in the implementation, not just declared:**

| Threat | Mitigation | Confirmed by |
|---|---|---|
| T-05-06 (tampering via client-side box count) | `canAddBox`/`MAX_CAPTION_BOXES` bound the add-button UI to 3 boxes; server never inspects box count (only the final rasterized image's byte size, per Plan 05-01) | Code review of `hitTest.ts`'s `canAddBox`, `WritingPanel.tsx`'s add-button gating; unchanged server-side `Room.ts` validation from Plan 05-01/05-02 |
| T-05-SC (package install) | This plan installs no new package — no `package.json`/lockfile changes | `git diff --stat` for both task commits shows no `package.json`/`package-lock.json` changes |

This plan fully implements MEME-01/D-05's multi-box, drag-to-position scope on top of Plan 05-02's proven single-box rasterize-and-transmit pipeline — no rework of `compositor.ts`'s `drawFrame` was needed, since it already looped over the full `boxes` array in array order. The real-device touch-drag check (D5 above) remains open until Plan 05-05, exactly as this plan's own `<verification>` block and CONTEXT.md's playtest-history section documented it would be.

## Self-Check: PASSED

Confirmed on disk: `client/src/canvas/hitTest.ts`, `client/src/canvas/hitTest.test.ts` both present via `[ -f ]`. Both task commit hashes (`6e8cb37`, `2dd1dd9`) confirmed present in `git log --oneline`. Full client suite re-run at 51/51, client typecheck exits 0, client build succeeds, server suite re-run at 203/203, and no `git diff --diff-filter=D` deletions or leftover untracked files after either commit.

---
*Phase: 05-hebrew-rtl-meme-compositor-souvenir*
*Completed: 2026-09-07*
