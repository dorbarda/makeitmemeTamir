---
phase: 01-room-session-reconnect-foundation
plan: 03
subsystem: rooms
tags: [qrcode, deep-link, web-share-api, socket.io, rtl, hebrew]

# Dependency graph
requires:
  - phase: 01-room-session-reconnect-foundation (plan 01)
    provides: >
      shared/protocol.ts's LobbySnapshot.joinUrl/qrDataUrl fields (left empty
      by design), Room/RoomManager, the create/join/rejoin handlers, and the
      client Home/Join/Lobby screens and socket connection
  - phase: 01-room-session-reconnect-foundation (plan 02)
    provides: >
      shared/messages.ts (HEBREW_ERRORS/HEBREW_UI), the sanitize-then-validate
      name pipeline, and the Lobby rename control this plan extends
provides:
  - server/src/rooms/joinUrl.ts — resolveOrigin, buildJoinUrl, buildQrDataUrl
  - Room.joinUrl / Room.qrDataUrl cached once at creation and carried in every
    snapshot; RoomManager.createRoom(origin) is now async
  - An explicit GET /join/:code SPA-fallback route
  - client/src/screens/JoinByCode.tsx — the manual 4-digit fallback (D-04)
  - client/src/share/shareJoinLink.ts — shareJoinLink, buildWhatsAppUrl
  - Full lobby presentation: visible room code, QR image, share control,
    roster, ready count (D-12, LOBBY-02, LOBBY-05)
affects: [phase-2-round-engine, phase-6-host-controls, phase-7-deployment]

actuals:
  tokens: 9237
  tasks: 3
  commits: 6

tech-stack:
  added: []
  patterns:
    - "Origin resolution precedence: PUBLIC_BASE_URL env > handshake origin header > handshake host header > http://localhost fallback — never a literal in source"
    - "Join URL and QR data URL computed once per room at creation and cached as readonly Room fields, never regenerated per snapshot"
    - "A RoomManager.reservedCodes set closes the await-window race between the synchronous room-code collision check and the async QR generation"
    - "Lightweight in-app routing via a single App.tsx pathname useState + history.pushState/replaceState + a popstate listener — no router library for three screens"
    - "shareJoinLink's three-branch result type ({shared}|{dismissed}|{fallback, whatsAppUrl}) never throws; the caller composes the fallback with a clipboard copy"

key-files:
  created:
    - server/src/rooms/joinUrl.ts
    - server/test/qrJoinUrl.test.ts
    - server/test/roster.integration.test.ts
    - client/src/screens/JoinByCode.tsx
    - client/src/share/shareJoinLink.ts
    - client/src/share/shareJoinLink.test.ts
  modified:
    - shared/messages.ts
    - server/src/rooms/Room.ts
    - server/src/rooms/RoomManager.ts
    - server/src/socket/handlers.ts
    - server/src/app.ts
    - server/src/config.ts
    - server/test/tracer.e2e.test.ts
    - client/src/App.tsx
    - client/src/screens/Home.tsx
    - client/src/screens/Join.tsx
    - client/src/screens/Lobby.tsx
    - client/src/index.css

key-decisions:
  - "RoomManager.createRoom became async (accepting the resolved origin) because buildQrDataUrl is async; a reservedCodes Set<string> closes the collision-check-then-await race so two create-room intents landing in the same tick can never claim the same 4-digit code"
  - "resolveOrigin's precedence is PUBLIC_BASE_URL env, then the handshake's origin header, then its host header, then a hardcoded http://localhost as the last-resort fallback so room creation never throws even with no headers at all (verified this only triggers in contrived test conditions, never in a real socket.io handshake)"
  - "JoinByCode.tsx collects the code AND the name on one screen and emits join-room directly (identical intent to Join.tsx), rather than a two-step hand-off into the Join component — this matches the plan's explicit behavior spec ('submits to the same join-room intent... leaving the typed digits in place') and keeps the app at exactly three screens (Home, Join, JoinByCode) with no router"
  - "Removed the pre-existing '(מארח/ת)' host tag from Lobby.tsx's roster row. Plan 01-02 had added it, but CONTEXT.md's Deferred Ideas section and this plan's explicit prohibition both say no host crown/badge in the lobby (deliberately declined by the user) — this was a latent conflict between an earlier implementation detail and the locked decision, corrected here as part of the lobby rewrite"
  - "shareJoinLink's fallback path opens the WhatsApp URL via window.open AND copies the join link to the clipboard in the same action, since the plan calls for a clipboard copy alongside the WhatsApp fallback for a browser with neither share nor a WhatsApp handler"
  - "Pre-existing inline Hebrew literals not newly introduced by this plan (the app title, the generic name-field label, the '(מנותק/ת)' disconnected tag) were left as inline literals, consistent with the precedent set in 01-02's SUMMARY — only the strings this plan actually introduces were routed through HEBREW_UI"

patterns-established:
  - "A room's join URL and QR are immutable, cached, server-authoritative facts computed exactly once — never re-derived per snapshot or trusted from client input"
  - "Client-side format validation (digit-only, 4-char code field; numeric keypad hint) is convenience only; the server's existing ROOM_NOT_FOUND/ROOM_FULL checks remain the sole authority"

requirements-completed: [LOBBY-01, LOBBY-02, LOBBY-05]

coverage:
  - id: D1
    description: "buildJoinUrl/resolveOrigin/buildQrDataUrl produce a stable, header/env-derived join URL and a matching QR PNG data URL, cached once per room and identical across every snapshot"
    requirement: "LOBBY-02"
    verification:
      - kind: unit
        ref: "server/test/qrJoinUrl.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "A join or leave broadcasts a full roster snapshot to every socket in the room, and a joining player sees everyone already present, not only itself (LOBBY-05)"
    requirement: "LOBBY-05"
    verification:
      - kind: integration
        ref: "server/test/roster.integration.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "GET /join/:code returns the SPA shell (200, text/html), never a 404, for a cold request that never went through client-side navigation"
    verification:
      - kind: integration
        ref: "server/test/qrJoinUrl.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "shareJoinLink's three branches (native share success, user-dismissed AbortError, and the no-share-API/any-other-failure fallback) each resolve correctly and the function never throws; buildWhatsAppUrl percent-encodes the join URL with a Hebrew invitation"
    requirement: "LOBBY-02"
    verification:
      - kind: unit
        ref: "client/src/share/shareJoinLink.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "The link path (Join.tsx) is genuinely one screen — code pre-filled from the URL, only a name field to fill in — and the manual fallback (JoinByCode.tsx) opens a numeric keypad and reaches the same join-room intent"
    requirement: "LOBBY-01"
    verification:
      - kind: unit
        ref: "npm --prefix client run build"
        status: pass
    human_judgment: true
    rationale: "Whether the deep link genuinely renders as ONE unbroken screen on a real phone (vs. a jsdom/build-time proxy for it), and whether the numeric keypad actually opens on a real device keyboard, can only be confirmed by the plan's own Task 2 human-check on a real phone. Not run in this environment — no phone access. Deferred to end-of-phase UAT per workflow.human_verify_mode=end-of-phase, consistent with plan 01-02's precedent."
  - id: D6
    description: "The lobby shows the room code, QR, share control, roster and ready count to every player (never gated on isHost), the QR and share link resolve to the same URL, and the QR is legible/scannable and correctly RTL on a real phone"
    requirement: "LOBBY-05"
    verification:
      - kind: unit
        ref: "npm --prefix client run test -- --run"
        status: pass
    human_judgment: true
    rationale: "Task 3's human-check requires three real phones (roster/code/share visibility across non-host phones), a fourth phone's camera actually scanning the QR at a realistic distance, and a Hebrew word-order legibility read-aloud. None of this can be exercised outside a real device and was not run in this environment. Deferred to end-of-phase UAT."

duration: 35min
completed: 2026-09-06
status: complete
---

# Phase 1 Plan 3: Join URL, QR, Manual Fallback, and Lobby Presentation Summary

**A cached-per-room join URL/QR pair built from the socket handshake's own origin (never a hardcoded host), a one-screen deep-link join plus a numeric-keypad 4-digit fallback, and a lobby that shows the room code, QR and a Web-Share/WhatsApp/clipboard share control to every player, not just the host.**

## Performance

- **Duration:** 35 min
- **Started:** 2026-09-06T09:39:00Z
- **Completed:** 2026-09-06T09:54:14Z
- **Tasks:** 3
- **Files modified:** 18 (6 created, 12 modified)

## Accomplishments

- `server/src/rooms/joinUrl.ts` — `resolveOrigin` (PUBLIC_BASE_URL env, else the handshake's `origin` header, else its `host` header, else a last-resort `http://localhost`, never a literal), `buildJoinUrl`, `buildQrDataUrl`. Verified end-to-end against a real running server, both with and without `PUBLIC_BASE_URL` set (see "Resolved origin strategy" below).
- `Room` caches `joinUrl`/`qrDataUrl` as readonly fields set once at construction and returned unchanged in every `snapshotFor` call — a room's join link is computed exactly once, not rebuilt on every roster change.
- `RoomManager.createRoom(origin)` is now async; a `reservedCodes` set closes the race window opened by awaiting QR generation, so two concurrent room creations can never collide on the same 4-digit code even though the collision check and the room-map insertion are no longer in the same synchronous tick.
- An explicit `GET /join/:code` route in `app.ts` serves the SPA shell directly (verified 200 + `text/html`, never a 404) so a phone opening a WhatsApp link cold gets the app.
- `server/test/roster.integration.test.ts` drives three real `socket.io-client` instances through join/join/leave, proving every socket sees the full roster with exactly one host, and a joining player sees everyone already present (LOBBY-05's automated half).
- `client/src/App.tsx` gained a minimal pathname + `navigate()` (pushState/replaceState + popstate) so Home, the deep-link `Join`, and the new `JoinByCode` fallback move between each other without a page reload or a router dependency.
- `client/src/screens/JoinByCode.tsx` — the manual fallback (D-04): a digit-only, `inputMode="numeric"`, `maxLength={4}` code field plus a name field, submitting straight to `join-room`; any error (including `ROOM_NOT_FOUND`) renders inline in Hebrew and leaves both fields untouched for retry.
- `client/src/share/shareJoinLink.ts` — `shareJoinLink`'s three-branch result (`shared` / `dismissed` / `fallback` with a `whatsAppUrl`) never throws; `Lobby.tsx`'s share button pairs the fallback with `window.open` on the WhatsApp link and a clipboard copy, showing a Hebrew "copied" toast.
- `client/src/screens/Lobby.tsx` rewritten to show the room code at large type, the QR image (relative-width, `max-width`-capped — never a fixed pixel size), the share button, the roster with a muted style for disconnected players, and the connected-count/ready-to-start line — none of it gated on `you.isHost` (D-12).
- Removed a locked-decision conflict found during the rewrite: plan 01-02 had added an explicit `(מארח/ת)` host tag to the roster row, which directly contradicts CONTEXT.md's Deferred Ideas note that a host crown/badge was considered and declined. Removed it as part of this plan's lobby work (see Deviations).

## Task Commits

Each task was committed atomically, with a separate RED (failing test) commit before each GREEN (implementation) commit for the `tdd="true"` tasks:

1. **Task 1: Server-side join URL, QR payload, and roster broadcast coverage**
   - `ee687fb` test — failing tests for `joinUrl.ts` and the roster broadcast
   - `8118034` feat — `joinUrl.ts`, `Room`/`RoomManager` caching, explicit `/join/:code` route, `tracer.e2e.test.ts` fix for the now-async `createRoom`
2. **Task 2: Home, deep-link join, and manual 4-digit fallback screens**
   - `6a38bb1` feat — `App.tsx` routing, `Home.tsx` "have a code" link, `JoinByCode.tsx`, `Join.tsx` heading, new `HEBREW_UI` keys
3. **Task 3: Lobby presentation — roster, ready count, visible code, QR, and share**
   - `d2b845f` test — failing tests for `shareJoinLink`/`buildWhatsAppUrl`
   - `02bed52` feat — `shareJoinLink.ts` implementation
   - `ab96171` feat — `Lobby.tsx` rewrite, `index.css` additions

**Plan metadata:** recorded in this commit (docs).

_Note: Task 2 had no dedicated RED commit — it is `type="auto"` without `tdd="true"`, unlike Tasks 1 and 3._

## Files Created/Modified

- `server/src/rooms/joinUrl.ts` — origin resolution, join URL construction, QR data-URL generation
- `server/src/rooms/Room.ts` — `joinUrl`/`qrDataUrl` readonly fields, cached at construction
- `server/src/rooms/RoomManager.ts` — `createRoom(origin)` now async, with the `reservedCodes` race guard
- `server/src/socket/handlers.ts` — `create-room` handler resolves origin from `socket.handshake.headers` and awaits `createRoom`
- `server/src/app.ts` — explicit `GET /join/:code` SPA-fallback route
- `server/src/config.ts` — documents the `PUBLIC_BASE_URL` env var (read directly at point of use, not re-exported as a constant)
- `server/test/qrJoinUrl.test.ts`, `server/test/roster.integration.test.ts` — new test files
- `server/test/tracer.e2e.test.ts` — updated for the async `RoomManager.createRoom` signature
- `client/src/App.tsx` — pathname state, `navigate()`, three-screen routing
- `client/src/screens/Home.tsx` — "have a code" secondary link
- `client/src/screens/JoinByCode.tsx` — the manual 4-digit fallback screen
- `client/src/screens/Join.tsx` — heading now sourced from `HEBREW_UI.joiningRoomPrefix`
- `client/src/screens/Lobby.tsx` — full lobby presentation rewrite
- `client/src/share/shareJoinLink.ts`, `client/src/share/shareJoinLink.test.ts` — new share module and tests
- `client/src/index.css` — `.room-code`, `.qr-code`, `.player--disconnected`
- `shared/messages.ts` — `codePlaceholder`, `enterCodeTitle`, `haveACode`, `joiningRoomPrefix`, `roomCodeLabel`, `shareButton`, `copiedToast`, `scanToJoin`, `connectedCount`, `readyToStart`

## Decisions Made

See `key-decisions` in the frontmatter. The two worth flagging out loud:

1. **The concurrency race in `RoomManager.createRoom`.** Making `createRoom` async (required because `buildQrDataUrl` is async) opened a window between the synchronous room-code collision check and the room actually being inserted into the map. Two `create-room` intents landing in the exact same event-loop tick could otherwise generate and accept the identical 4-digit code before either finished awaiting its QR code. A `reservedCodes` set closes this deterministically rather than relying on the collision being astronomically unlikely at party scale.
2. **The pre-existing host-tag conflict.** Plan 01-02's Lobby.tsx included an explicit `(מארח/ת)` tag next to the host's name in the roster. This directly contradicts a decision this plan's own CONTEXT.md and prohibition list state as already settled ("no host crown, badge, or any other explicit host marker — the user considered and declined it"). Removed during this plan's lobby rewrite rather than left in place, since the plan's own read_first material made the conflict explicit.

## Resolved origin strategy (for the record)

Verified against a real running server (not just the unit tests): with no `PUBLIC_BASE_URL` set and a non-browser `socket.io-client` handshake (no `Origin` header), `resolveOrigin` correctly fell back to the handshake's `host` header, producing `http://localhost:<port>/join/<code>`. With `PUBLIC_BASE_URL=https://tamir-party.onrender.com` set, the generated `joinUrl` was `https://tamir-party.onrender.com/join/<code>` regardless of what the connecting socket's headers reported — confirming the env variable takes precedence exactly as designed, which is what Phase 7's deployment will rely on.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical / spec conflict] Closed the room-code creation race introduced by making `createRoom` async**
- **Found during:** Task 1
- **Issue:** Making `RoomManager.createRoom` async (required for QR generation) opened a window where two concurrent room creations could pass the collision check for the same code before either inserted into the room map.
- **Fix:** Added a `reservedCodes: Set<string>` claimed synchronously before the `await`, released in a `finally` block.
- **Files modified:** `server/src/rooms/RoomManager.ts`
- **Verification:** Existing `tracer.e2e.test.ts` collision test (updated for the async signature) still passes; reasoned through the single-threaded event-loop guarantee that the synchronous reservation always completes before a second concurrent call's synchronous portion begins.
- **Committed in:** `8118034` (Task 1 commit)

**2. [Rule 1 - Bug / locked-decision conflict] Removed the pre-existing host badge from the lobby roster**
- **Found during:** Task 3 (read_first review of CONTEXT.md's Deferred Ideas alongside the existing `Lobby.tsx`)
- **Issue:** `Lobby.tsx` (from plan 01-02) rendered an explicit `(מארח/ת)` tag next to the host's name — a direct conflict with CONTEXT.md's locked note that a host crown/badge was considered and declined, and with this plan's own explicit "do not add a host crown, badge, or any other explicit host marker" instruction.
- **Fix:** Removed the host tag from the roster row; `isHost` remains in the wire payload for the server's own use and plan 01-04's transfer logic, just never rendered as a badge.
- **Files modified:** `client/src/screens/Lobby.tsx`
- **Verification:** `npm --prefix client run build` and the full client test suite pass; visual absence of the tag confirmed by reading the rewritten JSX.
- **Committed in:** `ab96171` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (1 missing-critical/concurrency, 1 bug/locked-decision conflict).
**Impact on plan:** Both fixes are corrections toward correctness and the already-locked product decision, not scope creep. No new user-facing behavior beyond what the plan specified.

## Issues Encountered

None beyond the carried-forward, pre-existing items from plans 01-01 and 01-02 (grace-delay constants, the still-pending real-phone name/keyboard human-check), which remain out of this plan's scope.

## Known Stubs

None. Every artifact this plan promised (`joinUrl.ts`'s three exports, `JoinByCode.tsx`, `shareJoinLink.ts`'s two exports, the roster/QR/share test files) is wired into the running create/join/share/lobby paths, not left as dead code. `qrDataUrl`/`joinUrl` are genuinely populated end-to-end — verified both by the automated suite and by a manual real-server smoke test (see "Resolved origin strategy" above).

## User Setup Required

None — no external service configuration required. `PUBLIC_BASE_URL` is an optional environment variable Phase 7's deployment plan will set; its absence does not block local or LAN development, which fall back to header-derived origin resolution.

## Next Phase Readiness

**Verification run in this session:**
- `npm --prefix server run test -- --run` — 9 files, 53 tests, all pass.
- `npm --prefix client run test -- --run` — 3 files, 13 tests, all pass.
- `npm --prefix server run typecheck` — clean.
- `npm --prefix client run build` — succeeds, `client/dist/index.html` exists.
- A manual real-server smoke test (not part of the automated suite) confirmed `joinUrl`/`qrDataUrl` are correctly populated end-to-end, both with and without `PUBLIC_BASE_URL` set.

**Not run — requires a real phone, no phone access in this environment:**
- Task 2's human-check: opening the deep join link on a real phone and confirming it is genuinely one screen with the numeric keypad opening on manual entry.
- Task 3's human-check: three phones viewing the same lobby (code/QR/share visible to every non-host phone), a fourth phone's camera actually scanning the QR at a realistic distance and landing on the same one-screen join page, a live roster update across two phones without reloading, and a Hebrew word-order legibility read-aloud.

Both are deferred to end-of-phase UAT consolidation per `workflow.human_verify_mode = end-of-phase` (the project default), consistent with plan 01-02's precedent (see coverage items D5/D6). This is the one class of thing this plan cannot verify on its own — exactly the lesson carried forward from plan 01-01's own real-phone-only defects (the dead-socket bug and the viewport overflow), so it is flagged explicitly here rather than assumed to work because the suite is green.

Ready for plan 01-04 (grace-delay reconnect UX / host-transfer logic) or for `/gsd-verify-work` to harvest the pending human-checks across all three plans in this phase.

---
*Phase: 01-room-session-reconnect-foundation*
*Completed: 2026-09-06*

## Self-Check: PASSED

All 18 key files confirmed present on disk (6 created, 12 modified); all 6 task/RED/GREEN commit
hashes confirmed in `git log`. Full re-run of `npm --prefix server run test -- --run` (9 files, 53
tests), `npm --prefix client run test -- --run` (3 files, 13 tests), `npm --prefix server run
typecheck`, and `npm --prefix client run build` all pass as of this SUMMARY's commit.
