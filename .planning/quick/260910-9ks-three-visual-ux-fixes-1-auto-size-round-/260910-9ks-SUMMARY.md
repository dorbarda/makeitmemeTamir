---
phase: quick
plan: 260910-9ks
subsystem: ui
tags: [canvas, rtl, react, css, animation]

requires: []
provides:
  - Caption box height computed from word-wrapped text instead of a fixed 100px rectangle
  - Rounded-corner box rendering (ctx.roundRect with manual arc-based fallback)
  - Dashed "+" affordance on the add-caption-box button
  - BouncingLogo component: DVD-screensaver-style animation on the Lobby screen only
affects: [compositor, WritingPanel, Lobby]

actuals:
  tokens: 3491
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Canvas text auto-sizing: greedy word-wrap via ctx.measureText, then box height = lines * LINE_HEIGHT + padding*2"
    - "ctx.roundRect feature-detection with manual arcTo-based fallback for jsdom/older browsers"
    - "requestAnimationFrame animation loop driven by a mutable ref (never React state) with direct DOM style.transform mutation for 60fps perf, cleaned up via cancelAnimationFrame in useEffect return"

key-files:
  created:
    - client/src/components/BouncingLogo.tsx
  modified:
    - client/src/canvas/compositor.ts
    - client/src/canvas/compositor.test.ts
    - client/src/screens/round/WritingPanel.tsx
    - client/src/screens/Lobby.tsx
    - client/src/index.css

key-decisions:
  - "BOX_HEIGHT stays exported unchanged at 100 for WritingPanel.tsx/hitTest.ts's fixed layout/hit-test use, decoupled from drawFrame's now-dynamic rendered box height — documented as an accepted minor tradeoff (hit-area is never smaller than the visible box)."
  - "compositor.test.ts's makeFakeCtx() types roundRect as an explicit undefined-by-default field (rather than omitting the key entirely) so typeof ctx.roundRect === 'function' still evaluates false and the fallback path is exercised identically, while keeping a single consistent TypeScript type across both branches."

patterns-established:
  - "Decorative animated elements get pointer-events: none and are wired into exactly one screen, verified by a negative grep across all other screens."

requirements-completed: []

coverage:
  - id: D1
    description: "Caption box auto-sizes to wrapped text height with rounded corners instead of a fixed 360x100 black rectangle"
    verification:
      - kind: unit
        ref: "client/src/canvas/compositor.test.ts#auto-sizes a short caption's box well below the old fixed 100px height (roundRect branch)"
        status: pass
      - kind: unit
        ref: "client/src/canvas/compositor.test.ts#wraps a long caption across multiple lines and grows the box height accordingly"
        status: pass
      - kind: unit
        ref: "client/src/canvas/compositor.test.ts#exercises the manual rounded-rect fallback when ctx.roundRect is unavailable"
        status: pass
    human_judgment: false
  - id: D2
    description: "Add-caption-box button renders with a clearly distinct dashed '+' affordance"
    verification:
      - kind: manual_procedural
        ref: "grep caption-box-add in WritingPanel.tsx and index.css"
        status: pass
    human_judgment: true
    rationale: "Visual distinctness ('clearly reads as different from the send button') is a subjective UI judgment that automated grep/typecheck cannot assess."
  - id: D3
    description: "BouncingLogo renders a DVD-screensaver-style bouncing hero photo exclusively on the Lobby screen, never blocking taps, with no leaked animation frame"
    verification:
      - kind: manual_procedural
        ref: "npm --prefix client run typecheck && grep BouncingLogo across client/src/screens"
        status: pass
    human_judgment: true
    rationale: "Real-device visual bounce behavior, tap-passthrough, and animation-frame cleanup on unmount require manual on-screen verification the automated checks can only partially prove (they confirm cancelAnimationFrame exists and is wired to exactly one screen, not that the bounce looks correct or no console warning fires)."

duration: 15min
completed: 2026-09-10
status: complete
---

# Quick Task 260910-9ks: Three Visual/UX Fixes Summary

**Canvas caption box auto-sizes to wrapped Hebrew text with rounded corners, add-box button gets a dashed "+" affordance, and a DVD-screensaver-style bouncing hero photo animates on the Lobby screen only.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-09-10T07:00:00Z (approx)
- **Completed:** 2026-09-10T07:07:33Z
- **Tasks:** 3
- **Files modified:** 6 (5 modified, 1 created)

## Accomplishments
- `compositor.ts`'s `drawFrame` now computes each non-empty caption box's height from greedy word-wrapped text (`wrapCaptionText`, RTL-aware via `ctx.measureText`), replacing the fixed 100px rectangle that wasted space on short captions like "תמיר"
- Added `drawRoundedBox` with `ctx.roundRect` feature detection and a manual `arcTo`-based fallback, so the box backing renders with rounded corners in both modern-canvas and jsdom/legacy-canvas environments — still a single flat `rgba(0, 0, 0, 0.6)` fill, never a gradient
- `WritingPanel.tsx`'s existing add-box button now renders `+ הוספת כיתוב` with a `.caption-box-add` dashed-border, translucent-background style, visually distinct from the primary send button and the outlined remove button — no changes to `canAddBox`/`nextBoxPosition`/drag logic
- New `BouncingLogo.tsx` component animates a small circular hero photo (`/branding/dvd-bounce.jpeg`) via `requestAnimationFrame`, bouncing off all four viewport edges DVD-screensaver-style, with `pointer-events: none` so it never blocks a tap, and a `cancelAnimationFrame` cleanup on unmount; wired into `Lobby.tsx` only

## Task Commits

Each task was committed atomically:

1. **Task 1: Auto-size the caption box to wrapped text height and give it rounded corners** - `b232bff` (feat)
2. **Task 2: Give the "add caption box" button a clearly visible affordance** - `81c7bd8` (feat)
3. **Task 3: DVD-screensaver-style bouncing hero photo on the Lobby screen** - `e8e718d` (feat)

**Plan metadata:** committed separately by the orchestrator (docs commit not made by this executor per constraints)

## Files Created/Modified
- `client/src/canvas/compositor.ts` - Adds `wrapCaptionText`, `drawRoundedBox`, `LINE_HEIGHT`/`BOX_PADDING`/`CORNER_RADIUS` constants; `drawFrame` now computes per-box height from wrapped lines and draws rounded corners
- `client/src/canvas/compositor.test.ts` - `makeFakeCtx` extended with `measureText`/`beginPath`/`moveTo`/`lineTo`/`arcTo`/`closePath`/`fill`/optional `roundRect`; 3 new tests cover auto-sizing, multi-line wrapping, and both rounded-corner code paths
- `client/src/screens/round/WritingPanel.tsx` - Add-box button gets `className="caption-box-add"` and a leading decorative `+` glyph
- `client/src/screens/Lobby.tsx` - Imports and renders `<BouncingLogo />` as the first child of `<main className="hero-bg">`
- `client/src/index.css` - New `.caption-box-add` (dashed border affordance) and `.bouncing-logo` (fixed, circular, pointer-events: none, z-index: 1) rules
- `client/src/components/BouncingLogo.tsx` (new) - `requestAnimationFrame`-driven bouncing hero-photo component, decorative-only

## Decisions Made
- Kept `BOX_HEIGHT` export unchanged at `100` for `WritingPanel.tsx`/`hitTest.ts`'s fixed layout/hit-test math, deliberately decoupling it from `drawFrame`'s now-dynamic rendered box height, per the plan's explicit tradeoff note.
- In the test fake context, gave `roundRect` an explicit `undefined`-typed default field rather than omitting the key entirely, since both produce identical `typeof ctx.roundRect === "function"` behavior and identical `toBeUndefined()` assertions, while avoiding a `Record<string, unknown>` return type that would have broken `.mock.calls` typed access elsewhere in the file.

## Deviations from Plan

None - plan executed exactly as written (including using `client/public/branding/dvd-bounce.jpeg`, which was already present in the working tree, per the constraint note pointing at this specific filename instead of `hero-groom.jpeg`).

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All three fixes verified: `npm --prefix client run typecheck` (zero errors), `npm --prefix client run test -- --run` (66/66 tests passing, including 3 new compositor tests), `npm --prefix client run build` (Vite production build succeeds, `/branding/dvd-bounce.jpeg` reference resolves as a public asset).
- No blockers for Phase 8 (Load & Capacity Verification), which remains the project's next planned unit of work per STATE.md.

---
*Phase: quick*
*Completed: 2026-09-10*

## Self-Check: PASSED

- FOUND: client/src/components/BouncingLogo.tsx
- FOUND: .planning/quick/260910-9ks-three-visual-ux-fixes-1-auto-size-round-/260910-9ks-SUMMARY.md
- FOUND commit: b232bff (Task 1)
- FOUND commit: 81c7bd8 (Task 2)
- FOUND commit: e8e718d (Task 3)
