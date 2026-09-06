---
phase: 01-room-session-reconnect-foundation
plan: 02
subsystem: rooms
tags: [socket.io, intl-segmenter, hebrew, rtl, dedup, rate-limiting]

# Dependency graph
requires:
  - phase: 01-room-session-reconnect-foundation (plan 01)
    provides: >
      shared/protocol.ts wire contract, server RoomManager/Room/SessionRegistry,
      auth middleware, create/join/rejoin/resync handlers, client Home/Join/Lobby
      screens and session/game stores, the vitest test harness
provides:
  - Grapheme-aware name sanitization, length capping (15) and comparison
    normalization (server/src/names/nameValidation.ts)
  - shared/messages.ts — the single Hebrew string source for both packages
  - Auto-numbered duplicate-name resolution (Room.resolveDisplayName) that
    never rejects a join
  - Lobby-only rename (Room.renamePlayer) that locks once phase leaves LOBBY
  - Room capacity enforcement (ROOM_FULL) that never blocks a returning player
  - Per-socket create/join rate limiting that never throttles rejoin/resync
  - Client-side live grapheme counter and inline Hebrew error rendering on
    Home, Join and Lobby
affects: [phase-2-round-engine, phase-6-host-controls]

actuals:
  tokens: 11660
  tasks: 3
  commits: 8

tech-stack:
  added: []
  patterns:
    - "Single sanitize-then-truncate name pipeline shared by create/join/rename"
    - "Auto-numbering de-duplication (never rejection) via normalizeForCompare"
    - "Client looks up ProtocolError text from shared/messages.ts by code,
       not from the server-sent messageHe string"

key-files:
  created:
    - server/src/names/nameValidation.ts
    - shared/messages.ts
    - client/src/names/nameInput.ts
    - client/src/names/nameInput.test.ts
    - server/test/nameValidation.test.ts
    - server/test/nameDedup.test.ts
    - server/test/rename.test.ts
    - server/test/capacity.integration.test.ts
    - server/test/canStart.test.ts
  modified:
    - server/src/config.ts
    - server/src/rooms/Room.ts
    - server/src/socket/handlers.ts
    - server/src/socket/authMiddleware.ts
    - client/src/screens/Home.tsx
    - client/src/screens/Join.tsx
    - client/src/screens/Lobby.tsx

key-decisions:
  - "MAX_NAME_GRAPHEMES set to 15, the upper bound of D-08's 12-15 range, so no legitimate name is clipped"
  - "sanitizeName strips the full Unicode Cc+Cf categories in one regex rather than an enumerated character list — this also strips U+200D (ZWJ), so a ZWJ-built family emoji would lose its joiners if it ever reached sanitizeName; graphemeLength/truncateToGraphemes are still individually ZWJ-correct, verified directly against a family-emoji test case"
  - "MAX_NAME_GRAPHEMES is duplicated (not imported) between server/src/config.ts and client/src/names/nameInput.ts — client and server are separate npm packages with no shared runtime module for plain constants beyond shared/*.ts's types, and reaching into server/src/config.ts from client code would cross a Vite dev-server fs boundary; the client copy is commented as UX-only and non-authoritative"
  - "Client renders ProtocolError text via HEBREW_ERRORS[err.code] looked up locally, not the server-sent err.messageHe string, so the player always sees the current client build's Hebrew wording"
  - "Rate-limit and capacity constants (RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_INTENTS) added to server/src/config.ts alongside the existing ROOM_CAPACITY/MIN_PLAYERS_TO_START knobs"
  - "Pre-existing Lobby.tsx strings not introduced or touched by this plan (app title, generic field label, host/connected-status tags) were left as inline literals — HEBREW_UI's key set is the one given verbatim in 01-02-PLAN.md's interfaces block; only new capacity/name-validation/rename UI text was routed through it"

patterns-established:
  - "Every name a player can submit (create, join, rename) passes through the same sanitizeName -> truncateToGraphemes pipeline before a Room ever sees it"
  - "Room.resolveDisplayName / renamePlayer never throw and never refuse a legitimate candidate — they only ever number or lock"

requirements-completed: [LOBBY-03, LOBBY-04, LOBBY-05]

coverage:
  - id: D1
    description: "Grapheme-aware sanitizeName/graphemeLength/truncateToGraphemes/normalizeForCompare, correct on Hebrew, Latin, digits, punctuation, emoji, bidi controls and zero-width characters"
    requirement: "LOBBY-03"
    verification:
      - kind: unit
        ref: "server/test/nameValidation.test.ts"
        status: pass
      - kind: unit
        ref: "client/src/names/nameInput.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Duplicate names are auto-numbered on join, never rejected (D-07); numbering fills the first free suffix and normalizes whitespace/case"
    requirement: "LOBBY-04"
    verification:
      - kind: integration
        ref: "server/test/nameDedup.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Lobby-only rename: applies while phase is LOBBY, numbers a colliding candidate, is a no-op on one's own name, and refuses with NAME_LOCKED once phase leaves LOBBY (D-09)"
    requirement: "LOBBY-04"
    verification:
      - kind: integration
        ref: "server/test/rename.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "Room capacity caps new joins at ROOM_CAPACITY (20) with a Hebrew ROOM_FULL message; a returning player is never refused by the cap (D-05)"
    requirement: "LOBBY-05"
    verification:
      - kind: integration
        ref: "server/test/capacity.integration.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "canStart is false at 1-2 players and true at 3, counting disconnected-but-present players (D-11)"
    verification:
      - kind: integration
        ref: "server/test/canStart.test.ts"
        status: pass
    human_judgment: false
  - id: D6
    description: "Per-socket create/join rate limiting (10 per 10s) that never throttles rejoin/request-resync"
    verification:
      - kind: integration
        ref: "server/test/capacity.integration.test.ts"
        status: pass
    human_judgment: false
  - id: D7
    description: "On a real phone with a Hebrew keyboard, a Hebrew name plus two emoji truncates by whole character (not by UTF-16 unit), and two phones joining with the identical name both succeed with the second shown numbered — every message on screen is Hebrew"
    verification: []
    human_judgment: true
    rationale: "Task 3's <verify> carries a <human-check> requiring a real iPhone/Android keyboard; per workflow.human_verify_mode = end-of-phase (default), this is deferred to end-of-phase UAT consolidation rather than a mid-execution checkpoint. Not run during this plan's execution."

duration: 15min
completed: 2026-09-06
status: complete
---

# Phase 1 Plan 2: Names, De-duplication, Capacity Summary

**Grapheme-aware name pipeline (Intl.Segmenter) feeding an auto-numbering de-duplicator, a lobby-only rename path, and a 20-player capacity cap with a per-socket join/create rate guard — nobody is ever turned away for the name they typed.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-09-06T09:03:42Z
- **Completed:** 2026-09-06T09:18:23Z
- **Tasks:** 3
- **Files modified:** 16 (9 created, 7 modified)

## Accomplishments

- `server/src/names/nameValidation.ts` — `sanitizeName`, `graphemeLength`, `truncateToGraphemes`, `normalizeForCompare`, `MAX_NAME_GRAPHEMES` (= 15), built on a module-level `Intl.Segmenter("he", { granularity: "grapheme" })`. Verified against plain Hebrew, trailing single-code-point emoji, a ZWJ family-emoji sequence, and a 20-emoji truncation case with no `U+FFFD` replacement character.
- `shared/messages.ts` — the single Hebrew string source (`HEBREW_ERRORS`, `HEBREW_UI`) imported by both packages; no Hebrew literal is written inline in any new handler or component.
- `Room.resolveDisplayName()` / `Room.renamePlayer()` — duplicate names are auto-numbered from the first free suffix (D-07), never rejected; rename is lobby-only, locks with `NAME_LOCKED` once `phase !== "LOBBY"` (D-09), and is a no-op when renaming to one's own current name.
- Every create/join/rename intent in `handlers.ts` now runs through the identical `sanitizeName -> truncateToGraphemes` pipeline before a name reaches the Room — one enforcement point, not three.
- `Room.isFull` (already present from plan 01-01) is now enforced in `join-room`, replying `ROOM_FULL` in Hebrew and leaving the roster untouched; `rejoin` never consults it, so a returning player is never locked out of a room they are already in (D-05).
- A per-socket sliding-window guard rate-limits `create-room`/`join-room` to 10 intents per 10 seconds (`RATE_LIMITED`), explicitly excluding `rejoin`/`request-resync`.
- `canStart` (already present from plan 01-01) is now pinned by a direct test: false at 1-2 players, true at 3 (D-11), counting a disconnected-but-present player toward the minimum.
- Home, Join and Lobby render `HEBREW_ERRORS[code]` inline on refusal, keep the typed name in the field for retry, and show a live grapheme-based remaining-characters counter fed by `client/src/names/nameInput.ts`.

## Task Commits

Each task was committed atomically, with a separate RED (failing test) commit before each GREEN (implementation) commit per the plan's `tdd="true"` tasks:

1. **Task 1: Grapheme-aware name sanitization and length capping**
   - `dd8230c` test — failing tests for `nameValidation.ts` / `nameInput.ts`
   - `2c5e378` feat — `nameValidation.ts`, `shared/messages.ts`, `nameInput.ts`
2. **Task 2: Auto-numbered duplicate names and lobby-only rename**
   - `0da28e9` test — failing tests for dedup/rename
   - `4b458c9` feat — `Room.resolveDisplayName`/`renamePlayer`, rename handler, Lobby rename UI
3. **Task 3: Room capacity, minimum-to-start, and join-spam guard**
   - `c6ccacd` test — failing tests for capacity cap and rate limit
   - `b9c5ff7` feat — `ROOM_FULL` enforcement, per-socket rate guard
   - `c40dc59` feat — Home/Join/Lobby error rendering and remaining-character counter
   - `e461368` refactor — client looks up `HEBREW_ERRORS[code]` instead of trusting `err.messageHe`

**Plan metadata:** recorded in this commit (docs).

_Note: every TDD task above followed RED -> GREEN; none needed a REFACTOR commit beyond the one small cross-cutting client refactor (`e461368`), which was committed separately since it touched all three screens after Task 3's own GREEN commit._

## Files Created/Modified

- `server/src/names/nameValidation.ts` — grapheme sanitize/count/truncate/normalize, server-side enforcement point
- `shared/messages.ts` — `HEBREW_ERRORS`, `HEBREW_UI`
- `client/src/names/nameInput.ts` — client-side grapheme counter (`graphemesRemaining`, `clampForInput`), UX-only
- `client/src/names/nameInput.test.ts`, `server/test/nameValidation.test.ts`, `server/test/nameDedup.test.ts`, `server/test/rename.test.ts`, `server/test/capacity.integration.test.ts`, `server/test/canStart.test.ts` — new test files
- `server/src/config.ts` — added `MAX_NAME_GRAPHEMES`, `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_INTENTS`
- `server/src/rooms/Room.ts` — `resolveDisplayName`, `renamePlayer`, `addPlayer` now resolves collisions
- `server/src/socket/handlers.ts` — sanitize-then-truncate pipeline on create/join/rename, `rename` handler, `ROOM_FULL` check, rate-limit guard, Hebrew errors from `shared/messages.ts`
- `server/src/socket/authMiddleware.ts` — `SocketData` gains `roomIntentTimestamps` for the rate guard
- `client/src/screens/Home.tsx`, `client/src/screens/Join.tsx` — inline Hebrew error, remaining-character counter
- `client/src/screens/Lobby.tsx` — rename control (LOBBY-only), waiting-for-players hint, remaining-character counter

## Decisions Made

See `key-decisions` in the frontmatter. The two worth flagging out loud:

1. **`sanitizeName` strips U+200D (ZWJ) as part of its Cc/Cf category strip**, per the plan's explicit behavior spec. This means a ZWJ-built family emoji passed through `sanitizeName` would lose its joiners and render as separate emoji rather than one combined glyph. `graphemeLength`/`truncateToGraphemes` are independently correct on a raw ZWJ sequence (tested directly), but the full `sanitizeName -> truncateToGraphemes` pipeline that every submitted name runs through has not been tested with a ZWJ-joined emoji specifically. Flagging this now rather than silently shipping it — if a family-style emoji in a display name is a real concern, it needs its own follow-up decision (e.g. excluding ZWJ from the strip and accepting the bidi-attack surface within it, since ZWJ itself carries no bidi-reordering capability).
2. **The client displays `HEBREW_ERRORS[code]` rather than the server-sent `messageHe`.** Both currently produce identical text since the server populates `messageHe` from the same map, but this makes the client resilient to a future server/client version skew and matches the plan's documented `key_links` contract exactly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] None required — plan's task ordering and specified behavior were directly implementable.**

No Rule 1-3 auto-fixes were needed. The one design ambiguity (how `MAX_NAME_GRAPHEMES` reaches the client "through the @shared boundary" when the client cannot import server-only TypeScript) was resolved as a documented engineering decision (see Decisions Made / key-decisions), not a bug fix.

---

**Total deviations:** 0 auto-fixed.
**Impact on plan:** None — the plan's design ambiguity around cross-package constant sharing was resolved with a documented, low-risk duplication rather than a workaround that could hide a real coupling bug.

## Issues Encountered

None beyond the pre-existing carry-forward from plan 01-01 (grace-delay constants still `[ASSUMED]`, unrelated to this plan's scope).

## Known Stubs

None. Every artifact this plan promised (`nameValidation.ts` exports, `shared/messages.ts`, `nameInput.ts`, all five new test files) is wired into the running create/join/rename/rejoin/resync paths, not left as dead code.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **Verification run in this session:** `npm --prefix server run test -- --run` (7 files, 36 tests, all pass, including the plan 01-01 tracer), `npm --prefix client run test -- --run` (2 files, 7 tests, all pass), `npm --prefix server run typecheck` (clean), `npm --prefix client run build` (succeeds).
- **Not run:** Task 3's real-phone human-check (Hebrew keyboard, 20-char-plus-emoji name, two phones joining with the identical name). Per `workflow.human_verify_mode = end-of-phase` (the project default), this `<human-check>` is deferred to end-of-phase UAT consolidation rather than a mid-execution checkpoint — see coverage item D7. This is the one item this plan could not verify itself; a fully green automated suite does not by itself prove the emoji/keyboard behavior on a real device, exactly as plan 01-01's own carried-forward lesson warned.
- Ready for the next plan in this phase (grace-delay measurement / reconnect UX, per 01-01's carried-forward items) or for `/gsd-verify-work` to harvest the pending human-check.

---
*Phase: 01-room-session-reconnect-foundation*
*Completed: 2026-09-06*

## Self-Check: PASSED

All 16 key files confirmed present on disk; all 8 task/RED/GREEN commit hashes confirmed in
`git log`. Full re-run of `npm --prefix server run test -- --run` (7 files, 36 tests),
`npm --prefix client run test -- --run` (2 files, 7 tests), `npm --prefix server run typecheck`,
and `npm --prefix client run build` all pass as of this SUMMARY's commit.
