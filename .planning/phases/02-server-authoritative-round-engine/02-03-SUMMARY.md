---
phase: 02-server-authoritative-round-engine
plan: 03
subsystem: api
tags: [socket.io, vitest, react, hebrew-rtl, privacy]

# Dependency graph
requires:
  - phase: 02-server-authoritative-round-engine
    provides: "plan 02-01's phaseTimer/schedulePhase primitive, WRITING_COLLAPSE_MS/MAX_CAPTION_GRAPHEMES constants, and the progress/youSubmitted/yourPlaceholderId snapshot fields left as null/false placeholders; plan 02-02's changeSetting-locked settings the writing deadline already reads"
provides:
  - "Room.submissions/Room.submitCaption — the write-once-per-round caption store, refusing WRONG_PHASE/CAPTION_REQUIRED/ALREADY_SUBMITTED without ever throwing"
  - "Room.collapseDeadline — the single place any live deadline may ever be shortened, and Room.maybeCollapseWriting, which calls it once every connected player has submitted (D-07)"
  - "snapshotFor's WRITING branch: progress/youSubmitted/yourPlaceholderId populated only during WRITING, with no caption field anywhere in the type for any player (D-14 enforced by omission, not filtering)"
  - "client/src/screens/round/WritingPanel.tsx — the caption box, send button, submitted note, X-of-Y progress line and per-player checkmarks"
affects: [02-04-rating-rotation, 02-05-round-game-end]

# Actuals (#2632)
actuals:
  tokens: 7294
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "collapseDeadline as the sole deadline-shortening chokepoint: computes Date.now() + targetMs, refuses (returns false, changes nothing) unless the candidate is strictly earlier than the current deadlineAt, otherwise reschedules through the existing schedulePhase primitive — 'the clock only ever shortens' is now a property of one method's return-early guard, not a discipline every call site has to remember."
    - "D-14 enforced by field omission, not client-side filtering: the WRITING branch of snapshotFor builds progress from submission IDS only (Map.keys()), never from Map.values() (the caption text) — there is no code path where a caption string could reach the outgoing JSON, proven directly over real sockets in captionPrivacy.integration.test.ts."
    - "maybeCollapseWriting is keyed on connected players only, mirroring Phase 1 D-17/LIVE-03's 'play never waits for a departed player' — a disconnected non-submitter cannot hold the room's early finish hostage, and because collapse only shortens, that same player reconnecting in time can still submit against the (unchanged) original deadline."

key-files:
  created:
    - client/src/screens/round/WritingPanel.tsx
    - server/test/writingPhase.integration.test.ts
    - server/test/captionPrivacy.integration.test.ts
  modified:
    - server/src/rooms/Room.ts
    - server/src/socket/handlers.ts
    - client/src/screens/Round.tsx
    - client/src/index.css

key-decisions:
  - "maybeCollapseWriting additionally guards against zero connected players (connectedPlayers.length === 0 -> no collapse) even though the plan's literal wording didn't call this out — an empty 'every connected player submitted' check on a zero-length array is vacuously true in JS, which would otherwise fire a spurious 3-second collapse the instant every remaining player disconnects. Not exercised by a dedicated test since it never arises in the plan's own scenarios (a room always has at least one connected player while WRITING is live), but left in as a correctness guard (Rule 2)."
  - "WritingPanel renders its own player list with checkmarks rather than modifying Round.tsx's existing unconditional roster — the two lists render side by side during WRITING. This is a minor visual duplication (a player's name appears in both Round.tsx's baseline roster and WritingPanel's checkmark roster) rather than a single unified list, chosen to keep Round.tsx's change to a one-line conditional mount exactly as specified, without touching its existing roster rendering that plans 02-04/02-05 may also depend on unchanged. Flagged here, not hidden, in case a later pass wants a single de-duplicated roster."

patterns-established:
  - "Every Room mutation that a client intent can trigger at an invalid moment (now four: renamePlayer, startGame, changeSetting, submitCaption) returns the same ok:true|false discriminated union — SubmitCaptionOutcome mirrors RenameOutcome/StartGameOutcome/ChangeSettingOutcome exactly, refusal order phase -> content -> replay."
  - "A privacy-critical field is proven absent by asserting JSON.stringify(...).not.toContain(distinctiveSubstring) over a real socket payload, not by inspecting the TypeScript type or the server-side construction code in isolation — this is now the established D-14-class test pattern for any future round-content field that must not leak (e.g. plan 02-04's caption reveal timing)."

requirements-completed: [ROUND-04, ROUND-05]

coverage:
  - id: D1
    description: "The writing phase ends at its deadline whether zero, one, or all players have submitted — the silent players never extend or shorten it themselves."
    requirement: ROUND-04
    verification:
      - kind: unit
        ref: "server/test/writingPhase.integration.test.ts#ends the writing phase exactly at the deadline with one submission out of five — the four silent players change nothing"
        status: pass
      - kind: unit
        ref: "server/test/writingPhase.integration.test.ts#ends the writing phase exactly at the deadline with zero submissions"
        status: pass
    human_judgment: false
  - id: D2
    description: "Submission progress is visible as both a bare X/Y count and a per-player checkmark; it climbs by exactly one per distinct submitter, reaches N/N, and never exceeds N on a retried submit."
    requirement: ROUND-05
    verification:
      - kind: unit
        ref: "server/test/writingPhase.integration.test.ts#progress climbs 0/5 through 5/5 as distinct players submit and stays at 5/5 on a repeat attempt"
        status: pass
      - kind: unit
        ref: "client/src/screens/round/WritingPanel.tsx renders progress.submitted/progress.total and a checkmark only for ids in progress.submittedPlayerIds — verified by npm --prefix client run build exiting 0"
        status: pass
    human_judgment: true
    rationale: "Whether the count and checkmarks actually update live across three separate browser windows without visible lag or flicker, and whether the roster/progress layout stays legible on a genuinely narrow phone viewport, needs a live multi-window check — this is Task 2's own human-check block. No real phone/browser is available in this execution environment."
  - id: D3
    description: "No caption text of any player reaches another player's device during WRITING, at the server-payload level — not merely hidden by the client UI."
    requirement: ROUND-05
    verification:
      - kind: integration
        ref: "server/test/captionPrivacy.integration.test.ts#keeps another player's caption entirely out of the WRITING snapshot while progress reflects the submission"
        status: pass
    human_judgment: false
  - id: D4
    description: "An early finish (every connected player submitted) collapses the writing deadline to exactly WRITING_COLLAPSE_MS from that moment when more time remained, and leaves the deadline exactly unchanged when less than WRITING_COLLAPSE_MS remained — collapse can only ever move a deadline earlier, never later."
    requirement: ROUND-04
    verification:
      - kind: unit
        ref: "server/test/writingPhase.integration.test.ts#collapses the deadline to exactly now + WRITING_COLLAPSE_MS when the last connected player submits with 30s left"
        status: pass
      - kind: unit
        ref: "server/test/writingPhase.integration.test.ts#never extends: deadlineAt is exactly unchanged when the last connected player submits with only 1200ms left"
        status: pass
      - kind: unit
        ref: "server/test/writingPhase.integration.test.ts#does not let a detached non-submitter block the early-finish collapse"
        status: pass
    human_judgment: false
  - id: D5
    description: "A caption is one-per-player-per-round: a second submit-caption is refused with ALREADY_SUBMITTED without overwriting the stored text or double-counting progress, and a submit-caption after the phase has closed is refused with WRONG_PHASE."
    requirement: ROUND-05
    verification:
      - kind: unit
        ref: "server/test/writingPhase.integration.test.ts#refuses ALREADY_SUBMITTED on a second submit from the same player and never overwrites the stored caption"
        status: pass
      - kind: integration
        ref: "server/test/captionPrivacy.integration.test.ts#refuses a submit-caption arriving after the writing phase has closed with WRONG_PHASE and never changes progress"
        status: pass
    human_judgment: false
  - id: D6
    description: "The writing screen's own visual behavior in a real browser: the countdown stays visible and turns urgent in the last 10 seconds while the caption form and progress roster are on screen, and an early finish visibly closes the phase about 3 seconds after the last send rather than instantly."
    verification: []
    human_judgment: true
    rationale: "setTimeout/Date.now()-based collapse timing under a real tab, and the countdown's visual urgent state layered above the writing form, cannot be proven by a fake-timer unit test — Phase 1 and Phase 2 plan 02-01 both already flagged this exact class of behavior as real-device-only. No real phone/browser is available in this execution environment; this is Task 2's own three-window human-check."

# Metrics
duration: ~12min
completed: 2026-09-06
status: complete
---

# Phase 2 Plan 3: The Writing Phase Summary

**Server-enforced caption submission with progress-only visibility (`SubmissionProgress` — count plus per-player checkmarks, zero caption text) and a writing deadline that only ever collapses earlier, never extends, once every connected player has sent.**

## Performance

- **Duration:** ~12 min
- **Completed:** 2026-09-06
- **Tasks:** 3 completed
- **Files modified:** 4 modified, 3 created

## Accomplishments
- `Room.submitCaption` is the write-once-per-round caption store: `WRONG_PHASE` outside WRITING, `CAPTION_REQUIRED` for an empty prepared string, `ALREADY_SUBMITTED` for a repeat — shaped exactly like `RenameOutcome`/`StartGameOutcome`/`ChangeSettingOutcome`, never throwing.
- `Room.collapseDeadline` is now the single chokepoint through which any live deadline may ever be shortened (D-07): it computes the candidate instant, refuses and changes nothing unless that instant is strictly earlier than the current deadline, and only then reschedules. `Room.maybeCollapseWriting` calls it once every *connected* player has submitted, so a disconnected non-submitter can never hold the room's early finish hostage (Phase 1 D-17/LIVE-03).
- `snapshotFor`'s `WRITING` branch builds `progress` from submission **ids only** — the map's caption values never enter the outgoing snapshot at all. This is D-14 enforced by omission: proven directly over a real socket in `captionPrivacy.integration.test.ts`, where player B's `state` payload is asserted (via `JSON.stringify`) to not contain player A's distinctive submitted caption substring, while `progress.submitted`/`progress.submittedPlayerIds` correctly reflect the submission.
- `client/src/screens/round/WritingPanel.tsx`: a numbered placeholder panel, a caption textarea + send button clamped to the same 120-grapheme ceiling the server enforces, the submitted confirmation once the server's next snapshot says `youSubmitted`, the "X מתוך Y שלחו" progress line (D-13), and a checkmark beside each submitted player's name with no negative mark against anyone still writing.
- 11 new server tests (9 bare-`Room` fake-timer, 2 real-socket) prove the deadline holds regardless of submission count, progress climbs 0/N through N/N and never exceeds it, a collapse lands at exactly `now + WRITING_COLLAPSE_MS` with time to spare and leaves `deadlineAt` exactly unchanged with less than that remaining (equality assertions, not inequalities), a detached non-submitter never blocks the collapse, and a caption never reaches another player's snapshot even as raw JSON.

## Task Commits

Each task was committed atomically:

1. **Task 1: Captions in, progress out, and a deadline that only ever moves earlier** - `1f7f1f8` (feat)
2. **Task 2: The writing screen — type, send, and watch the room fill up** - `938ba4f` (feat)
3. **Task 3: The two batteries — the deadline holds regardless of submissions, and nothing leaks** - `41e12f4` (test)

## Files Created/Modified
- `server/src/rooms/Room.ts` - `submissions` map, `SubmitCaptionOutcome`, `submitCaption`, `collapseDeadline`, `maybeCollapseWriting`; `enterWriting` clears `submissions` per round; `snapshotFor` populates `progress`/`youSubmitted`/`yourPlaceholderId` only during `WRITING`
- `server/src/socket/handlers.ts` - `prepareCaption` (sanitize + grapheme-truncate to `MAX_CAPTION_GRAPHEMES`) and the `submit-caption` handler, matching the `rename`/`change-settings` auth-check -> room-lookup -> delegate -> broadcast shape; author always `socket.data.playerId`
- `client/src/screens/round/WritingPanel.tsx` - new: the caption form, submitted note, progress line, per-player checkmark roster
- `client/src/screens/Round.tsx` - mounts `WritingPanel` only while `phase === "WRITING"`
- `client/src/index.css` - `.writing-panel`, `.writing-progress`, `.roster-check` — mobile-first, RTL, no letter-spacing on Hebrew text
- `server/test/writingPhase.integration.test.ts` - new: bare-`Room` + fake timers, 9 tests covering the deadline-holds/progress-boundary/collapse-only-shortens properties
- `server/test/captionPrivacy.integration.test.ts` - new: real sockets + real timers, 2 tests covering the D-14 no-leak proof and the post-close `WRONG_PHASE` refusal

## Decisions Made
- Added a zero-connected-players guard to `maybeCollapseWriting` beyond the plan's literal wording (see key-decisions above) — a defensive correctness fix (Rule 2), not exercised by a dedicated test since the scenario doesn't arise in any of this plan's own test flows.
- Left `WritingPanel`'s own checkmark roster alongside `Round.tsx`'s existing unconditional roster rather than unifying them (see key-decisions above) — a minor visual duplication during `WRITING`, flagged rather than silently accepted.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Guarded `maybeCollapseWriting` against zero connected players**
- **Found during:** Task 1 (writing `collapseDeadline`/`maybeCollapseWriting`)
- **Issue:** `Array.prototype.every` on an empty array returns `true` in JavaScript. If every player in a room disconnected simultaneously during `WRITING` (leaving zero connected players), the literal plan wording ("if every player with `connected === true` is present in `submissions`") would vacuously evaluate to true and fire a spurious 3-second collapse for a room nobody is in.
- **Fix:** Added `if (connectedPlayers.length === 0) return;` before the `every` check.
- **Files modified:** `server/src/rooms/Room.ts`
- **Verification:** Does not change behavior for any of the plan's own test scenarios (a room always has at least one connected player while `WRITING` is live in every test); `npm --prefix server run test -- --run` still 136/136.
- **Committed in:** `1f7f1f8` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 missing-critical guard, Rule 2)
**Impact on plan:** A defensive edge-case guard with no observable effect on any planned scenario. No scope creep.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness

**Verification results (all commands run and their actual output recorded, not assumed):**
- `npm --prefix server run test -- --run` → **136/136 passed** (baseline 125 + 11 new: 9 in `writingPhase.integration.test.ts`, 2 in `captionPrivacy.integration.test.ts`)
- `npm --prefix client run test -- --run` → **34/34 passed** (unchanged from baseline — no client test file was added or touched this plan)
- `npm --prefix server run typecheck` → exits 0, no output
- `npm --prefix client run typecheck` → exits 0, no output
- `npm --prefix client run build` → exits 0, "✓ 61 modules transformed" / "✓ built in ~480-560ms"

**What only a real browser/multi-window check can confirm (not proven here, no real phone/browser available in this execution environment):**
- Task 2's three-window human-check: each window showing its own numbered placeholder panel and caption box; sending from one window making the count climb and a checkmark appear beside that name in the *other* two windows with the caption text itself nowhere on their screens; a player who hasn't sent showing nothing beside their name; the countdown staying visible throughout and turning urgent in the last ten seconds; and, when the last window sends, all three screens leaving `WRITING` about three seconds later rather than instantly. The server-side collapse timing and the D-14 no-leak property are both machine-proven (see coverage D3/D4 above); what's unverified here is purely the *visual* experience of watching it happen live across real devices.
- Whether `.writing-panel`'s layout (textarea, progress line, checkmark roster) stays legible and non-overflowing on a genuinely narrow/older phone viewport, beyond what `vite build`'s CSS output confirms is syntactically valid.

**Known (documented, non-blocking) UI overlap:** during `WRITING`, `Round.tsx`'s baseline roster (no checkmarks) and `WritingPanel`'s own roster (with checkmarks) both render — see key-decisions above. Functionally correct, but a later pass could unify them into a single list.

**Ready for 02-04 (per-meme rating rotation):** `Room.submissions` (a `Map`, insertion-ordered) is exactly the reveal-rotation source plan 02-04 needs — no reshuffling or re-derivation required. `progress.submittedPlayerIds` and `Room.players`'s `connected` flag together already give plan 02-04 everything it needs to compute "which submitters are eligible to be shown and rated" (D-08's skip-non-submitters rule) without touching `Room.submitCaption` again.

**No blockers.**

## Self-Check: PASSED

All 3 created files confirmed present on disk; all 3 task commit hashes (`1f7f1f8`, `938ba4f`, `41e12f4`) confirmed present in git history.

---
*Phase: 02-server-authoritative-round-engine*
*Completed: 2026-09-06*
