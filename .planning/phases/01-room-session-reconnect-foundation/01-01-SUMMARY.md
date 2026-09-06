# Plan 01-01 — Summary

**Status:** Complete
**Completed:** 2026-09-06

## What was built

The greenfield project skeleton plus the end-to-end tracer slice: create a room, join it, see a
live roster, drop off, and come back as the same player.

- `shared/protocol.ts` — the wire contract shared by both sides
- `server/` — Express + Socket.IO, in-memory `RoomManager` / `Room` / `SessionRegistry`, handshake
  auth middleware, and the create/join/rejoin/resync/disconnect handlers
- `client/` — Vite + React, Hebrew RTL at the root, Home / Join / Lobby screens, a session store
  and a snapshot store fed by full server snapshots
- Tests: server 5/5, client 2/2, typecheck clean, production build succeeds

## Human-check result

Run by the user on two real phones against the deployed Render service. Reported as passing in
full, **including the screen-lock case** — the returning phone came back to the same roster with
the same identity, and no duplicate player appeared for the other phone.

**Measured settling time: reported as "seems instant"** by the user on the returning phone — the
unlocked phone was back on the correct roster with no perceptible delay.

What that does and does not settle for plan 01-04:

- It validates the *reconnect* path: `rejoin(roomCode, sessionToken)` plus a full state resync
  returns a woken phone to correct state immediately. No extra delay needs designing in on that side.
- It does NOT by itself fix `ROSTER_FADE_GRACE_MS` or `HOST_TRANSFER_GRACE_MS`. Those govern how
  long the OTHER players wait before a vanished player is shown as gone, which is bounded by how
  long the server takes to notice a dead socket — `PING_INTERVAL_MS` (10s) + `PING_TIMEOUT_MS` (8s),
  so up to ~18s. An instant return means the fade grace can be tuned toward the low end without
  risking a returning player flickering out of the roster, rather than the conservative 30s/60s
  currently shipped.

Plan 01-04 Task 3 should choose both constants deliberately against that ~18s detection window.

## Protocol contract changes

None. `shared/protocol.ts` was implemented as planned and did not need to change during the build.
`joinUrl` and `qrDataUrl` remain empty strings, to be filled by plan 01-03 as designed.

## Defects found after the plan's own verification passed

Both were found only because the app was opened on a real phone. Both were fixed and pushed.

1. **Every screen overflowed the viewport** (`f268e55`). The stylesheet had no page padding, and a
   label rendered its text beside its input on one row — wider than a phone screen, so the Hebrew
   title and the field label were clipped off the right edge. The stylesheet is now mobile-first,
   with a 16px base font size (below which iOS Safari zooms on focus) and 44px minimum tap targets.

2. **The socket never finished connecting, so every action silently did nothing** (`20b886f`).
   socket.io-client invokes a function-form `auth` option *with a callback* and ignores the return
   value; the code returned an object instead of invoking the callback, so the CONNECT packet was
   never sent. The transport opened and the page looked healthy while every `emit()` queued forever
   against a socket that never connected.

   **Why the suite missed it:** the test helper passes `auth` as a plain object, which takes a
   different code path inside socket.io-client. The function form was never exercised outside a
   browser. This is a real coverage gap, not bad luck — see below.

   The same commit also removed the websocket-only transport pin, which would have produced an
   identical dead screen for any player whose network blocks a raw websocket upgrade.

## Deviations from the roadmap

Phase 7 deployment work was brought forward at the user's request (`44ab544`). The plan's human-check
requires two real phones, which cannot reach this isolated cloud session, so a public URL was needed
to run it at all. That commit also fixed a latent deployment defect: `tsx` sat in `devDependencies`
while the server needs it at runtime, and Render installs with `NODE_ENV=production`, under which
npm skips devDependencies — the service would have installed cleanly and then failed to boot.

## Carried forward

- **Measure the post-unlock settling time** and set the 01-04 grace constants from it.
- **No browser-level test exists.** The connection defect above was phase-critical and reached a
  user's phone with a fully green suite. Until something drives a real browser against the built
  client, this class of bug cannot fail in CI.
- **No connection feedback in the UI.** While the socket was dead the button simply did nothing —
  no error, no "connecting" state. A player who hits this at the party is stuck with no explanation,
  which is precisely what the project's core value rules out.
