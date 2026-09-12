# Phase 6: Host Controls & RTL Interface Hardening - Context

**Gathered:** 2026-09-07
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers two independent capabilities on top of the now-complete game (Phases 1-5):
break-glass host recovery tools (skip round, remove player, end game early, restart with the same
group), and a systematic right-to-left correctness audit of the WHOLE interface — not just the meme
image, which Phase 5 already handled. Covers LIVE-04, LIVE-05, LIVE-06, LIVE-07, HEB-01, HEB-02.

The document root is already `dir="rtl"` (`client/index.html`) and every screen has been built inside
that context since Phase 1 — this phase is an audit-and-fix pass over existing screens plus a
real-device keyboard check, not a from-scratch RTL implementation.

</domain>

<decisions>
## Implementation Decisions

### Interrupted Round (LIVE-04, LIVE-06)
- **D-01:** Skipping the current round or ending the game early discards that round entirely — no
  score is awarded from a round that didn't finish normally, regardless of how many captions were
  already submitted or memes already rated. Chosen for simplicity: "that round didn't count" is easy
  to say out loud to a room of 12 people mid-party; partial credit invites an argument about fairness
  under time pressure this project can't afford. — **Reversibility:** reversible — a pure scoring-rule
  choice with no data model implication (the discarded round's `submissions`/`ratings` are simply
  never passed through `applyRoundScores`).

### Player Removal (LIVE-05)
- **D-02:** A removed player can rejoin later exactly like any other reconnect (same room code, same
  name/session) — removal is a forced disconnect for the moment, not a permanent ban. This matches the
  party's actual failure mode (a phone died, someone needs to step out, a player is stuck and blocking
  round progress) rather than an adversarial moderation tool. — **Reversibility:** reversible — no new
  "banned" state is introduced; removal reuses the existing disconnect/reconnect machinery from Phase 1.

### End-Game-Early Results (LIVE-06)
- **D-03:** Ending the game early jumps straight to the exact same GAME_END screen (winner banner +
  scoreboard + best-of-night) Phases 4-5 already built, computed from whatever scores exist at that
  moment — no separate "ended early" screen, no added messaging. — **Reversibility:** reversible — pure
  reuse of `buildGameEndView`/`GameEndPanel.tsx`, no new component.

### Fresh Game With Same Group (LIVE-07)
- **D-04:** Starting a fresh game resets every player's score to 0, keeps the same room code and the
  same roster (no rejoin needed), and returns everyone to LOBBY. Each game is a discrete, independent
  contest — no cross-game running tournament total, which was never in the original requirements.
  — **Reversibility:** one-way in the sense that this is the sole reset path for `Player.score` outside
  a fresh room — a future "keep cumulative scores" request would need a new code path, not a config
  flip, since this decision deliberately does NOT thread a "carry scores forward" option through.

### RTL Audit Scope (HEB-01)
- **D-05:** No specific RTL bugs have been observed yet on the deployed app across Phases 1-5 — this
  phase runs a full, systematic audit (every screen, read aloud in Hebrew word order on a real phone)
  rather than chasing a known list of complaints. Checks: text alignment, icon/arrow direction (if any),
  flex/grid ordering, absolute-positioned elements that might assume LTR, and any place a `left`/`right`
  CSS property was used where a logical property (`inset-inline-start`/`-end`) would have been safer.

### Claude's Discretion
- Skipping a round in either WRITING or RATING sub-phase — the exact state-machine transition (does a
  "skip" from mid-RATING behave like the round's writing phase never happened, or does it specifically
  short-circuit whatever step is active) is an implementation detail for research/planning, not a
  product decision the user needs to weigh in on. The observable behavior (D-01: nothing counts, move
  to next round or GAME_END if this was the last one) is what's locked.
- The exact mechanics of "remove a player" server-side (does it need a distinct `NOT_HOST`-style
  error code and socket event, does removal need to un-block `MIN_SUBMISSIONS_TO_RATE`/rotation
  calculations if the removed player had a pending submission) — follows the existing host-only action
  pattern already established by `changeSetting`/`startGame` (identity check first, then phase/state
  validation), extended with whatever bookkeeping keeps an in-progress round from stalling on a
  removed player.
- HEB-02 (Hebrew keyboard works on real iPhone/Android) has no code to "build" beyond what a standard
  HTML `<textarea>`/`<input>` already provides — this is fundamentally a real-device verification item,
  like Phase 5's real-device gate, not a feature with new source files.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project scope and requirements
- `.planning/PROJECT.md` — core value, constraints
- `.planning/REQUIREMENTS.md` — LIVE-04, LIVE-05, LIVE-06, LIVE-07, HEB-01, HEB-02 are this phase's
  requirements
- `.planning/ROADMAP.md` — Phase 6 goal and success criteria; **UI hint: yes** is set on this phase in
  ROADMAP.md, so plan-phase's UI-SPEC gate may trigger — this phase touches real interaction design
  (host control placement, confirmation patterns for destructive-feeling actions) as well as a visual
  audit, so a UI-SPEC is likely warranted here, unlike Phases 3/4 which extended already-built screens

### What already exists (extend, do not rebuild)
- `server/src/rooms/Room.ts` — the host-only action pattern (`changeSetting`, `startGame`): identity
  check (`playerId !== this.hostId` -> `NOT_HOST`) first, then phase/state validation, then the
  mutation itself. New host actions (skip round, remove player, end game early, restart) should follow
  this exact shape.
- `server/src/rooms/Room.ts` — `applyRoundScores` (the sole score-mutation site) and `buildGameEndView`
  (GAME_END's winner/best-of computation) — LIVE-06 reuses `buildGameEndView` directly rather than
  building a parallel "early end" view
- `client/index.html` — `<html lang="he" dir="rtl">` already set at the document root; every screen
  inherits this
- Phase 1's reconnect/session-token machinery (`01-04-SUMMARY.md`) — LIVE-05's removal reuses this
  rather than introducing a new "banned" concept
- Every screen component under `client/src/screens/` — the RTL audit's actual subject matter

No external ADRs or specs exist for this project — all decisions live in the files above plus this
document's `<decisions>` section.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `server/src/rooms/Room.ts`'s host-only action validation order (identity -> phase/state -> value) —
  copy for every new host action this phase adds
- `shared/protocol.ts`'s `ErrorCode` union — new host-action failures (e.g. a `NOT_HOST` reuse, or a
  new code if removal/skip need a distinct one) get added here, never a raw string
- `shared/messages.ts`'s `HEBREW_UI`/`HEBREW_ERRORS` — every new host-control label/confirmation string
  goes here

### Established Patterns
- Server is sole authority on all state — every host action is validated and executed server-side; the
  client only ever displays what the server sends and requests an action
- The existing automatic host-transfer logic (Phase 1, `01-04-SUMMARY.md`) already handles what happens
  when the CURRENT host disconnects — this phase's new host actions must not conflict with or bypass
  that transfer logic
- Every Hebrew string lives in `shared/messages.ts` — no inline literals

### Integration Points
- Skip-round and end-game-early both need to interrupt whatever server-owned timer is currently running
  (writing countdown or a rating-step countdown) — follow the existing timer-clearing pattern already
  used at round/phase transitions (`Room.ts`'s timer cleanup, referenced in Phase 2's summaries)
- Restart-with-same-group needs to reset `Player.score` for every current roster member and return the
  room to `LOBBY`, reusing whatever settings-lock/reset logic already exists from the original LOBBY
  entry path

</code_context>

<specifics>
## Specific Ideas

- No specific RTL bugs have been reported from real-phone testing across Phases 1-5 — the audit should
  be systematic (every screen, read aloud in Hebrew word order), not targeted at known complaints.
- This phase is explicitly framed as "break-glass" tooling for the host — a live mishap during the
  actual party, not a general admin panel. Keep the host controls minimal and obviously scoped to
  exactly the four actions in LIVE-04/05/06/07, not a broader host dashboard.

</specifics>

<deferred>
## Deferred Ideas

- Cross-game running tournament totals (keeping scores across a restart) — considered, not chosen;
  each game is discrete per D-04.
- A distinct "game ended early" messaging/screen — considered, not chosen; LIVE-06 reuses the normal
  GAME_END screen verbatim per D-03.
- A permanent-ban concept for removed players — considered, not chosen; removal is a forced disconnect
  only, per D-02.

</deferred>

---

*Phase: 6-Host Controls & RTL Interface Hardening*
*Context gathered: 2026-09-07*
