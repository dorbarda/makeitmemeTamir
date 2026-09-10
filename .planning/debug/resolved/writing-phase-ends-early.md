---
status: resolved
trigger: "Live test with 3 friends: round 1 writing phase lasted the full time, but rounds 2 and 3 ended after only 5-10 seconds, not enough time to place caption text on the photo."
created: 2026-09-10
updated: 2026-09-10
---

## Symptoms

- **Expected behavior**: Every round's writing phase should run for the configured `writingSeconds` (default 60s), same as round 1.
- **Actual behavior**: Rounds 2 and 3 (in a 3-player live test) ended after only 5-10 seconds — players did not have time to place their caption text before the phase closed.
- **Error messages**: None. No errors seen in browser console or server logs.
- **Timeline**: First live test with real phones (3 players). Round 1 worked correctly (full duration). Rounds 2+ reproduced the fast-close every time in this session.
- **Reproduction**: Play a game with 3 players past round 1.

## Current Focus

hypothesis: CONFIRMED (via code inspection, no additional logging needed). `maybeCollapseWriting()` (server/src/rooms/Room.ts) ends the writing phase early once every *connected* player has submitted. `connected` is toggled by socket.io transport disconnect/reconnect (`Room.detach`/`Room.attach`), not by whether a player is actually present and able to write. On a real phone, backgrounding the tab / locking the screen (setting the phone down between rounds, common by round 2-3 once novelty wears off) can trigger an immediate socket disconnect, shrinking the "connected players" set. If the remaining actively-connected player(s) then submit — even at a normal pace — the server believes everyone is done and collapses the deadline to `WRITING_COLLAPSE_MS` (3s), ending the round while the backgrounded players are still present and mid-caption. This explains round 1 (freshly joined, phones actively held/watched) working fine while rounds 2-3 (players relaxing, phones set down) fail.
next_action: none — fixed and tested. See Resolution.

## Evidence

- timestamp: 2026-09-10T00:00:00Z
  finding: >
    `server/src/socket/handlers.ts:436` calls `room.detach(data.playerId)` synchronously on the
    socket.io `"disconnect"` event — no delay, no ping/pong grace. A screen lock closes the WS
    transport immediately on most mobile browsers, so `player.connected` flips to `false` the
    instant a phone is set down, not after any timeout.
  source: server/src/socket/handlers.ts:436-444
- timestamp: 2026-09-10T00:00:01Z
  finding: >
    `maybeCollapseWriting()` filtered `this.players` down to `p.connected` and collapsed the
    deadline to `WRITING_COLLAPSE_MS` (3s) the moment every *currently connected* player had
    submitted — a disconnected-but-present player (mid-caption, phone just locked) was silently
    excluded from that quorum with zero grace. Docstring explicitly called this intentional
    ("Deliberately keyed on connected players only ... a player who has left must never be able
    to hold the early finish hostage" — Phase 1 D-17, LIVE-03), confirming this was a designed
    behavior, not an oversight, that real-phone testing exposed as wrong for the "briefly
    backgrounded" case.
  source: server/src/rooms/Room.ts:446-453 (pre-fix)
- timestamp: 2026-09-10T00:00:02Z
  finding: >
    Two existing tests explicitly encoded the zero-grace "instant exclusion" behavior as
    correct: `writingPhase.integration.test.ts` ("does not let a detached non-submitter block
    the early-finish collapse") and `neverStalls.integration.test.ts` ("a player detaching
    during WRITING before submitting is excluded from the early-finish expectation") both
    called `room.detach()` then immediately asserted a collapse with zero elapsed time. This
    confirms LIVE-03's "never stall for a departed player" requirement was deliberately
    implemented as literally instantaneous, which is exactly what collides with a real phone's
    instant `disconnect` event on screen lock.
  source: server/test/writingPhase.integration.test.ts, server/test/neverStalls.integration.test.ts (pre-fix)
- timestamp: 2026-09-10T00:00:03Z
  finding: >
    The identical shape of bug exists in the RATING phase too: `maybeCollapseRating()` (Room.ts)
    uses `eligibleRaters()` (rotation.ts), which filters purely on `p.connected` with no grace,
    over an even shorter deadline (`ratingSeconds` 8/10/15s, `RATING_COLLAPSE_MS` 2s). Not
    reproduced or reported this session, so deliberately left unfixed — flagged as a fast-follow
    rather than changed blind.
  source: server/src/rooms/rotation.ts:24-31, server/src/rooms/Room.ts:841-849

## Eliminated

- possibility: A genuine server-side round-timer bug (wrong deadline math, off-by-one in
  `schedulePhase`/`collapseDeadline`).
  reason: `collapseDeadline`'s "only ever shortens" invariant and `schedulePhase`'s deadline math
  are both already covered by passing tests (`roundClockInvariants.test.ts`,
  `writingPhase.integration.test.ts`'s D-07 "never extends" cases) and were unaffected by this
  fix — the bug was entirely in *which players count toward the collapse quorum*, not in the
  timer arithmetic itself.

## Resolution

root_cause: >
  `maybeCollapseWriting()` computed its "has everyone finished writing" quorum from
  `player.connected`, and `Room.detach()` sets `connected = false` synchronously on the socket.io
  `"disconnect"` event with no grace period. On a real phone, locking the screen or backgrounding
  the tab closes the WebSocket transport immediately, which is indistinguishable — at the instant
  it happens — from a player who has genuinely left the game. Once a player's phone locked
  (common by round 2-3 as novelty wears off), the server immediately dropped them from the
  writing-phase quorum; the moment the remaining actively-connected players submitted at a normal
  pace, the server believed "everyone's done" and collapsed the deadline to `WRITING_COLLAPSE_MS`
  (3s), cutting the round to ~5-10s total and leaving the backgrounded player with no time to
  place their caption.
fix: >
  Added `DISCONNECT_QUORUM_GRACE_MS` (`server/src/config.ts`, reusing the already-established
  `DEAD_SOCKET_WINDOW_MS` = 18s — "worst case before Socket.IO itself concludes a socket is
  dead") and a new `Room.isPendingForQuorum()` helper (`server/src/rooms/Room.ts`) that treats a
  disconnected, non-submitted player as still "pending" (blocking collapse) for
  `DISCONNECT_QUORUM_GRACE_MS` after their `detach()` timestamp, tracked in a new
  `disconnectedAt` map (set in `detach()`, cleared in `attach()` and on roster fade).
  `maybeCollapseWriting()` now collapses only once every player who is either connected or still
  within their grace window has submitted. Because `collapseDeadline` only ever shortens the
  deadline, the worst case for a genuinely-backgrounded player is now the round's full configured
  `writingSeconds` (same as it would be with no collapse feature at all) instead of a rushed 3s
  cutoff — and a player disconnected long enough ago (past the grace window) still stops blocking
  the collapse exactly as before, so LIVE-03 ("never stalls for a player who has left") is
  unaffected. Updated the two tests that had encoded the old zero-grace behavior to advance past
  the grace window before asserting collapse, and added three new tests reproducing the reported
  bug directly (a just-locked phone still blocks collapse; a phone that reconnects within grace
  still lets the round collapse; a phone gone past grace no longer blocks it). Full server test
  suite passes (218/219 non-pre-existing tests; the one pre-existing failure,
  `qrJoinUrl.test.ts`'s SPA-shell 404, reproduces identically on a clean checkout with no frontend
  build present and is unrelated to this fix).
prevention: >
  why not caught: no test exercised a disconnect happening *moments* before the other players'
  submissions during WRITING — every existing collapse test either detached with zero
  intervening submissions expected to matter, or the reported real-phone screen-lock timing
  itself was untested (this class of bug only appears on real phones, not in the bare-`Room` +
  fake-timers harness, unless a test deliberately interleaves a fresh detach with same-tick
  submissions, which none did before this fix); guard: three new regression tests in
  `writingPhase.integration.test.ts`/`neverStalls.integration.test.ts` now cover exactly this
  interleaving (locked-then-submit-immediately, locked-then-reconnect-within-grace,
  locked-past-grace) so any regression collapses the round again in CI, not on a phone at the
  actual party.
specialist_hint: typescript
follow_up: >
  `maybeCollapseRating()`/`eligibleRaters()` (RATING phase) has the identical instant-`connected`
  quorum shape and is very likely exposed to the same class of bug over an even shorter deadline
  (8-15s). Not reproduced or fixed this session (out of the confirmed scope); recommend a
  follow-up debug/fix pass applying the same `isPendingForQuorum`-style grace to the rating
  quorum before the event.
