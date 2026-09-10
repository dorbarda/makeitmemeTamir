---
phase: quick-260910-8yz
plan: 01
subsystem: ui
tags: [css, react, hebrew-rtl, mobile, branding]

# Dependency graph
requires: []
provides:
  - Original party-gradient palette and sunburst backdrop CSS variables
  - Chunky gradient/drop-shadow "card button" and "card panel" styling applied globally
  - .hero-bg utility class reusing the relocated hero photo as a scrimmed background
  - Hero photo relocated out of the gameplay round-photo pool
affects: [ui, visual-design, branding]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
actuals:
  tokens: 2653
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Party palette CSS custom properties (--party-gold/pink/pink-dark/purple/purple-dark/ink/cream) defined once in :root"
    - ".hero-bg utility class for full-bleed scrimmed background photo on landing/lobby/end-game screens"

key-files:
  created:
    - client/public/branding/hero-groom.jpeg
  modified:
    - client/src/index.css
    - client/src/main.tsx
    - client/src/screens/Home.tsx
    - client/src/screens/Lobby.tsx
    - client/src/screens/Round.tsx

key-decisions:
  - "Relocated main-photo.jpeg via git mv (history preserved) to client/public/branding/hero-groom.jpeg so it is structurally excluded from server/src/rooms/photos.ts's readdirSync-based gameplay photo pool — no server code change needed."
  - "Applied the gradient/shadow treatment identically to .settings-preset--selected and .rating-tier since both are primary game actions, not secondary controls, per the plan's explicit instruction."

patterns-established:
  - "Secondary/outlined buttons (.swap-photo-button, .save-share-button, .caption-box-remove, .host-controls-button, non-selected .settings-preset) share one visual recipe: 2px solid var(--party-purple) border, 1rem radius, rgba(255,255,255,0.85) background, var(--party-ink) text."
  - "Card-style panels (li, .scoreboard-entry, .settings-panel, .host-controls-panel, .winner-banner) share one recipe: no border, border-inline-start: 4px solid var(--party-pink), 1rem radius, var(--party-cream) background, var(--party-ink) text, soft box-shadow."

requirements-completed: []

coverage:
  - id: D1
    description: "Hero photo (main-photo.jpeg) relocated to client/public/branding/hero-groom.jpeg and excluded from the round-photo pool"
    verification:
      - kind: unit
        ref: "server test suite (photos.test.ts, noRepeatPhotos.integration.test.ts, photoSwap.integration.test.ts) — 216 tests"
        status: pass
    human_judgment: false
  - id: D2
    description: "Party-gradient palette, chunky gradient/drop-shadow buttons and card panels applied across all screens; .hero-bg wired onto Home, Lobby, and Round's GAME_END screens"
    verification:
      - kind: unit
        ref: "client test suite — 63 tests"
        status: pass
      - kind: other
        ref: "npm --prefix client run build (tsc + vite build)"
        status: pass
    human_judgment: true
    rationale: "Visual appearance (gradient legibility, hero photo framing, chunky button look-and-feel on a real phone) requires human eyes to confirm; automated tests only prove the app still compiles, renders, and functions correctly."

duration: 25min
completed: 2026-09-10
status: complete
---

# Quick Task 260910-8yz: Apply make-it-meme-style visual overhaul Summary

**Original party-gradient CSS palette, chunky gradient/drop-shadow buttons and cards, and a relocated hero-photo background applied across Home, Lobby, and Round screens — no makeitmeme.com code/art copied.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-09-10T06:16:00Z
- **Completed:** 2026-09-10T06:41:00Z
- **Tasks:** 2
- **Files modified:** 6 (1 relocated, 5 edited)

## Accomplishments
- Relocated `main-photo.jpeg` out of `client/public/tamir-photos/` (the server's gameplay photo pool, enumerated live via `readdirSync`) into a dedicated `client/public/branding/hero-groom.jpeg`, preserving git history via `git mv` — confirmed via test suite the round-photo assignment logic is unaffected.
- Added an original party-gradient CSS palette (gold/pink/purple tokens) and a two-layer sunburst backdrop on `body`, plus Heebo 700/900 weight imports for a bolder chunky look.
- Restyled every button, input, secondary control, and card-style panel (list items, scoreboard, settings panel, host-controls panel, winner banner) into the make-it-meme "chunky gradient card" visual language, using only original CSS values.
- Added a `.hero-bg` utility that renders the relocated hero photo as a full-bleed, gradient-scrimmed background, wired onto the Home (landing/join), Lobby, and Round's `GAME_END` (end-game) screens.
- Preserved full Hebrew RTL integrity: no `letter-spacing` added anywhere, `dir="rtl"`/`lang="he"` untouched, `word-spacing` remains the only spacing convention.

## Task Commits

Each task was committed atomically:

1. **Task 1: Relocate main-photo.jpeg out of the gameplay photo pool into a dedicated branding location** - `1471cfe` (feat)
2. **Task 2: Apply the make-it-meme-style visual overhaul** - `635b796` (feat)

_Note: no TDD tasks in this plan — both are straightforward `type="auto"` tasks._

## Files Created/Modified
- `client/public/branding/hero-groom.jpeg` - the relocated hero photo (was `client/public/tamir-photos/main-photo.jpeg`), now excluded from the gameplay photo pool
- `client/src/index.css` - party palette custom properties, sunburst body background, chunky gradient button/input/card styling, `.hero-bg` utility
- `client/src/main.tsx` - added `@fontsource/heebo/700.css` and `@fontsource/heebo/900.css` imports
- `client/src/screens/Home.tsx` - `className="hero-bg"` on `<main>`
- `client/src/screens/Lobby.tsx` - `className="hero-bg"` on `<main>`
- `client/src/screens/Round.tsx` - conditional `className={isGameEnd ? "hero-bg" : undefined}` on `<main>`

## Decisions Made
- Used `git mv` (not a plain file move) to preserve the hero photo's git history when relocating it — explicitly required by the plan.
- No server-side code change was needed in `server/src/rooms/photos.ts`: `loadPhotoFilenames()` enumerates the `tamir-photos` directory at server start with no hardcoded filename list, so removing the file from that directory is sufficient by itself. Confirmed by reading the file and re-running the full server test suite.
- Applied the primary gradient/shadow button treatment (not the secondary outlined-chip treatment) to `.settings-preset--selected` and `.rating-tier`, per the plan's explicit reasoning that both represent real primary game actions.

## Deviations from Plan

None - plan executed exactly as written.

One incidental note (not a deviation from the plan's scope, but worth recording): running `npm --prefix server install --include=dev` to obtain a working `vitest` binary for verification also regenerated `server/package-lock.json` with unrelated drift (a stale `tsx`/`engines` mismatch against `server/package.json` that pre-dated this task). That regenerated lockfile was reverted with `git checkout -- server/package-lock.json` before committing, since it was out of scope for this task and not caused by any change made here — left as-is for a future task to address if `npm ci` ever needs it back in sync.

## Issues Encountered
None - both `npm --prefix client run build` and both test suites (`server`: 216 tests, `client`: 63 tests) passed cleanly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- The visual overhaul is complete and verified via build + full test suites; a human should do a final on-device/dev-server visual pass (per the plan's `<verification>` section) to confirm the gradient, hero photo framing, and chunky buttons read well on a real narrow phone viewport before the party.
- No blockers for Phase 8 (Load & Capacity Verification), which this quick task does not touch.

---
*Task: 260910-8yz*
*Completed: 2026-09-10*

## Self-Check: PASSED

All claimed files exist on disk (`client/public/branding/hero-groom.jpeg`, `client/src/index.css`,
`client/src/main.tsx`, `client/src/screens/Home.tsx`, `client/src/screens/Lobby.tsx`,
`client/src/screens/Round.tsx`, this SUMMARY.md) and both task commits (`1471cfe`, `635b796`) are
present in git history.
