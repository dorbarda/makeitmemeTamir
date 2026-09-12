---
phase: 06-host-controls-rtl-interface-hardening
plan: 02
subsystem: ui
tags: [react, host-controls, confirmation-modal, hebrew, rtl]

# Dependency graph
requires:
  - phase: 06-host-controls-rtl-interface-hardening (plan 01)
    provides: "CLIENT_EVENTS.skipRound/removePlayer/endGame/restartGame and their server-side handlers/validation, already tested"
provides:
  - "client/src/screens/round/hostControlsHelpers.ts — otherRemovablePlayers, formatRemovePlayerConfirm (pure, unit-tested)"
  - "client/src/screens/round/HostControls.tsx — the host-only panel, three-action confirm modal, and remove-player two-step flow"
  - "Round.tsx mounts HostControls host-only, after every phase panel and before the baseline roster"
affects: [phase-06-plan-03-rtl-audit]

# Actuals (#2632)
actuals:
  tokens: 3725
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Confirm-BEFORE-send: no CLIENT_EVENTS emission happens until the modal's own confirm button is tapped. This resolves an internal inconsistency in 06-UI-SPEC.md (which elsewhere describes send-then-confirm) in favor of its own literal '{action} בטוח?' copy and its explicit 'Cancel: ... no server action is sent' rule — the only reading consistent with both."
    - "Remove-player is a two-step flow (select target, then confirm) built on otherRemovablePlayers(snapshot.players, snapshot.you.id) — a pure, unit-tested filter, not inline component logic."
    - "Every host action reuses Lobby.tsx's exact once-listener round-trip (socket.once(error)/socket.once(state)/emit) with HEBREW_ERRORS looked up locally on error — no optimistic local mutation, matching the rest of the codebase."

key-files:
  created:
    - client/src/screens/round/hostControlsHelpers.ts
    - client/src/screens/round/hostControlsHelpers.test.ts
    - client/src/screens/round/HostControls.tsx
  modified:
    - client/src/screens/Round.tsx
    - client/src/index.css
    - shared/messages.ts

key-decisions:
  - "Followed the plan's own resolution of the UI-SPEC's send-timing inconsistency: implemented confirm-BEFORE-send (action never reaches the server until the modal's confirm button is tapped), not the send-then-confirm reading some UI-SPEC passages describe. This was the plan's explicit instruction, not a new deviation."

patterns-established:
  - "Host-only panels return null immediately when snapshot.you.isHost is false, in addition to (not instead of) the parent screen's own isHost gate — defense in depth, matching Lobby.tsx's convention."

requirements-completed: [LIVE-04, LIVE-05, LIVE-06, LIVE-07]

coverage:
  - id: D1
    description: "The Host Controls panel renders exactly 4 buttons (skip/remove/end/restart) whenever snapshot.you.isHost is true, and does not exist in the DOM for a non-host."
    requirement: "LIVE-04"
    verification:
      - kind: unit
        ref: "npm --prefix client run typecheck (grep -c snapshot.you.isHost HostControls.tsx == 1; grep -c HostControls Round.tsx == 2)"
        status: pass
    human_judgment: true
    rationale: "Visual confirmation that the panel never renders for a non-host and shows exactly 4 buttons in a wrapping 2x2 grid on a real phone is a UI rendering check — no jsdom component test was written for HostControls.tsx itself (only its pure helper functions), so a human should visually verify this before the phase closes."
  - id: D2
    description: "Skip/end/restart are confirm-before-send: tapping a button opens a modal first, only confirm sends the event, cancel sends nothing."
    requirement: "LIVE-04, LIVE-06, LIVE-07"
    verification:
      - kind: unit
        ref: "grep -c CLIENT_EVENTS. HostControls.tsx == 4 (all 4 events only emitted inside confirm())"
        status: pass
    human_judgment: true
    rationale: "The confirm-before-send flow's actual click sequence (button tap opens modal, cancel closes with no network activity, confirm sends and waits for snapshot) is a UI interaction check better verified visually/manually than by a jsdom test that wasn't written for this component."
  - id: D3
    description: "Remove-player is a two-step flow: selection list of other connected players (self and disconnected excluded) built from otherRemovablePlayers, then a confirm modal with the name interpolated via formatRemovePlayerConfirm."
    requirement: "LIVE-05"
    verification:
      - kind: unit
        ref: "client/src/screens/round/hostControlsHelpers.test.ts (6 tests, all passing)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Empty-state: when the host is the only connected player, the remove-player list shows the empty-state message instead of an empty list, with only a close action."
    requirement: "LIVE-05"
    verification:
      - kind: unit
        ref: "client/src/screens/round/hostControlsHelpers.test.ts#returns an empty array when the only connected player is the host themself"
        status: pass
    human_judgment: true
    rationale: "The helper's empty-array output is unit-tested, but the actual empty-state message rendering (HostControls.tsx's others.length === 0 branch) has no component-level test — visual confirmation recommended."
  - id: D5
    description: "A server-side rejection replaces the modal's cancel/confirm buttons with the HEBREW_ERRORS message and a single close button."
    requirement: "LIVE-04, LIVE-05, LIVE-06, LIVE-07"
    verification: []
    human_judgment: true
    rationale: "Requires forcing a real server rejection (e.g. a desynced NOT_HOST) during a live socket round-trip — no test harness for this exists in this plan's scope; best verified during the phase's real-device/manual pass."

# Metrics
duration: ~25min
completed: 2026-09-07
status: complete
---

# Phase 6 Plan 2: Host Controls Client UI Summary

**Host-only "break glass" panel (skip round / remove player / end game / restart) wired against Plan 06-01's tested server contract, with a confirm-before-send modal for all four actions and a two-step select-then-confirm flow for player removal.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 3 completed
- **Files modified:** 6 (3 created, 3 modified)

## Accomplishments
- `hostControlsHelpers.ts`: two pure, unit-tested functions — `otherRemovablePlayers` (the remove-player list's source filter) and `formatRemovePlayerConfirm` (safe string-search interpolation, never RegExp).
- `HostControls.tsx`: the host-only 4-button panel, the three-action confirm-before-send modal (skip round / end game / restart), and the remove-player two-step selection-then-confirm flow, including the empty-state and server-error branches.
- `shared/messages.ts`: 12 new `HEBREW_UI` keys for the panel heading, 4 button labels, 4 confirmation sentences, the empty-state message, and the cancel/confirm button labels.
- `Round.tsx`: mounts `HostControls` host-only, immediately after the four phase panels and before the baseline roster, matching the UI-SPEC's DOM-order instruction.
- `index.css`: 6 new classes (`.host-controls-panel`, `.host-controls-grid`, `.host-controls-button`, `.host-modal-overlay`, `.host-modal`, `.host-modal-actions`) reusing the existing outlined-button and dark-overlay conventions — no new styling system introduced.

## Task Commits

Each task was committed atomically:

1. **Task 1: Pure host-controls helpers — the removable-player filter and confirm-copy interpolation** - `2628d70` (test)
2. **Task 2: HostControls.tsx — the panel, the three-action confirm modal, and the remove-player two-step flow** - `82e398d` (feat)
3. **Task 3: Mount HostControls in Round.tsx and add its CSS** - `9396c48` (feat)

**Plan metadata:** committed alongside this SUMMARY.

## Files Created/Modified
- `client/src/screens/round/hostControlsHelpers.ts` - pure `otherRemovablePlayers`/`formatRemovePlayerConfirm` helpers
- `client/src/screens/round/hostControlsHelpers.test.ts` - 6 unit tests covering connected/self/empty/template edge cases
- `client/src/screens/round/HostControls.tsx` - the host-only panel, confirm modal, and remove-player flow
- `client/src/screens/Round.tsx` - imports and mounts `HostControls`, gated on `snapshot.you.isHost`
- `client/src/index.css` - `.host-controls-panel`, `.host-controls-grid`, `.host-controls-button`, `.host-modal-overlay`, `.host-modal`, `.host-modal-actions`
- `shared/messages.ts` - 12 new `HEBREW_UI` keys for host controls copy

## Decisions Made
Followed the plan's explicit resolution of the UI-SPEC's own internal send-timing inconsistency: implemented confirm-BEFORE-send (the action is never emitted to the server until the modal's confirm button is tapped), rather than the send-then-confirm reading some UI-SPEC passages describe elsewhere. This was the plan's own directive, not an executor deviation — see `06-02-PLAN.md`'s Task 2 action block for the reasoning it was given.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness

All four host recovery actions (LIVE-04 through LIVE-07) now have a working client-side entry point wired against Plan 06-01's already-tested server contract. No protocol or server changes were needed in this plan.

Remaining Phase 6 work (per `06-CONTEXT.md`): the systematic RTL audit (HEB-01) across every screen, and the real-device Hebrew keyboard check (HEB-02) — both explicitly out of scope for this plan and deferred to Plan 06-03 / the phase's real-device gate.

**Recommended before the phase closes (see `coverage` block above):** a short manual/visual pass confirming (a) the panel truly never renders for a non-host and shows exactly 4 buttons on a real phone, (b) the confirm-before-send click sequence behaves as designed, (c) the remove-player empty-state message renders correctly when the host is the only connected player, and (d) a forced server rejection (e.g. a desynced `NOT_HOST`) correctly replaces the modal's buttons with the error message and a close button. None of these are new risks introduced by this plan — they are the class of UI-only behavior this codebase has consistently verified visually rather than via component tests (see `RatingPanel.tsx`, `Lobby.tsx` — neither has a dedicated component test either).

## Self-Check: PASSED

Confirmed on disk: `client/src/screens/round/hostControlsHelpers.ts`, `client/src/screens/round/hostControlsHelpers.test.ts`, and `client/src/screens/round/HostControls.tsx` all present via `[ -f ]`. All three task commit hashes (`2628d70`, `82e398d`, `9396c48`) confirmed present in `git log --oneline`. Full verification re-run clean: client tests 63/63 passed (including the 6 new `hostControlsHelpers.test.ts` tests), client typecheck exits 0, client build exits 0 ("built in 3.91s"), server tests 216/216 passed (no regressions).

---
*Phase: 06-host-controls-rtl-interface-hardening*
*Completed: 2026-09-07*
