# Phase 1: Room, Session & Reconnect Foundation - Research

**Researched:** 2026-09-05
**Domain:** Real-time room/session/reconnect plumbing (Socket.IO, Node/Express, React/Vite), Hebrew display names
**Confidence:** MEDIUM (core patterns HIGH/well-established; several project-specific numeric knobs — grace-delay lengths, exact ping tuning — are reasoned recommendations, not sourced facts, and are flagged `[ASSUMED]` below)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Getting In**
- **D-01:** The room code is **4 digits** (e.g. `4827`).
- **D-02:** The primary way in is a **WhatsApp link pasted into the group chat**, not a QR code scanned off the host's phone.
- **D-03:** The link **embeds the room code**, so a joiner sees exactly one screen: type a display name, tap join. — Reversibility: reversible.
- **D-04:** Manual 4-digit code entry remains supported as a fallback. The QR code (LOBBY-02) is still built and shown, but it is the secondary path.
- **D-05:** Room capacity is capped at roughly **20 players**. Anyone beyond the cap sees a clear Hebrew message rather than a broken screen.

**Names & Clashes**
- **D-06:** Names are **free text** — no preset nickname list.
- **D-07:** Duplicate names are resolved by **automatically appending a number** (a second "Dor" becomes "Dor 2") rather than rejecting the name. **This overrides ROADMAP.md success criterion 2, which says duplicates are "rejected" — that wording is stale. CONTEXT.md's D-07 is the newer, authoritative decision. The planner MUST implement auto-numbering, not rejection.**
- **D-08:** Names are limited to roughly **12-15 characters**. **Emojis are allowed.**
- **D-09:** A player **can rename themselves while waiting in the lobby**, but the name **locks once the game starts**.

**The Waiting Room**
- **D-10:** The **host is also a full player**.
- **D-11:** The host can start the game once **at least 3 players** have joined.
- **D-12:** The lobby screen shows a **live roster of names, a ready count, and the room code kept visible**.
- **D-13:** A player who leaves before the game starts **fades from the roster only after a short grace delay**.

**Coming Back**
- **D-14:** On reconnect the player lands **straight back on whatever screen the game is currently showing** — no "welcome back" popup.
- **D-15:** A half-typed caption is **NOT preserved** across a disconnect.
- **D-16:** If the **host's phone dies**, host powers **transfer automatically to another player** after a short grace period. — Reversibility: costly.
- **D-17:** A player who leaves mid-game and never returns **stays on the scoreboard**; play **never waits for them**.

### Claude's Discretion
The user made no "you decide" calls in this discussion. The following remain technical choices for research and planning:
- Session-token mechanics: token format, where it is stored on the device, and its lifetime.
- Length of the "short grace delay" in D-13 and D-16 — pick from real reconnect timing, not taste.
- Whether room state lives in a single in-memory object keyed by code, and how a room is disposed.
- Transport and reconnect-backoff configuration.

### Deferred Ideas (OUT OF SCOPE)
- **Joining mid-game** — tracked as v2 `SOCL-01`; not part of Phase 1.
- **Preset funny Hebrew nicknames** as quick-pick buttons — not chosen; free text preferred.
- **A visible host crown / explicit host marker** — not chosen; revisit in Phase 6.
- **Showing departed players greyed out as "disconnected"** rather than fading — not chosen for lobby; returns in Phase 4 for in-game presence.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LOBBY-01 | Host can create a game room and receive a short join code | 4-digit `nanoid` `customAlphabet` code generation + Room Manager collision-check pattern (Standard Stack, Architecture Patterns) |
| LOBBY-02 | Join code is also shown as a QR code players can scan | `qrcode` npm package `toDataURL`, encoding the full deep-join URL (Code Examples) |
| LOBBY-03 | Player can join a room by entering the code and a display name — no signup, no password | Join flow + session-token issuance (Architecture Patterns, Pattern 3) |
| LOBBY-04 | Duplicate display names are prevented so players can tell each other apart | **Superseded in scope by CONTEXT.md D-07: auto-numbering, not rejection** — see explicit note above and Common Pitfalls |
| LOBBY-05 | All players see the live list of who has joined the room | Full-state-snapshot broadcast pattern (Architecture Patterns, Pattern 2) |
| LIVE-02 | A player's identity survives a phone lock, a page refresh, or a brief disconnect | Session-token-in-localStorage + server-side token→player resolution + full resync (Architecture Patterns, Pattern 3; Common Pitfalls) |
</phase_requirements>

## Summary

This phase builds the one piece of the whole project that every later phase depends on and that fails silently if built wrong: a player's identity must survive a phone lock, a refresh, or a network hiccup, using an app-level session token — never Socket.IO's `socket.id`, which is reissued on every reconnect. The standard, well-established pattern (confirmed independently by all four project research files, and re-confirmed here against current Socket.IO/npm registry state) is: a single in-memory `Room` object per 4-digit code, held in a `Map` on one Node/Express process; a Socket.IO server whose `auth` handshake carries an opaque token generated on first join and persisted client-side in `localStorage`; and a "push full state snapshot, never a diff" broadcast so a reconnecting client is correct the instant it receives one message, with zero replay logic.

Two things in this phase are genuinely new (not already resolved by the four research files) and are the highest-value output of this research: (1) CONTEXT.md's D-07 auto-numbering decision directly contradicts ROADMAP.md's stale "duplicates are rejected" wording — the planner must implement auto-numbering with a lobby-only rename escape hatch (D-09), never rejection; and (2) the "short grace delay" lengths for D-13 (roster fade) and D-16 (host transfer) have no existing sourced value anywhere in the project's research — this document derives concrete numbers from Socket.IO's own ping/reconnect timing model and flags them `[ASSUMED]` for confirmation, since no external source states a "correct" bachelor-party-specific delay.

**Primary recommendation:** Build the Room Manager + session-token + reconnect skeleton first, with a placeholder LOBBY-only state broadcast, and prove it on a real phone (lock screen, unlock, confirm same name/roster position) before writing any other UI. Use Socket.IO 4.8.3 (server + client, matching majors), an opaque `crypto.randomUUID()` session token in `localStorage`, tuned-down ping settings (`pingInterval: 10000`, `pingTimeout: 8000`) for fast dead-connection detection at this small scale, and `Intl.Segmenter` (verified working in this project's exact Node 22.22.2 runtime) for correct Hebrew+emoji-aware name-length validation.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Room code generation & uniqueness | API / Backend | — | Server is the sole source of truth for which codes are active; client never invents or validates a code |
| QR code image generation | API / Backend (data) + Browser/Client (render) | — | Server knows the canonical join URL; `qrcode.toDataURL` can run server-side (embedded in the lobby state payload) or client-side from a URL the server provides — either is fine, but the URL itself is server-authoritative |
| Display name validation & de-duplication | API / Backend | Browser/Client (UX pre-check only) | Server is the only place duplicate-detection and grapheme-length enforcement can be trusted; client-side checks are pure UX convenience and must never be the enforcement point (a malicious or buggy client could bypass them) |
| Session token issuance & resolution | API / Backend | Browser/Client (storage only) | Server generates and owns the `token → playerId` mapping; client only stores and replays the token — never derives or validates it |
| Live roster broadcast | API / Backend | Browser/Client (render only) | Server pushes the full player list on every join/leave/reconnect; client is a pure renderer of whatever it receives |
| Reconnect / resync logic | API / Backend | Browser/Client (trigger only) | Client detects "I should ask for a resync" (via `visibilitychange`, `pageshow`, `connect` events) but the server decides what the correct current state actually is |
| Host-transfer logic (D-16) | API / Backend | — | Host is a server-side flag tied to a `playerId`, never inferred from client-sent data (per PITFALLS.md's explicit security note) |
| Static frontend delivery (React SPA) | CDN / Static (served by the same process) | — | For this project's scale, "CDN/Static" tier collapses into the same Express process serving the Vite build output — no separate static host needed |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.2.8 `[VERIFIED: npm registry, checked this session]` | Frontend UI | Locked by project CLAUDE.md; deepest AI-tooling training data of any SPA framework |
| Vite | 8.2.2 `[VERIFIED: npm registry, checked this session]` | Build tool / dev server | Locked by project CLAUDE.md; requires Node 20.19+/22.12+ — this machine runs Node 22.22.2 `[VERIFIED: node --version, checked this session]`, which satisfies the requirement |
| @vitejs/plugin-react | 6.1.1 `[VERIFIED: npm registry, checked this session]` | Vite's React plugin | Standard companion package for the Vite+React template |
| Node.js | 22 LTS (this machine: 22.22.2, `[VERIFIED]`) | Runtime | Meets both Vite 8's minimum and Socket.IO 4.8's requirements; also confirmed to ship a working `Intl.Segmenter` (see Code Examples) |
| Express | 4.22.2 `[VERIFIED: npm registry, checked this session]` (latest 4.x line; overall npm-latest is 5.2.1, also verified) | HTTP + static hosting + Socket.IO attach point | CLAUDE.md's Recommended Stack explicitly pins Express 4.x; Socket.IO attaches to the raw `http.Server`, not to the Express app object, so this pin is purely a project-instruction choice, not a technical requirement — Express 5.x would work identically for this phase's needs, but 4.x is what CLAUDE.md locks in |
| Socket.IO server (`socket.io`) | 4.8.3 `[VERIFIED: npm registry, checked this session]` | Real-time transport, rooms, reconnection | Locked by CLAUDE.md; gives rooms/broadcast/Connection State Recovery for free |
| Socket.IO client (`socket.io-client`) | 4.8.3 `[VERIFIED: npm registry, checked this session]` | Browser-side transport | Must match server major.minor exactly to avoid protocol mismatches `[CITED: socket.io official client-options docs]` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `nanoid` | 6.0.1 `[VERIFIED: npm registry, checked this session — note: CLAUDE.md/STACK.md cite "5.x", which is now stale; 6.0.1 is current]` | `customAlphabet('0123456789', 4)` for room codes; default `nanoid()` for the session token | Room codes need a numeric-only alphabet per D-01; session tokens can use the URL-safe default alphabet |
| `qrcode` | 1.5.4 `[VERIFIED: npm registry, checked this session]` | `QRCode.toDataURL(joinUrl)` → base64 PNG for `<img src>` | Encode the full deep-join URL (D-02/D-03), not the bare 4-digit code, so scanning the QR and tapping the WhatsApp link produce identical behavior |
| TypeScript | 7.0.2 `[VERIFIED: npm registry, checked this session]` | Type safety, especially server-side room/session module | CLAUDE.md: highest value on the server's room/game-state module — exactly what Phase 1 builds |
| `tsx` | 4.23.13 `[VERIFIED: npm registry, checked this session]` | Run TypeScript server code directly in dev without a separate compile step | Standard dev-loop companion for a TS Node server |
| `vitest` | 5.0.0 `[VERIFIED: npm registry, checked this session]` | Test runner for both server (Socket.IO integration tests) and client | Native Vite integration, zero extra config beyond what the Vite scaffold already has; supports real Socket.IO client/server integration tests (see Validation Architecture) |
| `supertest` (optional) | 7.2.2 `[VERIFIED: npm registry, checked this session]` | HTTP-level smoke test of the Express health-check endpoint | Only needed if a plain HTTP health-check route is added for host warm-keeping (Phase 7 concern, but the route itself can be stubbed now) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `localStorage` for the session token | `sessionStorage` | Rejected for this project: the primary join path (D-02/D-03) is a link pasted into WhatsApp, which on many phones opens inside WhatsApp's in-app browser first; if a player later taps "Open in Safari/Chrome," that can be a distinct browsing context. `sessionStorage` is scoped per top-level browsing context and would not reliably carry the token across that jump, while `localStorage` is scoped to the origin and survives it. `[ASSUMED]` — this is reasoned from `localStorage`/`sessionStorage` spec scoping, not from a source that tested this exact WhatsApp-in-app-browser scenario; treat as a recommendation to confirm in Phase 9's real-phone rehearsal, not a settled fact |
| Server-owned `Map<roomCode, Room>` in memory | Redis / external store | Rejected — single process, single event, no horizontal scaling; adding an external store is pure unneeded complexity per STACK.md and CLAUDE.md |
| Manual `customAlphabet('0123456789', 4)` collision-checked against the live room `Map` | Trusting `nanoid`'s own collision resistance | `nanoid`'s collision resistance assumes a large ID space; a 4-digit numeric code has only 10,000 possible values `[VERIFIED: nanoid docs — alphabet ≤256 symbols, shorter alphabets need more length for equivalent entropy]`, so this phase must explicitly retry-on-collision against the active-rooms map rather than trusting the library alone |

**Installation:**
```bash
# Frontend (React + Vite)
npm create vite@latest client -- --template react-ts
cd client
npm install socket.io-client@4.8.3
npm install @fontsource/heebo @fontsource/assistant

# Backend (Node + Express + Socket.IO)
mkdir server && cd server
npm init -y
npm install express@4 socket.io@4.8.3 nanoid@6 qrcode@1
npm install -D typescript tsx @types/express @types/node vitest

# Optional (server HTTP smoke tests)
npm install -D supertest
```

**Version verification:** All versions above were checked via `npm view <pkg> version` against the live npm registry during this research session (2026-09-05); see the `[VERIFIED]` tags. `npm view` succeeded for all packages; the sandboxed environment's outbound proxy blocked `api.npmjs.org` (the separate weekly-downloads endpoint), so download-count figures could not be independently re-verified this session — see Package Legitimacy Audit note below.

## Package Legitimacy Audit

The automated `package-legitimacy check` seam flagged every package below `SUS`, but in every case the *only* triggered reason was `unknown-downloads` (plus `too-new` for `vite` and `@vitejs/plugin-react`, which are genuinely recent major-version releases, not suspicious ones). `unknown-downloads` here reflects a **sandbox network-policy block** on `api.npmjs.org` (the proxy returned `403 connect_rejected`), not an actual low-download signal — the registry lookup itself (`npm view`) succeeded for every package and returned a `repository.url` pointing to the known, canonical GitHub org for each project.

| Package | Registry | Repo (from registry metadata) | Verdict (tool) | Disposition |
|---------|----------|-------------------------------|----------------|-------------|
| `socket.io` | npm | github.com/socketio/socket.io `[VERIFIED: npm registry]` | SUS (unknown-downloads only) | **Approved** — canonical maintainer org, no postinstall script, matches project's locked stack |
| `socket.io-client` | npm | github.com/socketio/socket.io | SUS (unknown-downloads only) | **Approved** — same package family as above |
| `nanoid` | npm | github.com/ai/nanoid | SUS (unknown-downloads only) | **Approved** — canonical maintainer (Andrey Sitnik), no postinstall script |
| `qrcode` | npm | github.com/soldair/node-qrcode | SUS (unknown-downloads only) | **Approved** — canonical maintainer, no postinstall script |
| `express` | npm | github.com/expressjs/express | SUS (unknown-downloads only) | **Approved** — canonical maintainer org |
| `react` / `react-dom` | npm | github.com/react/react (current registry field; maintainer emails confirmed `fb`/`react-core@meta.com`) | SUS (unknown-downloads only) | **Approved** — maintainer identity confirms Meta ownership despite the repo having moved orgs |
| `vite` / `@vitejs/plugin-react` | npm | github.com/vitejs/vite, github.com/vitejs/vite-plugin-react | SUS (too-new + unknown-downloads) | **Approved** — recent major-version publish dates are expected (Vite 8 shipped in 2026 per CLAUDE.md's own research); no postinstall scripts |

**Packages removed due to `[SLOP]` verdict:** none.
**Packages flagged as suspicious `[SUS]`:** all of the above, but solely due to the sandboxed download-count check being network-blocked, not any actual suspicion signal (no unknown package name, no missing repo, no postinstall script, no deprecation flag). **No `checkpoint:human-verify` gate is recommended for these installs** — they are the exact packages CLAUDE.md's own already-vetted Recommended Stack names, cross-checked here against the live registry a second time. If the planner or executor wants an extra download-count confirmation, that can be done from a machine without the proxy restriction (e.g., `npmjs.com/package/<name>` in a browser) as a zero-cost sanity check, not a blocking gate.

## Architecture Patterns

### System Architecture Diagram

```
 Player's phone (WhatsApp link tap, or manual code entry)
        │
        ▼
 ┌───────────────────────────┐
 │  React SPA (client)       │  reads ?room= / /join/:code from URL
 │  - Join screen            │  reads token from localStorage on load
 │  - Lobby screen (roster)  │
 └──────────┬────────────────┘
            │ Socket.IO connect, auth: { token? }
            ▼
 ┌───────────────────────────────────────────────────────────┐
 │  Node process (Express + Socket.IO, single instance)      │
 │                                                             │
 │  Connection layer (io.use middleware)                      │
 │   - no token  → issue new opaque token, create Player      │
 │   - has token → resolve token → existing Player record      │
 │        │                                                    │
 │        ▼                                                    │
 │  Room Manager: Map<roomCode, Room>                          │
 │   - create room (host action) → generate 4-digit code,     │
 │     retry on collision against this Map's keys              │
 │   - find room by code (join action)                         │
 │        │                                                    │
 │        ▼                                                    │
 │  Room instance                                               │
 │   - players: Map<playerId, Player>  (name, connected, score)│
 │   - name de-dup: normalize (trim/case-fold) → auto-suffix    │
 │     " 2", " 3"... on collision (D-07)                        │
 │   - host: playerId (server-side flag, never client-claimed) │
 │        │  on every join/leave/reconnect/rename               │
 │        ▼                                                    │
 │  Broadcast: io.to(roomCode).emit("state", fullSnapshot)      │
 └──────────┬────────────────────────────────────────────────┘
            │ full LOBBY snapshot (roster, code, readyCount)
            ▼
 All connected clients in the room re-render from scratch
            │
            │ (disconnect: phone lock / refresh / network blip)
            ▼
 Client: on 'connect' (incl. auto-reconnect) → always emit
 explicit rejoin(token); on visibilitychange→visible and on
 pageshow → force a request-resync regardless of socket.recovered
            │
            ▼
 Server resolves token → same Player → flips connected:true →
 sends that socket a private full-state snapshot (LOBBY-only in
 this phase) → player lands exactly where the room currently is
```

### Recommended Project Structure

```
server/
├── src/
│   ├── index.ts                # HTTP + Socket.IO bootstrap, serves client build
│   ├── rooms/
│   │   ├── RoomManager.ts      # Map<roomCode, Room>; create/find; 4-digit code gen + collision retry
│   │   └── Room.ts             # players map, host flag, name de-dup, broadcastState()
│   ├── players/
│   │   └── Player.ts           # { id, token, name, connected, score, isHost }
│   ├── names/
│   │   └── nameValidation.ts   # Intl.Segmenter grapheme count/truncate, normalize+dedupe
│   ├── socket/
│   │   ├── authMiddleware.ts   # io.use(): resolve token -> Player, issue new token if absent
│   │   └── handlers.ts         # join, rename, request-resync event listeners
│   └── config.ts               # ROOM_CAPACITY=20, MIN_PLAYERS_TO_START=3, grace-delay constants
├── public/                      # built client assets served statically (from client/dist)
└── package.json

client/
├── src/
│   ├── socket/
│   │   ├── connection.ts       # socket.io-client setup, auth token from localStorage, tuned reconnection opts
│   │   └── resync.ts           # visibilitychange/pageshow listeners -> request-resync
│   ├── screens/
│   │   ├── Join.tsx            # reads room code from URL or manual input; name entry
│   │   └── Lobby.tsx           # roster, ready count, room code + QR display, rename control
│   ├── state/
│   │   └── sessionStore.ts     # localStorage read/write for { token }, roomStore for last-received snapshot
│   └── App.tsx
└── package.json
```

### Pattern 1: Session Token Decoupled from Transport Connection (this phase's core pattern)

**What:** Player identity is an opaque, server-issued token, never `socket.id`. `[CITED: .planning/research/ARCHITECTURE.md, Pattern 3 — already established project research]`

**When to use:** Any reconnect this phase must handle: phone lock, refresh, brief WiFi blip.

**Concrete token format recommendation:** `crypto.randomUUID()` (Node built-in, no extra dependency) for both the session token and the internal `playerId`. `[ASSUMED — reasoned choice: UUIDv4 has no ordering/enumeration risk and needs no library; nanoid's default alphabet would also work but adds no benefit over a zero-dependency built-in for an internal, non-typed-by-humans token]`

**Example:**
```typescript
// server/src/socket/authMiddleware.ts
import { randomUUID } from "node:crypto";

io.use((socket, next) => {
  const token = socket.handshake.auth?.token as string | undefined;
  const existing = token ? tokenToPlayer.get(token) : undefined;

  if (existing) {
    socket.data.playerId = existing.id;
    socket.data.token = token;
  } else {
    const newToken = randomUUID();
    socket.data.token = newToken;
    socket.data.isNewSession = true; // handler will create the Player + emit `session`
  }
  next();
});
```
`[CITED: socket.io official Middlewares docs — io.use(), socket.handshake.auth pattern]`

### Pattern 2: Thin Client, Fat Server Broadcast (LOBBY-scoped for this phase)

**What:** Every join/leave/rename/reconnect triggers one full `state` broadcast of the LOBBY snapshot to the room; the client replaces its view wholesale. `[CITED: .planning/research/ARCHITECTURE.md, Pattern 2]`

**Phase 1-specific payload shape:**
```typescript
type LobbyState = {
  phase: "LOBBY";
  roomCode: string;
  players: Array<{ id: string; name: string; connected: boolean; isHost: boolean }>;
  readyCount: number;   // count of connected players
  capacity: 20;
  canStart: boolean;    // players.length >= 3 (D-11), computed server-side
};
```

### Pattern 3: Reconnect-Triggering Events on Mobile (new for this phase — not fully covered by existing project research)

**What:** iOS Safari does not reliably fire a clean `close` event when a backgrounded tab's WebSocket dies — sometimes it just hangs silently. `[CITED: GitHub socketio/socket.io#2924 — "Safari dropping web socket connection due to inactivity when page not in focus"; Apple Developer Forums thread 696310, "WebSocket issue in IOS 15 Safari Browser"]` The only reliable client-side signal that a resync might be needed is **document/page lifecycle events firing on foreground-return**, not the socket's own event.

**Required client-side triggers, all converging on the same `requestResync()` call:**
1. `document.addEventListener('visibilitychange', ...)` — when `document.visibilityState === 'visible'`.
2. `window.addEventListener('pageshow', (e) => { if (e.persisted) requestResync(); })` — catches bfcache restores, where the page is revived without re-running module-init code. `[CITED: web.dev "Back/forward cache" article — pageshow with event.persisted signals a bfcache restore]`
3. The socket's own `'connect'` event (fires on both the very first connection and every automatic reconnect) — always emit an explicit `rejoin(token)` here, **regardless of `socket.recovered`**, because Connection State Recovery does not survive a genuine network-interface change (WiFi→LTE) — `socket.recovered` can come back `false` in that case even though the same underlying session is resumable via the token. `[CITED: .planning/research/STACK.md — Connection State Recovery caveat, cross-referenced against GitHub socketio/socket.io Discussion #5248, "ConnectionStateRecovery not working when switching from wifi to 4g"]`

**Anti-pattern to avoid:** relying on `pagehide`/`freeze` to proactively close the socket before backgrounding. `[CITED: web.dev bfcache guide — "close connections... during the pagehide or freeze event"]` is a *general* bfcache best practice, but on iOS Safari specifically, `pagehide` is not reliably fired when the browser *app* (not just the tab) is closed or the OS reclaims memory `[CITED: search-result synthesis of iOS Safari bfcache/pagehide behavior]` — treat it as a nice-to-have cleanup, never as the mechanism the reconnect flow depends on. The dependable mechanism is always the *foreground-return* triggers above, not a backgrounding-time cleanup.

### Anti-Patterns to Avoid
- **Using `socket.id` as `playerId`:** regenerated on every reconnect; a locked-then-unlocked phone would silently become a "new" duplicate player. `[CITED: .planning/research/ARCHITECTURE.md, Anti-Pattern 3]`
- **Trusting `socket.recovered === true` as sufficient for correctness:** it is a nice-to-have optimization (skips a full resync round-trip when it works), never the only reconnect path — always send `rejoin(token)` explicitly regardless.
- **Client self-declaring host status:** the host flag must live only on the server's `Room` object, tied to a `playerId`, never inferred from a client-sent flag. `[CITED: .planning/research/PITFALLS.md, Security Mistakes table]`
- **Enforcing name uniqueness/length only client-side:** the server is the only trustworthy enforcement point; the client's own check is UX-only (immediate feedback while typing).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Reconnection with backoff | A custom retry/backoff loop over raw WebSocket | Socket.IO's built-in `reconnection`/`reconnectionDelay`/`reconnectionDelayMax` client options | Already implements exponential backoff with randomization; reinventing this is exactly the kind of "invisible until game night" risk this project can't afford `[CITED: .planning/research/STACK.md]` |
| Counting "characters" in a name for the 12-15 length limit | Manual UTF-16 `string.length` checks or naive code-point iteration | `Intl.Segmenter(locale, { granularity: 'grapheme' })` | `string.length` and even `[...str]` code-point iteration both split multi-codepoint emoji (ZWJ sequences, skin-tone modifiers) into multiple units, truncating a name mid-emoji; `Intl.Segmenter` returns exactly the user-perceived characters `[VERIFIED: ran directly in this project's Node 22.22.2 — see Code Examples]` |
| QR code rendering | A hand-rolled QR matrix encoder | `qrcode` npm package | QR encoding (Reed-Solomon error correction, module placement) is a solved, non-trivial algorithm; no reason to reimplement it for a one-week build |
| Room-code collision avoidance | Assuming any random generator "probably" avoids collisions at this ID-space size | Explicit collision-check against the live `Map<roomCode, Room>` before accepting a generated code | A 4-digit space is only 10,000 values — with even a handful of rooms active during dev/testing (or a marathon multi-day rehearsal), a naive "just generate and hope" approach can visibly collide; the fix is a five-line retry loop, not a library |

**Key insight:** Every one of this phase's "hard parts" (reconnection, RTL-aware name length, QR encoding) already has a standard, well-tested solution. The actual custom code this phase needs to write is glue — the Room Manager, the token↔player resolution, and the name de-duplication policy — not infrastructure.

## Common Pitfalls

### Pitfall 1: Implementing LOBBY-04 ("duplicate names prevented") literally, per stale ROADMAP.md wording

**What goes wrong:** A planner or executor reads ROADMAP.md's Phase 1 success criterion 2 ("duplicate display names are rejected") and builds a rejection flow (error message, retype prompt) instead of CONTEXT.md's D-07 auto-numbering.

**Why it happens:** ROADMAP.md predates the `/gsd-discuss-phase` session that produced CONTEXT.md; the roadmap's wording was never updated after the decision was made.

**How to avoid:** CONTEXT.md is the newer, user-approved, authoritative source. Implement: on join (and on lobby rename, D-09), normalize the candidate name (trim, collapse internal whitespace), compare case-insensitively against currently-active names in the room, and if a collision exists, append " 2", " 3", etc. (first available suffix) — never reject and never block the join. Requirement LOBBY-04 is satisfied by the *distinguishability* outcome (no two players displayed identically), not by rejection as a mechanism.

**Warning signs:** Any join-flow code path that returns an error/toast for "name already taken" instead of silently suffixing it.

### Pitfall 2: Grace-delay values invented without a basis, then re-invented differently in two places

**What goes wrong:** D-13 (roster fade) and D-16 (host transfer) both need a "short grace delay," and without a shared constant, two different developers (or the same developer on two different days) pick two different, uncoordinated numbers — leading to a player fading from the roster before the same disconnect would have triggered a host-transfer countdown, which reads as inconsistent to a live audience.

**How to avoid:** Derive both from the same underlying "how long until the server itself considers this socket definitively dead" number, then layer UI-specific grace on top. See the concrete recommendation in Code Examples/config below. `[ASSUMED — see Assumptions Log]`

### Pitfall 3: Testing reconnect only with a foregrounded browser tab, never a real locked phone

**What goes wrong:** All four of the project's own research files (ARCHITECTURE, STACK, PITFALLS, SUMMARY) independently flag this: a `disconnect`/`connect` pair fired by manually toggling devtools' network throttle, or even a background *tab* on desktop Chrome, does not reproduce iOS Safari's actual behavior when the *screen locks* (not just backgrounds). `[CITED: .planning/research/PITFALLS.md, Pitfall 1 and "Looks Done But Isn't" checklist]`

**How to avoid:** ROADMAP.md's own Phase 1 success criterion 4 already requires this be "verified on a real phone, not just a browser tab" — treat that as literal and non-negotiable for this phase's exit criteria, not just for the later Phase 9 rehearsal.

### Pitfall 4: Name-length limit implemented as `str.length <= 15`

**What goes wrong:** Given D-08 explicitly allows emoji, a name like `"מסיבה🎉🎊🥳"` can have a `str.length` far exceeding 15 (each emoji can be 2+ UTF-16 code units, and some are multi-codepoint ZWJ sequences) while having far fewer than 15 user-perceived characters — or the reverse: truncating at UTF-16 index 15 can slice a multi-codepoint emoji in half, producing a broken/replacement-character glyph in the roster.

**How to avoid:** Use `Intl.Segmenter` grapheme-cluster counting/truncation on both client (UX) and server (enforcement) — see Code Examples.

### Pitfall 5: Trusting `connectionStateRecovery` alone for the WiFi→LTE case

**What goes wrong:** A developer enables `connectionStateRecovery` on the server, sees it work in local testing (same network throughout), and assumes reconnection is "solved." At the actual party, a player walking to another room's WiFi dead zone triggers a genuine network-interface change, where the new connection can arrive before the old one has timed out server-side — `socket.recovered` comes back `false`, and if the client's only reconnect logic was "if recovered, do nothing," the player is left in limbo.

**How to avoid:** Always emit an explicit `rejoin(token)` intent on every `connect` event (first connect and every reconnect alike) and always request a fresh full snapshot — treat `connectionStateRecovery` purely as a latency optimization (it can make a `recovered` reconnect need less round-trip data), never as the reconnect mechanism itself. `[CITED: .planning/research/STACK.md — explicit WiFi→LTE caveat, cross-referenced against GitHub Discussion #5248]`

## Code Examples

### Room code generation with collision retry (LOBBY-01, D-01)

```typescript
// server/src/rooms/RoomManager.ts
import { customAlphabet } from "nanoid";

const generateCandidate = customAlphabet("0123456789", 4);

export class RoomManager {
  private rooms = new Map<string, Room>();

  createRoom(): Room {
    let code: string;
    let attempts = 0;
    do {
      code = generateCandidate();
      attempts++;
      if (attempts > 50) {
        throw new Error("Room code space exhausted — should never happen at this scale");
      }
    } while (this.rooms.has(code));

    const room = new Room(code);
    this.rooms.set(code, room);
    return room;
  }
}
```
`[VERIFIED: nanoid docs confirm customAlphabet('0123456789', 4) syntax; the collision-retry loop itself is this session's own reasoning, applying the ARCHITECTURE.md Room Manager pattern to D-01's 4-digit constraint]`

### Grapheme-aware name validation (D-08) — verified in this project's Node runtime

```typescript
// server/src/names/nameValidation.ts
const MAX_NAME_GRAPHEMES = 15;
const segmenter = new Intl.Segmenter("he", { granularity: "grapheme" });

export function graphemeLength(name: string): number {
  return [...segmenter.segment(name)].length;
}

export function truncateToGraphemes(name: string, max: number): string {
  const graphemes = [...segmenter.segment(name)].map((s) => s.segment);
  return graphemes.slice(0, max).join("");
}
```
Verified directly in this session against Node 22.22.2 (this project's exact runtime):
```
$ node -e "const seg = new Intl.Segmenter('he', {granularity:'grapheme'}); \
  console.log([...seg.segment('דור🎉 2')].map(s=>s.segment));"
[ 'ד', 'ו', 'ר', '🎉', ' ', '2' ]
```
`[VERIFIED: server/src/names/nameValidation.ts pattern — ran directly in this session's Node 22.22.2, matching this project's pinned runtime; output quoted verbatim above]`

### Name de-duplication with auto-suffix (D-07)

```typescript
// server/src/rooms/Room.ts (excerpt)
function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("he");
}

export class Room {
  private players = new Map<string, Player>();

  resolveDisplayName(candidate: string): string {
    const base = candidate.trim().replace(/\s+/g, " ");
    const taken = new Set(
      [...this.players.values()].map((p) => normalizeName(p.name))
    );
    if (!taken.has(normalizeName(base))) return base;

    let n = 2;
    while (taken.has(normalizeName(`${base} ${n}`))) n++;
    return `${base} ${n}`;
  }
}
```
`[ASSUMED — this exact normalization strategy (trim/collapse-whitespace/locale-lowercase) is this session's reasoning applied to D-07's plain-English example ("Dor" → "Dor 2"); no external source specifies Hebrew case-folding behavior for this exact scenario, and Hebrew itself has no case distinction, so the `toLocaleLowerCase("he")` call chiefly protects against a Latin-script or mixed name being duplicated with different casing]`

### QR + deep join link (LOBBY-02, D-02/D-03)

```typescript
// server generates, on room creation:
const joinUrl = `${PUBLIC_BASE_URL}/join/${room.code}`; // e.g. https://tamir-party.onrender.com/join/4827
const qrDataUrl = await QRCode.toDataURL(joinUrl);
// both the WhatsApp-pasted link and the QR resolve to the identical URL/route (D-02/D-03 parity)
```
Client route `/join/:code` pre-fills the code from the URL param and skips straight to name entry; the manual-entry fallback (D-04) is a separate `/join` route with a bare 4-digit input that the same screen component renders when no `:code` param is present.
`[CITED: qrcode npm package README — QRCode.toDataURL(text) returns a Promise<string> resolving to a base64 PNG data URL]`

### Reconnect-triggering client wiring (Pattern 3 above)

```typescript
// client/src/socket/resync.ts
function requestResync() {
  socket.emit("request-resync");
}

socket.on("connect", () => {
  const token = localStorage.getItem("tamir-meme:session");
  socket.emit("rejoin", { token }); // always, regardless of socket.recovered
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") requestResync();
});

window.addEventListener("pageshow", (e) => {
  if (e.persisted) requestResync();
});
```
`[CITED: MDN Page Visibility API, MDN Window: pageshow event, web.dev bfcache guide — combined into this session's reconnect wiring]`

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Manual `[...str].length` or `str.length` for "character count" with emoji | `Intl.Segmenter(locale, {granularity:'grapheme'})` | Baseline widely available since ~April 2024 `[CITED: web-platform-dx feature explorer]`; supported in Safari 14.1+/iOS Safari 14.5+ since April 2021 | No polyfill needed for any phone this project targets; removes an entire class of emoji-truncation bugs |
| Socket.IO reconnect relying only on default heartbeat timing (~25s ping / ~20s pingTimeout) | Explicitly tuned, shorter `pingInterval`/`pingTimeout` for small rooms | Ongoing recommendation, not a version change | At 10-20 players, the bandwidth cost of more frequent pings is negligible; the win is detecting a truly-dead connection in seconds rather than tens of seconds `[CITED: .planning/research/PITFALLS.md, Pitfall 1]` |

**Deprecated/outdated:** STACK.md/CLAUDE.md's cited `nanoid@5.x` — current published version is `6.0.1` `[VERIFIED: npm registry, checked this session]`; the `customAlphabet` API used in this phase is unchanged between the two majors, so no code-pattern impact, just an updated version pin.

## Runtime State Inventory

Not applicable — this is a greenfield phase (no rename/refactor/migration). No existing runtime state, stored data, or OS-registered state exists to inventory: the repository currently contains only GSD tooling and planning documents, confirmed by direct directory listing this session `[VERIFIED: ls -la /home/user/makeitmemeTamir, checked this session — only .claude/, .git/, .planning/, .gitignore present, no application source]`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | `localStorage` (not `sessionStorage`) should hold the session token because of the WhatsApp in-app-browser hand-off scenario | Alternatives Considered | Low — `localStorage` is the conservative choice either way (ARCHITECTURE.md already independently recommends it for other reasons); wrong only in the sense that the specific WhatsApp-webview justification is reasoned, not tested |
| A2 | Session token format: `crypto.randomUUID()`, no expiry within a single event's lifetime | Pattern 1 | Low — any sufficiently random opaque string works; the real risk is forgetting to persist it, not the exact format |
| A3 | Grace-delay lengths: recommend `pingInterval: 10000ms` / `pingTimeout: 8000ms` (≈18s worst-case dead-socket detection), roster-fade grace of ~25-30s after a detected disconnect, and host-transfer grace of ~60s after a detected disconnect | Common Pitfalls #2, Code Examples | **Medium** — these are reasoned from Socket.IO's own timing model, not sourced from a tested bachelor-party-specific benchmark. If too short: a normal phone-lock-and-unlock could visibly fade a player from the roster or trigger an unwanted host transfer. If too long: a genuinely departed player lingers awkwardly in the roster, or the game briefly has no effective host. **Recommend confirming these numbers empirically during this phase's own real-phone test** (lock the phone for realistic durations — 10s, 30s, 60s — and observe what the tuned ping settings actually produce), rather than shipping them untested |
| A4 | Room disposal: no active-lifecycle disposal is needed within Phase 1 itself (a room simply persists as long as the process runs); a background sweep removing rooms with zero connected players for 3+ hours is a defensive-only safety net, not a Phase 1 feature requirement | Standard Stack / Architecture | Low — Phase 1's scope explicitly excludes host controls and full game lifecycle; the "how a room ends" question belongs to Phase 6 (host controls) per ROADMAP.md, this phase only needs the room to *exist and persist* correctly |
| A5 | Room-code collision retry cap of 50 attempts before throwing | Code Examples | Very low — at a 20-room-cap scale (D-05's player cap, not room cap, but rooms are similarly few) 50 retries against a 10,000-value space is astronomically unlikely to be exhausted; purely a defensive bound |

**If this table is empty:** N/A — see entries above; all are flagged for planner/user awareness, none block planning.

## Open Questions

1. **Exact numeric grace-delay values (A3 above)**
   - What we know: Socket.IO's own ping/pong timing model bounds how fast a dead connection *can* be detected; PITFALLS.md independently recommends shortening the defaults for a room this size.
   - What's unclear: No source states a "correct" grace-delay length for a specific "does this read as a bug at a live party" threshold — this is inherently a UX judgment call, not a technical fact.
   - Recommendation: Ship the A3 numbers as a starting point, but treat this phase's real-phone verification step as the actual source of truth — adjust the constants based on what a real lock/unlock cycle produces, before locking them in as final.

2. **Should the manual room-code fallback (D-04) validate code format client-side before submitting?**
   - What we know: The code is always exactly 4 digits (D-01).
   - What's unclear: Whether a non-numeric or wrong-length input should be blocked at the input level (e.g., `inputMode="numeric"` + `maxLength={4}`) or allowed and rejected server-side with a Hebrew error message.
   - Recommendation: Do both — `inputMode="numeric"` on the input for the correct mobile keyboard (this also serves LOBBY-02/D-04's "digits open the numeric keypad" rationale), plus a server-side "room not found" Hebrew message as the authoritative fallback, since the client-side restriction alone can't be trusted per the general enforcement-tier principle in this document.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|--------------|-----------|---------|----------|
| Node.js | Server runtime, Vite build | ✓ `[VERIFIED: node --version, checked this session]` | 22.22.2 | — |
| npm | Package installs | ✓ `[VERIFIED: npm --version, checked this session]` | 10.9.7 | — |
| npm registry access | Package version verification | ✓ `[VERIFIED: npm view succeeded for all packages this session]` | — | — |
| `api.npmjs.org` (download-count API) | Package legitimacy download-count signal | ✗ `[VERIFIED: curl returned 403 connect_rejected via sandbox egress proxy]` | — | Registry existence + maintainer/repo identity check via `npm view` (used in this research); re-run the download-count check from an unrestricted machine if extra confidence is wanted — not blocking |
| Context7 MCP tool | Docs-provider fetch for socket.io/nanoid/qrcode | ✗ (tool not present in this environment) | — | Fell back to built-in `WebSearch`, which successfully surfaced official Socket.IO/nanoid/qrcode docs pages (see Sources) |
| Real iOS/Android phones | Verifying D-13/D-16 grace-delay values, LIVE-02's phone-lock requirement | Not available in this research session (research is desk/registry-based) | — | This phase's own execution/verification step must include the real-phone check — see ROADMAP.md success criterion 4, already required |

**Missing dependencies with no fallback:** none — every gap above has a documented fallback already exercised in this research.

**Missing dependencies with fallback:** `api.npmjs.org` download-count signal (fallback: registry+repo-identity check, already performed); Context7 (fallback: WebSearch, already performed); real phones (fallback: this phase's own required real-phone verification step, not a research-time gap).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.0 `[VERIFIED: npm registry, checked this session]` — one framework for both client and server, given both are Vite-based projects |
| Config file | none yet — see Wave 0 gaps below (greenfield repo) |
| Quick run command | `npm run test -- --run <file>` (server) / `npm run test -- --run <file>` (client), scoped to a single test file for the sub-30s target |
| Full suite command | `npm run test -- --run` (per package) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-----------------------|-------------|
| LOBBY-01 | Host creates a room, receives a 4-digit code | unit | `vitest run server/test/roomManager.test.ts` | ❌ Wave 0 |
| LOBBY-01 | Room code collision is retried, never duplicated while active | unit | `vitest run server/test/roomManager.test.ts -t "collision"` | ❌ Wave 0 |
| LOBBY-02 | QR data URL decodes back to the correct join URL | unit | `vitest run server/test/qrJoinUrl.test.ts` (use a QR-decode library or simply assert the encoded string equals the expected URL, since `qrcode` itself is trusted per Don't Hand-Roll) | ❌ Wave 0 |
| LOBBY-03 | Player joins with code + name, no signup fields required | integration (real `socket.io-client` against a real in-process server) | `vitest run server/test/join.integration.test.ts` | ❌ Wave 0 |
| LOBBY-04 / D-07 | Duplicate name auto-suffixes ("Dor" → "Dor 2"), never rejects | unit | `vitest run server/test/nameDedup.test.ts` | ❌ Wave 0 |
| D-08 | Name >15 graphemes (incl. multi-codepoint emoji) truncated correctly, not mid-emoji | unit | `vitest run server/test/nameValidation.test.ts` | ❌ Wave 0 |
| D-09 | Lobby rename re-runs de-dup; locks once game starts (state flag only — game-start itself is Phase 2) | unit | `vitest run server/test/rename.test.ts` | ❌ Wave 0 |
| D-05 | 21st player sees capacity-exceeded message, not a broken join | integration | `vitest run server/test/capacity.integration.test.ts` | ❌ Wave 0 |
| D-11 | `canStart` becomes true only at ≥3 players | unit | `vitest run server/test/canStart.test.ts` | ❌ Wave 0 |
| LOBBY-05 | Every join/leave broadcasts a full roster snapshot to all connected sockets in the room | integration (2+ real `socket.io-client` instances against one in-process server) | `vitest run server/test/roster.integration.test.ts` | ❌ Wave 0 |
| LIVE-02 | Reconnect with same token restores same player (name, connected:true) without creating a duplicate | integration (connect, disconnect, reconnect same token, assert single player record) | `vitest run server/test/reconnect.integration.test.ts` | ❌ Wave 0 |
| LIVE-02 | Reconnect with an unknown/expired token issues a fresh session rather than crashing | integration | `vitest run server/test/reconnectUnknownToken.integration.test.ts` | ❌ Wave 0 |
| D-13 | Disconnected player still appears in roster until grace delay elapses, then fades | integration (fake timers) | `vitest run server/test/rosterFade.integration.test.ts` | ❌ Wave 0 |
| D-16 | Host disconnect + grace delay elapsed → host flag transfers to another connected player | integration (fake timers) | `vitest run server/test/hostTransfer.integration.test.ts` | ❌ Wave 0 |
| LIVE-02 (phone-lock specifically) | Real device: lock phone 30-60s mid-lobby, unlock, confirm same name/position, no duplicate | manual-only | N/A — real phone required | manual, this phase's exit criterion |

**Automatable vs. manual-only split:** Everything above the last row is a server-side, Node-process-only behavior and is fully automatable with real `socket.io-client` instances driving a real in-process Socket.IO server (the standard pattern from Socket.IO's own testing docs `[CITED: socket.io.docs/v4/testing]`) — no mocking of the socket layer is needed or recommended. The one genuinely manual-only item is the actual phone-lock/unlock physical test, because no automated harness can reproduce iOS's OS-level tab suspension behavior — this matches ROADMAP.md's own success criterion 4 wording ("verified on a real phone, not just a browser tab").

### Sampling Rate
- **Per task commit:** run the single new/changed test file (`vitest run <file>`) — sub-30s.
- **Per wave merge:** run the full server test suite (`vitest run`, server package).
- **Phase gate:** full suite green, **plus** the manual real-phone lock/unlock check, before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `server/vitest.config.ts` — no test config exists yet (greenfield repo)
- [ ] `server/test/setup.ts` — shared helper to spin up an in-process HTTP+Socket.IO server on an ephemeral port and tear it down per test, plus a helper to create connected `socket.io-client` instances against it
- [ ] Framework install: `npm install -D vitest` (server package) — none installed yet
- [ ] `client/vitest.config.ts` — if any client-side logic (name-length pre-check, localStorage read/write) gets unit-tested in this phase; optional but recommended given D-08's emoji-truncation risk exists client-side too

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|----------------|---------|--------------------|
| V2 Authentication | Partial — no passwords/accounts (explicitly out of scope), but session-token issuance/validation is in-scope | Opaque, server-generated, non-guessable token (`crypto.randomUUID()`); never accept a client-supplied token value as valid without a server-side lookup match |
| V3 Session Management | Yes | Token→player mapping lives only server-side in memory; token is never logged; no session fixation risk since the server always issues the token, the client never sets one |
| V4 Access Control | Yes (host-only actions, though most host actions are Phase 6) | Host flag is a server-side property of the `Room` object, tied to `playerId`, never inferred from a client-sent field `[CITED: .planning/research/PITFALLS.md Security Mistakes table]` |
| V5 Input Validation | Yes | Display name: trim, length-cap via grapheme count (not raw length), reject/strip control characters; room code: exactly 4 digits, reject anything else with a clear error rather than a stack trace |
| V6 Cryptography | Minimal | `crypto.randomUUID()` (Node built-in, CSPRNG-backed) is sufficient for an opaque session token in this trust model — no signing/HMAC needed since the token is looked up server-side against an in-memory map, not decoded/trusted client-side (unlike a JWT) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|-----------------------|
| Room-code guessing/enumeration by an uninvited outsider | Spoofing | 4-digit numeric space is intentionally small per D-01 (a deliberate UX tradeoff, not a security control) — acceptable given PROJECT.md's stated threat model ("private room, everyone physically present, low stakes"); document this as an accepted risk, not a gap to fix `[CITED: .planning/research/PITFALLS.md Security Mistakes table — "low real risk here given it's one room for one night"]` |
| Client self-declaring `isHost: true` in a join payload | Elevation of Privilege | Server never reads a client-sent host flag; host status is assigned server-side (first joiner, or via D-16's transfer logic) and only ever *reported* to clients, never accepted from them |
| Name-field injection (script tags, control characters) in a free-text display name (D-06) | Tampering | React's default JSX text rendering already escapes HTML, so a stored XSS via display name is not exploitable through normal rendering paths — still worth stripping control/zero-width characters server-side before storage, since D-08's grapheme-based length logic could otherwise be gamed with invisible characters to smuggle a longer effective string past the visual cap |
| Reconnect token replay / theft (someone else obtains a player's token) | Spoofing | Out of scope to fully harden for a one-night private-room event per CLAUDE.md's explicit threat model ("Security mistakes... Acceptable here — private room, everyone physically present, low stakes"); no additional mitigation recommended beyond not logging tokens and not exposing them in URLs |
| Unbounded room creation / join spam | Denial of Service | A trivial per-socket rate limit on `create-room`/`join` is cheap insurance `[CITED: .planning/research/PITFALLS.md Security Mistakes table]`, but is not a hard requirement for Phase 1's exit criteria given the tiny, trusted-room scale — flag as a nice-to-have, not a blocker |

## Sources

### Primary (HIGH confidence)
- `.planning/research/ARCHITECTURE.md`, `STACK.md`, `PITFALLS.md`, `SUMMARY.md` — already-completed, cross-verified project research (source hierarchy treats these as canonical per CONTEXT.md's `<canonical_refs>`)
- npm registry, `npm view <pkg> version` — direct verification of every package version cited above (this session)
- Direct execution of `Intl.Segmenter` in this project's exact Node 22.22.2 runtime (this session)

### Secondary (MEDIUM confidence — official docs surfaced via WebSearch)
- [Socket.IO — Connection state recovery](https://socket.io/docs/v4/connection-state-recovery)
- [Socket.IO — Server options](https://socket.io/docs/v4/server-options/)
- [Socket.IO — Client options](https://socket.io/docs/v4/client-options/)
- [Socket.IO — Middlewares](https://socket.io/docs/v4/middlewares/)
- [Socket.IO — Testing](https://socket.io/docs/v4/testing/)
- [GitHub socketio/socket.io Discussion #5248 — ConnectionStateRecovery not working when switching from wifi to 4g](https://github.com/socketio/socket.io/discussions/5248)
- [GitHub socketio/socket.io#2924 — Safari dropping web socket connection due to inactivity when page not in focus](https://github.com/socketio/socket.io/issues/2924)
- [Apple Developer Forums thread 696310 — WebSocket issue in IOS 15 Safari Browser](https://developer.apple.com/forums/thread/696310)
- [web.dev — Back/forward cache](https://web.dev/articles/bfcache)
- [web-platform-dx feature explorer — Intl.Segmenter](https://web-platform-dx.github.io/web-features-explorer/features/intl-segmenter/)
- [nanoid GitHub — customAlphabet](https://github.com/ai/nanoid)
- [qrcode (node-qrcode) GitHub / npm](https://www.npmjs.com/package/qrcode)

### Tertiary (LOW confidence — flagged for confirmation)
- A1 (localStorage vs sessionStorage for WhatsApp in-app-browser scenario) — reasoned, not directly sourced
- A3 (grace-delay numeric values) — reasoned from Socket.IO's own timing model, not a tested benchmark

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every version verified directly against the live npm registry this session
- Architecture: HIGH — this phase's patterns are a direct, narrow application of already-established, cross-verified project research (ARCHITECTURE.md), extended only where genuinely new (reconnect-trigger events, grapheme-aware naming)
- Pitfalls: MEDIUM-HIGH — cross-verified against official Socket.IO docs and GitHub issue trackers this session; the two numeric grace-delay recommendations are explicitly flagged LOW/`[ASSUMED]`

**Research date:** 2026-09-05
**Valid until:** 2026-10-05 (30 days — stable domain; re-check npm versions if planning is delayed past this window, though this project's one-week timeline makes that unlikely)
