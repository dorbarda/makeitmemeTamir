---
status: investigating
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

hypothesis: `maybeCollapseWriting()` (server/src/rooms/Room.ts) ends the writing phase early once every *connected* player has submitted. `connected` is toggled by socket.io transport disconnect/reconnect (`Room.detach`/`Room.attach`), not by whether a player is actually present and able to write. On a real phone, backgrounding the tab / locking the screen (setting the phone down between rounds, common by round 2-3 once novelty wears off) can trigger an immediate socket disconnect, shrinking the "connected players" set. If the remaining actively-connected player(s) then submit — even at a normal pace — the server believes everyone is done and collapses the deadline to `WRITING_COLLAPSE_MS` (3s), ending the round while the backgrounded players are still present and mid-caption. This would explain round 1 (freshly joined, phones actively held/watched) working fine while rounds 2-3 (players relaxing, phones set down) fail.
test: Reproduce with a 3-player test room; background/lock one or two phones' screens shortly after a writing round starts, then submit from the one still-active phone, and observe whether the round collapses within ~3s afterward even though the backgrounded players never submitted.
expecting: The round collapses early (confirming the connected-count undercounts backgrounded-but-present players), and the collapse timing (few seconds after the single active submission) matches the reported 5-10s total.
next_action: Spawn gsd-debugger to reproduce/confirm this hypothesis against the actual disconnect/reconnect and submission event logs (add temporary logging around `detach`/`attach`/`maybeCollapseWriting` if no existing logs capture it), and once confirmed, fix `maybeCollapseWriting` so a merely-backgrounded-but-still-in-room player cannot be silently excluded from the "everyone's done" quorum (e.g. only collapse based on players who have not left/faded, not on live transport `connected` state — or require a longer grace/heartbeat before a disconnected player drops out of the quorum during WRITING).

## Evidence

## Eliminated
