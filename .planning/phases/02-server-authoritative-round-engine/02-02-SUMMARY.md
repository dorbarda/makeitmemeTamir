---
phase: 02-server-authoritative-round-engine
plan: 02
subsystem: api
tags: [socket.io, vitest, react, hebrew-rtl, validation]

# Dependency graph
requires:
  - phase: 02-server-authoritative-round-engine
    provides: "plan 02-01's full Phase 2 wire contract (GameSettings/SettingsOptions/SettingKey, the change-settings and start-game events, the NOT_HOST/SETTINGS_LOCKED/SETTINGS_INVALID/NOT_ENOUGH_PLAYERS error codes) and the Room.settings/settingsLocked state the round clock already reads"
provides:
  - "server/src/rooms/gameSettings.ts — SETTING_PRESETS/isPresetValue/defaultSettings, the single server-side authority on what a legal setting value is"
  - "Room.changeSetting — host-only, lobby-only, preset-validated, fail-closed, never a spread of a client-supplied object"
  - "The change-settings socket handler, matching the rename handler's auth-check -> room-lookup -> delegate -> broadcast shape"
  - "The lobby settings panel: three rows of preset buttons for the host, read-only text for everyone else, a start button gated on canStart"
affects: [02-03-writing-phase, 02-04-rating-rotation, 02-05-round-game-end]

# Actuals (#2632)
actuals:
  tokens: 7062
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Pure validation module next to its consumer (gameSettings.ts mirrors nameValidation.ts's shape): a preset map built from config.ts's own arrays, a type-guarding membership check, and a pure default-value builder — never a fresh re-listing of the numbers."
    - "Fail-closed typed outcome for a third Room mutation (ChangeSettingOutcome mirrors RenameOutcome/StartGameOutcome exactly): ok:true|false discriminated union, never a thrown exception, refusal order is identity -> lock state -> value validity."
    - "Client settings panel follows the same once-listener/cleanup request-response round-trip as handleRename — one tap, no optimistic local state, the next `state` snapshot is the only source of truth."

key-files:
  created:
    - server/src/rooms/gameSettings.ts
    - server/test/gameSettings.test.ts
    - server/test/settingsIntent.integration.test.ts
  modified:
    - server/src/rooms/Room.ts
    - server/src/socket/handlers.ts
    - client/src/screens/Lobby.tsx
    - client/src/index.css

key-decisions:
  - "isPresetValue narrows only `key` to SettingKey via its type predicate; `value`'s numeric membership is proven by the same call but TypeScript can't express a two-parameter type guard, so Room.changeSetting casts `value as number` at the single assignment site with a comment pointing back at what was just verified — chosen over a second, redundant runtime check."
  - "The settings-locked note in Lobby.tsx replaces all three button rows at once (not per-row) when snapshot.settingsLocked is true, matching the plan's literal 'render the note instead of the buttons' instruction — see Known Stubs/Deferred below for why this path is currently unreachable given today's phase-based routing."

patterns-established:
  - "Every new Room mutation method (now three: renamePlayer, startGame, changeSetting) returns the same discriminated-union outcome shape and is added to the socket handler using the identical auth-check -> room-lookup -> delegate -> broadcast sequence."

requirements-completed: [LOBBY-06, LOBBY-07]

coverage:
  - id: D1
    description: "The host sees three rows of preset buttons (rounds, writing seconds, rating seconds) above the start button, host-only, with no free-text field and no slider; non-hosts see the same three settings read-only."
    requirement: LOBBY-06
    verification:
      - kind: unit
        ref: "client/src/screens/Lobby.tsx — no <input> or type=\"range\" inside the settings section; gated behind snapshot.you.isHost; verified by npm --prefix client run build exiting 0"
        status: pass
    human_judgment: true
    rationale: "Whether the buttons actually render as a non-overflowing, tappable row on a real phone-width viewport, and whether both windows genuinely see the same values update live, requires a live two-browser check — Task 2's own human-check block. No real phone/browser is available in this execution environment."
  - id: D2
    description: "The server accepts only the exact nine preset values (3/5/7 rounds, 45/60/90 writingSeconds, 8/10/15 ratingSeconds) and refuses every one-step-either-side neighbour, non-integer, NaN, Infinity, numeric string, and prototype-pollution key attempt with SETTINGS_INVALID, leaving the stored setting unchanged each time."
    requirement: LOBBY-06
    verification:
      - kind: unit
        ref: "server/test/gameSettings.test.ts (35 tests: 9 preset accept + 12 neighbour reject + 4 type-confusion reject + __proto__/constructor reject + Room.changeSetting integration)"
        status: pass
    human_judgment: false
  - id: D3
    description: "A non-host change-settings is refused with NOT_HOST; a change-settings after start-game is refused with SETTINGS_LOCKED; both leave the stored value untouched, proven over a real socket."
    requirement: LOBBY-06
    verification:
      - kind: integration
        ref: "server/test/settingsIntent.integration.test.ts#a non-host change-settings produces NOT_HOST and never changes the value"
        status: pass
      - kind: integration
        ref: "server/test/settingsIntent.integration.test.ts#a change-settings after the game has started produces SETTINGS_LOCKED"
        status: pass
    human_judgment: false
  - id: D4
    description: "Only the host can start the game, and only with at least 3 players; a non-host is refused with NOT_HOST and an under-populated room with NOT_ENOUGH_PLAYERS, proven over a real socket."
    requirement: LOBBY-07
    verification:
      - kind: integration
        ref: "server/test/settingsIntent.integration.test.ts#start-game from a non-host produces NOT_HOST and the room stays in LOBBY"
        status: pass
      - kind: integration
        ref: "server/test/settingsIntent.integration.test.ts#start-game with only two players produces NOT_ENOUGH_PLAYERS; with three it moves every client to WRITING"
        status: pass
    human_judgment: false
  - id: D5
    description: "A room whose host changed writingSeconds to 90 schedules its writing deadline from 90s, not the 60s default — the clock reads settings, not a DEFAULT_* constant."
    requirement: LOBBY-06
    verification:
      - kind: integration
        ref: "server/test/settingsIntent.integration.test.ts#a host-changed writingSeconds of 90 drives the writing deadline, not the 60s default"
        status: pass
    human_judgment: false
  - id: D6
    description: "Preset buttons never overflow a phone-width viewport (wrapping row, 44px tap targets, no letter-spacing on Hebrew labels), and the settings-locked note visibly replaces the buttons once play begins."
    verification: []
    human_judgment: true
    rationale: "CSS layout correctness on a real narrow viewport, and the live cross-window update behavior, are exactly the class of defect Phase 1 found invisible to a green test suite — no real phone/browser is available in this execution environment. Additionally, given current phase-based routing (App.tsx renders <Round> for every non-LOBBY phase), settingsLocked and phase leave LOBBY in the same synchronous startGame() call, so the locked-note render path in Lobby.tsx is implemented per the plan's literal instruction but is not observably reachable today — see Known Stubs."

# Metrics
duration: ~15min
completed: 2026-09-06
status: complete
---

# Phase 2 Plan 2: Lobby Settings Panel Summary

**Server-validated preset-only game settings (3/5/7 rounds, 45/60/90s writing, 8/10/15s rating) with a host-only lobby panel, read-only non-host view, and a hardened start-game gate — the server never trusts a client-asserted setting value.**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-09-06
- **Tasks:** 3 completed
- **Files modified:** 4 modified, 3 created

## Accomplishments
- `server/src/rooms/gameSettings.ts` is now the single server-side authority on what a legal setting value is: `isPresetValue` requires `Object.hasOwn` membership (so `__proto__`/`constructor` can never resolve to an array), `Number.isInteger`, and exact preset-array membership — never a range check, never a client-supplied list.
- `Room.changeSetting` is host-only, lobby-only, and preset-validated, refusing in the documented order (`NOT_HOST` -> `SETTINGS_LOCKED` -> `SETTINGS_INVALID`) and shaped exactly like `RenameOutcome`/`StartGameOutcome` — a discriminated union, never a thrown exception.
- The lobby now has a real settings panel: three rows of preset buttons for the host (no text input, no slider), the same three values as read-only text for everyone else, and a start button gated on `snapshot.canStart` — all driven purely by the incoming `state` snapshot, with no local settings state to go stale.
- 40 new tests (35 unit + 5 integration) prove every legal preset is accepted, every one-step-either-side neighbour (and `3.5`/`NaN`/`Infinity`/`"5"`/`__proto__`/`constructor`) is refused with the stored value unchanged, a non-host is refused on both `change-settings` and `start-game`, settings lock the instant the game starts, and a host-changed `writingSeconds: 90` genuinely drives the writing deadline instead of the 60s default.

## Task Commits

Each task was committed atomically:

1. **Task 1: Server-side settings authority — presets, validation, and the lock** - `bf912a9` (feat)
2. **Task 2: The lobby settings panel** - `5dc663f` (feat)
3. **Task 3: The boundary battery** - `b93bae8` (test)

## Files Created/Modified
- `server/src/rooms/gameSettings.ts` - new: `SETTING_PRESETS`, `isPresetValue`, `defaultSettings`, built from `config.ts`'s own preset/default constants
- `server/src/rooms/Room.ts` - `changeSetting` method and `ChangeSettingOutcome` type; `settings` now seeded via `defaultSettings()` instead of three inline constants
- `server/src/socket/handlers.ts` - the `change-settings` handler, matching the `rename` handler's auth-check -> room-lookup -> delegate -> broadcast shape, passing `key`/`value` through unvalidated so `Room.changeSetting` is the single real gate
- `client/src/screens/Lobby.tsx` - the settings panel (host preset buttons / non-host read-only text), the start button, and their once-listener/cleanup emit helpers
- `client/src/index.css` - `.settings-panel`, `.settings-preset-row`, `.settings-preset`, `.settings-preset--selected` — wrapping row layout, 44px tap targets, `width: auto` override of the global full-width button rule
- `server/test/gameSettings.test.ts` - new: pure unit coverage of `isPresetValue`/`defaultSettings`/`Room.changeSetting`
- `server/test/settingsIntent.integration.test.ts` - new: real-socket proof of the non-host/lock/start-game refusals and the settings-authority-drives-the-clock invariant

## Decisions Made
- `isPresetValue`'s type predicate narrows only `key` (TypeScript can't express a two-parameter guard cleanly); `Room.changeSetting` casts `value as number` at the single assignment site with a comment pointing at the check that just proved it, rather than adding a second redundant runtime check.
- The settings-locked note replaces all three button rows at once when `snapshot.settingsLocked` is true, per the plan's literal instruction — see Known Stubs below for why this specific render path is not observably reachable under the current phase-routing.

## Deviations from Plan

None — plan executed exactly as written. `changeSetting`'s refusal order, the handler's raw pass-through, the preset-membership-only validation, and the client's once-listener round-trip all match the plan's `<action>` blocks directly; no Rule 1-4 auto-fixes were needed.

## Known Stubs

- **`HEBREW_UI.settingsLockedNote` render path in `Lobby.tsx` is implemented but not observably reachable today.** `Room.startGame` sets `settingsLocked = true` and calls `enterWriting()` (which sets `phase = "WRITING"`) synchronously in the same call, so the server never emits a snapshot where `phase === "LOBBY"` and `settingsLocked === true` simultaneously. `App.tsx` renders `<Lobby>` only while `phase === "LOBBY"`, so by the time a host's client would show the locked note, the whole `Lobby` screen has already unmounted in favor of `<Round>`. This is implemented per the plan's explicit instruction (defensive/forward-compatible) but does not currently produce a visible transition — a real browser check of Task 2's human-check step 4 ("after starting, window A shows the locked note instead of the buttons") would show the screen switching away entirely rather than a note appearing. Not a functional defect (settings genuinely lock, `SETTINGS_LOCKED` genuinely refuses further changes — both proven by `settingsIntent.integration.test.ts`), but the specific "locked note" UI never has a chance to paint. No future plan currently depends on this render path; flagging so it isn't mistaken for tested-and-confirmed UX.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness

**Verification results (all commands run and their actual output recorded, not assumed):**
- `npm --prefix server run test -- --run` → **125/125 passed** (baseline 85 + 40 new: 35 in `gameSettings.test.ts`, 5 in `settingsIntent.integration.test.ts`)
- `npm --prefix client run test -- --run` → **34/34 passed** (unchanged from baseline — no client test file was added or touched this plan)
- `npm --prefix server run typecheck` → exits 0, no output
- `npm --prefix client run typecheck` → exits 0, no output
- `npm --prefix client run build` → exits 0, "✓ 60 modules transformed" / "✓ built in ~400-550ms"

**What only a real browser can confirm (not proven here, no real phone/browser available in this execution environment):**
- The two-browser-window check from Task 2's human-check: preset buttons visible and tappable on a phone-width viewport in window A, plain-text values in window B, both windows updating live on a tap, the start button flipping enabled at 3 players, and (per the Known Stubs note above) that the screen actually transitions to the round view — not a locked note — the instant the host starts the game.
- Whether the `.settings-preset-row` wrap behavior actually prevents sideways scrolling on a genuinely narrow/older phone viewport, beyond what `vite build`'s CSS output confirms is syntactically valid.

**Ready for 02-03 (writing phase):** `Room.settings`/`settingsLocked` are the sole authority the round clock already reads (unchanged from plan 02-01), `changeSetting` cannot be called after the game starts, and the lobby UI gives the host a working way to shape the game before 02-03 wires the caption-submission flow into the `WRITING` phase this plan's settings now govern.

**No blockers.**

## Self-Check: PASSED

All 3 created files confirmed present on disk; all 3 task commit hashes (`bf912a9`, `5dc663f`, `b93bae8`) confirmed present in git history.

---
*Phase: 02-server-authoritative-round-engine*
*Completed: 2026-09-06*
