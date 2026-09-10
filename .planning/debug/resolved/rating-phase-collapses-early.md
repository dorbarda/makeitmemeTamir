---
status: resolved
trigger: "Follow-up from resolved debug session writing-phase-ends-early: the rating-phase quorum check (maybeCollapseRating / eligibleRaters in server/src/rooms/rotation.ts) has the same shape as the writing-phase bug that was just fixed — it likely counts a player as 'done rating' the instant their socket disconnects (phone screen lock / backgrounded tab), so if enough other raters are still connected and submit their ratings, the step collapses early even though a genuinely-present player just had their phone lock for a moment. This runs on an 8-15s rating step instead of the 60s writing step, so it is even more likely to actually trigger in practice."
created: 2026-09-10
updated: 2026-09-10
---

## Symptoms

- **Expected behavior**: Each rating step should run for the configured `ratingSeconds` (default 10s; presets 8/10/15) unless every genuinely-present eligible rater has actually rated.
- **Actual behavior**: Suspected (not yet confirmed live) — a rating step can collapse to `RATING_COLLAPSE_MS` (2s) as soon as every *currently connected* eligible rater has rated, even if another eligible rater merely has their phone screen locked/backgrounded at that instant (still present, not actually gone).
- **Error messages**: None expected; this is a logic bug, not a crash.
- **Timeline**: Not yet observed directly in a live test (unlike the writing-phase sibling bug, which was observed with 3 players). Flagged as a near-certain follow-up by the debugger that fixed `writing-phase-ends-early` (see `.planning/debug/resolved/writing-phase-ends-early.md`), based on `maybeCollapseRating()`/`eligibleRaters()` sharing the exact same instant-`connected` quorum shape as the just-fixed `maybeCollapseWriting()`.
- **Reproduction**: Expected to reproduce the same way as the resolved sibling bug — background/lock a rater's phone screen during a RATING step shortly after the step opens, then have the remaining eligible raters submit their ratings, and check whether the step closes early (well before `ratingSeconds` elapses) despite the locked player never having rated.

## Current Focus

hypothesis: CONFIRMED (via code inspection, no additional logging needed). `maybeCollapseRating()` (server/src/rooms/Room.ts) computed its "everyone's done" quorum via `eligibleRaters()` (server/src/rooms/rotation.ts), which filters purely on live `player.connected` state with zero grace — exactly the pre-fix shape of `maybeCollapseWriting()`. A rater whose phone locks/backgrounds an instant before the remaining raters submit was silently dropped from the quorum, collapsing the step to `RATING_COLLAPSE_MS` (2s) even though they were still genuinely present.
test: Read `eligibleRaters()`'s filter in server/src/rooms/rotation.ts and cross-referenced with the resolved writing-phase fix's `DISCONNECT_QUORUM_GRACE_MS`/`Room.isPendingForQuorum()`. Extended `server/test/neverStalls.integration.test.ts` with the same three-scenario coverage the writing-phase fix used (recently-detached-still-blocks, past-grace-no-longer-blocks, reconnect-within-grace-still-collapses).
expecting: confirmed — `eligibleRaters()` had no grace window, so the collapse-too-early bug reproduced in an integration test; applying `isPendingForQuorum()` to `maybeCollapseRating()`'s own quorum computation (leaving `eligibleRaters()` itself unchanged for its other two call sites) fixed it.
next_action: none — fixed and tested. See Resolution.

## Evidence

- timestamp: 2026-09-10T01:00:00Z
  finding: >
    `eligibleRaters()` (server/src/rooms/rotation.ts:24-31) filters `this.players` down to
    `p.connected && p.id !== authorId` with no grace window whatsoever — the exact same
    zero-grace shape `maybeCollapseWriting()` had before its own fix. `maybeCollapseRating()`
    (server/src/rooms/Room.ts, pre-fix) computed `allRated = eligible.length > 0 &&
    eligible.every((id) => stepRatings?.has(id))` straight from that filtered list, so a rater
    whose socket disconnects (screen lock/backgrounded tab, via `Room.detach()` setting
    `connected = false` synchronously) drops out of `eligible` the instant it happens, letting
    the remaining connected raters' submissions collapse the deadline to `RATING_COLLAPSE_MS`
    (2s) out from under them.
  source: server/src/rooms/rotation.ts:24-31, server/src/rooms/Room.ts (pre-fix maybeCollapseRating)
- timestamp: 2026-09-10T01:00:01Z
  finding: >
    `DISCONNECT_QUORUM_GRACE_MS` (18s, = `DEAD_SOCKET_WINDOW_MS`) already exceeds every
    `ratingSeconds` preset (8/10/15s). This means a rater who detaches only after the current
    RATING step has already opened can never age past grace before that same step's own
    natural deadline fires — the "past grace" side of the fix can only be exercised by a
    detach that happened earlier (e.g. back during WRITING), which is also the realistic
    shape of "truly gone by the time rating starts." Confirmed by writing the regression test
    for this case: detaching mid-step and merely advancing 18s inside the step itself would
    have let the step's own untouched deadline fire first, never reaching the intended
    assertion — the test instead detaches before WRITING closes and advances through the
    normal WRITING + BETWEEN_PHASES_MS transit to let grace expire naturally before RATING
    opens.
  source: server/src/config.ts:60,86-87 (DISCONNECT_QUORUM_GRACE_MS, RATING_SECONDS_PRESETS)
- timestamp: 2026-09-10T01:00:02Z
  finding: >
    One existing test in `server/test/neverStalls.integration.test.ts` ("a player detaching
    during a RATING step before rating does not block the remaining eligible raters from
    collapsing the step early") encoded the old zero-grace behavior as correct — detaching and
    asserting an immediate collapse with zero elapsed time, the RATING-phase counterpart of
    the two WRITING tests the sibling fix had to update.
  source: server/test/neverStalls.integration.test.ts (pre-fix)
- timestamp: 2026-09-10T01:00:03Z
  finding: >
    Full server test suite passes after the fix (220/221 non-pre-existing tests; the one
    pre-existing failure, `qrJoinUrl.test.ts`'s SPA-shell 404, reproduces identically on a
    clean checkout with no frontend build present and is unrelated to this fix — the exact
    same pre-existing failure the sibling `writing-phase-ends-early` session already noted).
    `tsc --noEmit` is clean.
  source: server test suite run, server/tsconfig.json

## Eliminated

- possibility: A genuine server-side round-timer bug (wrong deadline math, off-by-one in
  `schedulePhase`/`collapseDeadline`) shared with the RATING phase.
  reason: `collapseDeadline`'s "only ever shortens" invariant and `schedulePhase`'s deadline
  math are exercised (and pass) by `ratingStep.integration.test.ts`'s own D-07 "never extends"
  cases both before and after this fix — unaffected by this fix, which changes only which
  raters count toward the collapse quorum, not the timer arithmetic itself.
- possibility: `eligibleRaters()` itself needing to change its own definition (used elsewhere
  for `eligibleAtClose` bookkeeping and the player-facing `ratingStep.eligibleCount`/
  `youMayRate` snapshot fields).
  reason: those two other call sites must reflect who is truly connected right now, not who is
  still within a grace window — widening `eligibleRaters()`'s own definition would have made
  `eligibleAtClose` (D-10's Phase 4 flag) and the live snapshot count a phone that is
  genuinely gone as still "eligible," which is a different, unrelated concern from the
  collapse-quorum bug this session investigated. The fix instead applies the grace check only
  inside `maybeCollapseRating()`'s own quorum computation.

## Resolution

root_cause: >
  `maybeCollapseRating()` computed its "has everyone rated" quorum from `eligibleRaters()`,
  which filters purely on live `player.connected` state with no grace period. `Room.detach()`
  sets `connected = false` synchronously on the socket.io `"disconnect"` event, which a real
  phone triggers immediately on screen lock or backgrounding — indistinguishable, at that
  instant, from a rater who has genuinely left. Once a rater's phone locked during a RATING
  step, the server immediately dropped them from the quorum; the moment the remaining
  actively-connected raters rated, the server believed "everyone's done" and collapsed the
  deadline to `RATING_COLLAPSE_MS` (2s) — over a step that only allots 8-15s to begin with,
  making this the same bug as `writing-phase-ends-early` but more likely to bite in practice.
fix: >
  `maybeCollapseRating()` (server/src/rooms/Room.ts) now computes its "still pending" check
  using the existing `isPendingForQuorum()` helper (added by the sibling fix) instead of the
  raw `eligibleRaters()` list — a non-author player counts as still pending (blocking
  collapse) while connected, or disconnected but within `DISCONNECT_QUORUM_GRACE_MS` of their
  `detach()` timestamp. The `eligible.length === 0` short-circuit is preserved unchanged (no
  currently-connected non-author rater at all still means no collapse), and `eligibleRaters()`
  itself is left on its original raw-`connected` definition, since it also feeds
  `eligibleAtClose` (D-10's Phase 4 flag, recorded at actual close) and the player-facing
  `ratingStep.eligibleCount`/`youMayRate` snapshot fields — both of which must reflect who is
  truly connected right now, not a grace-extended set. Because `DISCONNECT_QUORUM_GRACE_MS`
  (18s) already exceeds every `ratingSeconds` preset (8/10/15s), the practical effect for a
  rater who disconnects mid-step is exactly the sibling fix's worst case: the step runs its
  full configured `ratingSeconds` instead of a rushed 2s cutoff, and `collapseDeadline`'s
  "only ever shortens" invariant means this can never make a step run longer than its original
  deadline. Extended `server/test/neverStalls.integration.test.ts` with the RATING-phase
  counterpart of the sibling fix's three regression tests: a rater detached long enough ago
  (back during WRITING, since grace outlasts any rating step) no longer blocks collapse; a
  rater who just detached moments into the current step still blocks collapse for the step's
  full duration; a rater who reconnects and rates within grace still lets the step collapse
  once everyone is truly done. Full server test suite passes (220/221 non-pre-existing tests;
  the one pre-existing failure, `qrJoinUrl.test.ts`'s SPA-shell 404, is unrelated and
  reproduces identically on a clean checkout with no frontend build present). `tsc --noEmit`
  is clean.
prevention: >
  why not caught: this was flagged as a fast-follow by the sibling `writing-phase-ends-early`
  session rather than caught by a pre-existing gate — no test exercised a RATING-phase
  disconnect happening moments before the other raters' submissions, mirroring exactly why the
  writing-phase bug itself went uncaught (this class of bug only appears on a real phone's
  instant socket-close, not in the bare-`Room` + fake-timers harness, unless a test
  deliberately interleaves a fresh detach with same-tick submissions); guard: three new
  regression tests in `neverStalls.integration.test.ts` now cover exactly this interleaving
  for RATING (locked-then-submit-immediately, locked-then-reconnect-within-grace,
  locked-past-grace-via-an-earlier-phase), so any regression collapses the step again in CI,
  not on a phone at the actual party.
specialist_hint: typescript
follow_up: >
  None outstanding — this was the last of the two phases (`WRITING`, `RATING`) sharing the
  instant-`connected` quorum shape; both are now fixed with the same grace-window guard.
