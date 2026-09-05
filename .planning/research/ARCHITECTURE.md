# Architecture Research

**Domain:** Real-time multiplayer browser party game (single room, ~10-15 phones, Hebrew RTL, one-week build)
**Researched:** 2026-09-05
**Confidence:** MEDIUM (patterns are well-established; iOS Safari and RTL canvas specifics were cross-checked against multiple sources)

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                       CLIENT (phone browser)                         │
├──────────────────────────────────────────────────────────────────────┤
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐      │
│  │ Join/Lobby │  │ Caption UI │  │ Vote UI     │  │ Results/    │      │
│  │  screen    │  │ (photo +   │  │ (captions   │  │ Scoreboard  │      │
│  │            │  │  textbox)  │  │  list)      │  │ / Best-of   │      │
│  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘      │
│        └───────────────┴───────────────┴───────────────┘             │
│                          │  render from server state                 │
│                 ┌────────┴─────────┐                                 │
│                 │  Socket client   │  session token in localStorage  │
│                 │  (thin, dumb)    │                                 │
│                 └────────┬─────────┘                                 │
└──────────────────────────┼────────────────────────────────────────────┘
                            │ WebSocket (Socket.IO), events only
┌───────────────────────────┼────────────────────────────────────────────┐
│                            ▼            SERVER (Node.js, single proc)  │
│                 ┌────────────────────┐                                │
│                 │  Connection layer   │  auth handshake → resolve      │
│                 │  (Socket.IO server) │  session token → player id     │
│                 └─────────┬──────────┘                                │
│                            │                                          │
│                 ┌─────────┴──────────┐                                │
│                 │   Room Manager      │  room code → Room instance     │
│                 └─────────┬──────────┘                                │
│                            │                                          │
│                 ┌─────────┴──────────┐   drives via                   │
│                 │  Room State Machine │◄──setTimeout/interval          │
│                 │  (per-room FSM)     │   (server-authoritative clock) │
│                 └─────────┬──────────┘                                │
│                            │ reads/writes                             │
│         ┌──────────────────┼──────────────────┐                       │
│         ▼                  ▼                  ▼                       │
│  ┌─────────────┐   ┌──────────────┐   ┌──────────────┐               │
│  │ Players map │   │ Round state  │   │ Photo deck   │               │
│  │ (in-memory) │   │ (captions,   │   │ (shuffled,   │               │
│  │             │   │  votes,      │   │  no-repeat)  │               │
│  │             │   │  scores)     │   │              │               │
│  └─────────────┘   └──────────────┘   └──────────────┘               │
└──────────────────────────────────────────────────────────────────────┘
                            │
                            ▼
                 ┌────────────────────┐
                 │  Static photo       │  bundled in repo / build,
                 │  assets (build-time)│  served as static files
                 └────────────────────┘
```

Meme image compositing (photo + Hebrew caption baked in) happens **client-side on Canvas at download time**, not on the server — see the dedicated section below.

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|-------------------------|
| Room Manager | Create/lookup rooms by short code, hold the map of `roomCode → Room` | Plain in-memory `Map` in the Node process; no DB needed for a one-night, one-process game |
| Room State Machine | Single source of truth for game phase, round number, timers, and whose turn it is to be waited on | Hand-rolled FSM (switch/enum) or XState machine, one instance per room, driven by server timers |
| Connection layer | Authenticate socket connections, map session token → player, join socket to room's Socket.IO "room" channel | Socket.IO server with `auth` handshake payload |
| Players map (per room) | Player identity, display name, connection status (connected/disconnected), running score | In-memory object keyed by stable `playerId` (not socket id) |
| Round state (per room) | Current photo, submitted captions, submitted votes, per-round results | Reset/rebuilt each round; lives inside the Room instance |
| Photo deck | Ordered/shuffled list of available photos for this game, tracks which have been shown | Shuffle full photo list once at game start; pop from the front each round |
| Client socket layer | Send player intents (join, submit caption, submit vote, request-resync), receive state broadcasts | Thin wrapper; contains no game logic, only intent senders + a state reducer for rendering |
| UI screens | Pure render of whatever `phase` the current room-state broadcast says it's in | React/Svelte/vanilla — driven entirely by server-pushed state, no local phase logic |
| Meme compositor | Draw photo + Hebrew caption onto an offscreen canvas, produce a downloadable image | Runs in the client browser, only at the moment a user taps "download/share" |

## Recommended Project Structure

```
server/
├── src/
│   ├── index.ts              # HTTP + Socket.IO bootstrap
│   ├── rooms/
│   │   ├── RoomManager.ts    # create/find/destroy rooms, room code generation
│   │   ├── Room.ts           # holds players, round state, photo deck, wraps the FSM
│   │   └── roomStateMachine.ts  # phase enum + transition functions + timer scheduling
│   ├── players/
│   │   └── Player.ts         # player identity, session token, score, connection status
│   ├── photos/
│   │   └── photoDeck.ts      # shuffle + no-repeat draw logic over the static photo manifest
│   ├── socket/
│   │   ├── handlers.ts       # event listeners: join, submit-caption, submit-vote, resync
│   │   └── broadcast.ts      # serializes Room → client-safe state snapshot per phase
│   └── config.ts             # round timer durations, round count bounds
├── public/photos/            # bundled static Tamir photo assets, served directly
└── package.json

client/
├── src/
│   ├── socket/
│   │   ├── connection.ts     # connect/reconnect, session token persistence (localStorage)
│   │   └── events.ts         # typed intent senders + typed state-broadcast listener
│   ├── screens/
│   │   ├── Join.tsx
│   │   ├── Lobby.tsx
│   │   ├── CaptionPhase.tsx
│   │   ├── VotePhase.tsx
│   │   ├── RoundResults.tsx
│   │   ├── FinalResults.tsx
│   │   └── BestOf.tsx
│   ├── state/
│   │   └── gameStore.ts      # holds latest server-pushed snapshot; screens read from it
│   ├── meme/
│   │   └── compositeMeme.ts  # canvas draw: photo + Hebrew caption, RTL-aware
│   └── App.tsx                # single switch on `phase` → renders matching screen
└── package.json
```

### Structure Rationale

- **One state machine per room, server-side only:** the entire game's correctness depends on there being exactly one authority for "what phase are we in and whose turn is it to wait for." Splitting this logic between client and server is the single most common source of party-game bugs (two players seeing different phases, votes counted twice, timers drifting).
- **`socket/` is a thin transport shim on both sides:** keeping intent-sending and state-rendering separate from game logic means the FSM can be unit-tested with zero networking involved — critical when there's only a week and no time for flaky end-to-end debugging under time pressure.
- **`meme/compositeMeme.ts` lives entirely in the client:** it has no business being on the server (see boundary decision below), and isolating it means it can be built and tested independently, in parallel with the multiplayer plumbing.
- **`photos/` bundled as static files, not object storage:** for a fixed, pre-supplied photo set for one event, static bundled assets are simplest, free, and have zero upload/serving complexity risk in a one-week timeline.

## Architectural Patterns

### Pattern 1: Server-Authoritative Finite State Machine with Server-Driven Timers

**What:** The server owns one FSM per room with explicit phases: `LOBBY → CAPTION → VOTING → ROUND_RESULTS → (loop) → FINAL_RESULTS → BEST_OF`. Every phase transition happens on the server, either because (a) an event condition is satisfied (all players submitted) or (b) a server-side timer fires. Clients never decide phase; they only render whatever phase the server broadcasts and send intents.

**When to use:** Any game where fairness and consistency across simultaneous participants matters more than raw scale — exactly this project's shape.

**Trade-offs:** Slightly more server bookkeeping (must track per-player submission status) versus a naive "just trust the client's timer" approach. Massively pays off in reliability: a phone that locks, a slow 4G connection, or a background tab cannot desync the game, because the server's clock is the only clock that matters.

**Why server-side timers matter here specifically:** If each phone ran its own countdown and flipped to VOTING locally when it hit zero, phones would all flip at slightly different real times (clock drift, JS timer throttling when a tab is backgrounded, phone lock pausing JS execution entirely). The result: some players still see the caption box while others already see voting, submissions arrive after the "deadline" on other clients, and the room visibly desyncs in front of 15 people. A single `setTimeout` on the server, with the remaining-time value pushed to clients purely for display, avoids this class of bug entirely.

**Example:**
```typescript
type Phase = "LOBBY" | "CAPTION" | "VOTING" | "ROUND_RESULTS" | "FINAL_RESULTS" | "BEST_OF";

class Room {
  phase: Phase = "LOBBY";
  phaseDeadline: number | null = null; // epoch ms, server clock
  phaseTimer: NodeJS.Timeout | null = null;

  private scheduleTimeout(durationMs: number, onTimeout: () => void) {
    this.phaseDeadline = Date.now() + durationMs;
    if (this.phaseTimer) clearTimeout(this.phaseTimer);
    this.phaseTimer = setTimeout(onTimeout, durationMs);
  }

  startCaptionPhase() {
    this.phase = "CAPTION";
    this.roundState.captions.clear();
    this.scheduleTimeout(CAPTION_DURATION_MS, () => this.startVotingPhase());
    this.broadcastState();
  }

  submitCaption(playerId: string, text: string) {
    if (this.phase !== "CAPTION") return; // ignore late/out-of-phase submissions
    this.roundState.captions.set(playerId, text);
    if (this.allConnectedPlayersSubmitted("captions")) {
      this.startVotingPhase(); // early-advance, don't wait out the clock
    } else {
      this.broadcastState(); // update "N of M submitted" indicator only
    }
  }
}
```

### Pattern 2: Thin Client, Fat Server Broadcast (push full render-state, not deltas)

**What:** On every phase transition (and on any material sub-change like a vote count tick), the server pushes a complete, phase-appropriate state snapshot to the room. The client does not merge deltas or reconstruct state from a sequence of events — it replaces its local view wholesale with whatever it just received.

**When to use:** Small rooms (≤ 15 players), short game sessions, and specifically when reconnect-mid-game is a hard requirement — a full snapshot means a reconnecting client can render correctly with zero replay logic.

**Trade-offs:** More bytes over the wire than a delta protocol, but at this scale (a handful of players, small JSON payloads) that cost is irrelevant, and the reliability win is large: there is no "client missed an event and is now permanently desynced" failure mode.

**Example:**
```typescript
// server → client broadcast payload (see full shape in the protocol section below)
{
  "type": "state",
  "phase": "VOTING",
  "round": 3,
  "totalRounds": 8,
  "deadline": 1739999999000,          // epoch ms; client only uses this to render a countdown
  "photoUrl": "/photos/tamir-014.jpg",
  "captions": [                        // anonymized, shuffled, no author attached
    { "id": "cap_1", "text": "..." },
    { "id": "cap_2", "text": "..." }
  ],
  "hasVoted": false,                   // this-client-specific flag
  "players": [
    { "id": "p1", "name": "דנה", "connected": true, "score": 12 }
  ]
}
```

### Pattern 3: Session Token Decoupled from Transport Connection

**What:** Player identity is a random opaque token generated on first join, stored in the browser's `localStorage`, and sent in the Socket.IO `auth` payload on every connect attempt (initial and reconnect). The server never treats the underlying `socket.id` as identity — it resolves `token → playerId` on every handshake and re-attaches the new socket to the existing player record.

**When to use:** Any browser real-time app that must survive reload/backgrounding — which for a phone party game is not an edge case, it is the expected steady state (screens lock constantly).

**Trade-offs:** Requires a small amount of server-side bookkeeping (a `token → playerId` map, and a grace period before treating a disconnected player as gone) but this is the standard, low-risk way to solve the single most game-breaking failure mode in this project.

## Data Flow

### Request Flow (submit-caption example)

```
[Player types caption, taps submit]
    ↓
[Client] emit("submit-caption", { text }) over existing authenticated socket
    ↓
[Server: socket handler] resolve socket → playerId → Room
    ↓
[Room / FSM] validate: phase === CAPTION, player hasn't already submitted
    ↓
[Round state] store caption keyed by playerId
    ↓
[Room] check: have all *connected* players submitted?
    ├─ yes → advance phase early (cancel timer, go to VOTING)
    └─ no  → broadcast lightweight "submitted count" update only
    ↓
[Broadcast] io.to(roomCode).emit("state", snapshot)
    ↓
[All clients] replace local render-state wholesale, re-render current screen
```

### State Management

```
[Room FSM, server, source of truth]
    ↓ (full snapshot on every transition / material change)
[Socket.IO "state" event, broadcast to room channel]
    ↓
[Client gameStore — dumb holder of "last received snapshot"]
    ↓ (subscribe)
[Screen components] — pure function of `gameStore.phase` + `gameStore.<phase-specific fields>`
    ↑ (user action → intent)
[Client intent senders] → emit socket event → back to server
```

### Key Data Flows

1. **Join flow:** Client posts room code + display name (or reads token from localStorage on refresh) → server resolves or creates player → server adds to Room → server broadcasts updated LOBBY snapshot (player list) to everyone already in the room.
2. **Caption → Vote handoff:** Server anonymizes and shuffles submitted captions before broadcasting the VOTING snapshot — the shuffle must happen server-side (never trust the client to hide authorship) and the player's own caption must be excluded from what they can vote on.
3. **Reconnect flow:** Client reconnects with the same token → server finds existing player record marked `disconnected` → flips it to `connected` → immediately sends that client a full current-phase snapshot (not a diff) so it can render correctly regardless of how long it was away.
4. **Round-to-round loop:** ROUND_RESULTS phase has its own short server timer; when it fires, server checks `round < totalRounds` → either starts next round's CAPTION phase (drawing the next photo from the deck) or transitions to FINAL_RESULTS.

## Scaling Considerations

This project has a fixed, known ceiling (10-15 concurrent players, one room, one evening), so "scaling" here means "robustness under the single expected load," not growth.

| Scale | Architecture Adjustments |
|-------|---------------------------|
| 1 room, ≤15 players (this project) | Single Node process, in-memory state, no database, no Redis. This is not a shortcut — it is the correct architecture for this scale. |
| Multiple simultaneous rooms (future/bonus) | Still single process is fine up to dozens of rooms; Room Manager already partitions state per room code, so this requires no redesign, only more Room instances in the same Map. |
| Many processes / horizontal scale (out of scope) | Would require moving room state to Redis and using Socket.IO's Redis adapter for cross-instance broadcast — not needed for this project, do not build it. |

### Scaling Priorities

1. **First (and only) real risk at this scale: a dropped/backgrounded phone stalling the whole room.** Mitigated entirely by the disconnect-handling pattern below (grace period + auto-advance on timeout), not by infrastructure scaling.
2. **Not a concern for this project:** raw throughput, database load, CDN caching — 15 people in one WiFi-adjacent room generate negligible traffic. Do not spend build time here.

## Anti-Patterns

### Anti-Pattern 1: Client-Side Phase Timers as the Source of Truth

**What people do:** Each client runs its own `setTimeout`/countdown for the caption or voting phase and flips its local UI to the next screen when the countdown hits zero.

**Why it's wrong:** Background tabs and locked phones throttle or fully suspend JS timers (this is explicitly why phone locking is called out as a critical risk in this project). Clients drift out of sync with each other and with the server's notion of what phase it is, submissions arrive "late" relative to some clients but not others, and the game visibly breaks in front of the whole room.

**Do this instead:** Server owns the only real timer. Clients receive a `deadline` epoch timestamp purely for cosmetic countdown display (`deadline - Date.now()`), and the actual phase transition is a server-pushed event, never a client-computed one.

### Anti-Pattern 2: Compositing the Meme Image on the Server

**What people do:** Send the caption text to the server, use a server-side image library (e.g. `node-canvas`, `sharp`) to draw the caption onto the photo, then serve the resulting PNG for download.

**Why it's wrong:** For this project specifically it adds a native-dependency build risk (`node-canvas` requires system libraries like Cairo/Pango that are notoriously fragile to install on constrained/free hosting tiers) purely to solve a problem the browser already solves natively via `<canvas>`. It also adds server load and a file-serving/storage concern for zero benefit, since there's no need for the server to ever "know" the rendered pixels — only the winning caption text and a reference to the round's captions is needed for the Best-Of screen.

**Do this instead:** Composite entirely client-side with the 2D Canvas API at the moment of download, using `ctx.direction = "rtl"` for correct Hebrew rendering (see the dedicated section below). The server only ever stores/broadcasts caption text and photo references, never rendered images.

### Anti-Pattern 3: Using `socket.id` as Player Identity

**What people do:** Key the players map by the Socket.IO connection's `socket.id`.

**Why it's wrong:** Socket.IO issues a new `socket.id` on every reconnect, including the reconnect that happens after a phone screen lock and unlock. Using it as identity means every lock screen creates a new, duplicate "player" and the real player loses their score, name, and place in the round.

**Do this instead:** Generate an application-level session token client-side on first join, persist in `localStorage`, and send it in the Socket.IO `auth` payload on connect; the server maps `token → playerId` and treats the socket connection as disposable transport, not identity.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|----------------------|-------|
| Hosting (e.g. Render/Fly/Railway free tier) | Deploy a single Node process running both HTTP static file serving and Socket.IO | Verify the chosen host supports persistent WebSocket connections (some serverless/edge platforms do not) — this is worth confirming on day one, not day five |
| Photo assets | Bundled into the server's static file directory at build/deploy time | No object storage needed for a fixed, pre-supplied photo set; simplest and free |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|----------------|-------|
| Client ↔ Server | Socket.IO events over WebSocket, JSON payloads | All game-logic decisions happen server-side; client never computes phase or scores itself |
| Room FSM ↔ Players map | Direct in-process object access (same Node process, no network hop) | No need for a database; a room's entire lifetime is one process's memory for one evening |
| Client render layer ↔ Meme compositor | Local function call, browser Canvas API | No network involved; compositing only runs on the device that needs the downloaded image |
| Connection layer ↔ Room Manager | `auth.token` resolved to `playerId` before any room logic runs | Keeps reconnection logic in exactly one place instead of scattered across every event handler |

---

## Component Boundaries and Suggested Build Order

**Riskiest integration point — build this first:** the **join → reconnect → rejoin-a-room-in-progress** path. This is the single requirement most likely to embarrassingly fail live at the party (phones lock constantly, per the project's own stated context), and it is also the piece that touches every other component (Room Manager, Players map, socket auth, and state broadcast) at once, so getting its shape right early prevents rework everywhere else. Concretely: build the join flow, the session-token-in-localStorage mechanism, and a minimal Room that can put a reconnecting client back into LOBBY correctly — before writing a single line of caption or voting UI. Prove a phone can lock, unlock, and land back in the same room with the same name and score, using nothing but a token round-trip, before building anything else.

Recommended build order:

1. **Room + session/reconnect skeleton** (the de-risking step above): room code generation, join, session token issuance and persistence, reconnect resolving token → existing player, minimal LOBBY-only state broadcast. Verify on an actual phone: lock screen, unlock, confirm state survives.
2. **Server-authoritative FSM with server-driven timers**, still LOBBY/CAPTION/VOTING/RESULTS but with placeholder content (no real photos or scoring logic needed yet) — prove phase transitions are driven server-side and reconnecting mid-phase renders the correct current phase.
3. **Photo deck + no-repeat draw logic**, wired into the CAPTION phase so real photos start appearing per round.
4. **Caption submission → anonymized/shuffled voting → scoring**, completing the full round loop end to end with real gameplay data.
5. **Round loop, final results, best-of** — repeat-N-rounds logic, final winner screen, best-of screen pulling top-voted captions across the whole game.
6. **Client-side meme compositor** (Canvas draw of photo + Hebrew caption, RTL-correct) and the download/share flow — this can be built in parallel with steps 3-5 by a second work stream since it has no dependency on the multiplayer plumbing, only on having a photo + caption text pair to render.
7. **Disconnect/degradation handling refinement** (see below) — start simple in step 1 (mark disconnected, don't remove), then harden once the full round loop exists and there's a stalled-submission case to actually test against.

---

## Client/Server Message Protocol

**Principle: push full derived state, let the client be dumb.** The client should not need to compute round numbers, remaining players, or whose turn it is — it renders whatever the server says the phase is. This eliminates an entire class of "client and server disagree" bugs, which matters far more than the minor bandwidth cost at this scale.

### Events: Client → Server (intents only)

| Event | Payload | Server behavior |
|-------|---------|------------------|
| `join` | `{ roomCode, name, token? }` | Create or find player by token; if no token, issue a new one and return it; add to room; broadcast updated LOBBY state |
| `start-game` | `{ roundCount }` | Host-only; validates room is in LOBBY with ≥2 players; transitions to first CAPTION phase |
| `submit-caption` | `{ text }` | Valid only during CAPTION phase and only once per player; ignored if already submitted or phase mismatched |
| `submit-vote` | `{ captionId }` | Valid only during VOTING phase; rejects voting for own caption server-side (never trust client to self-exclude) |
| `request-resync` | `{}` | Client explicitly asks for a full state snapshot; used as a defensive fallback if a client suspects it missed a broadcast |

### Events: Server → Client (state broadcasts only)

| Event | Payload | Notes |
|-------|---------|-------|
| `state` | Full snapshot: `{ phase, round, totalRounds, deadline, photoUrl?, captions?, players, hasSubmitted, hasVoted, roundResults?, finalResults?, bestOf? }` | The *only* event that matters for rendering; fields present depend on `phase` — client renders based on `phase` and ignores irrelevant fields |
| `error` | `{ code, message }` | Non-fatal validation errors (e.g. "already submitted", "room full") shown as a toast; never used for game-flow control |
| `session` | `{ token }` | Sent once on first successful join so the client can persist it; never sent again unless explicitly re-issued |

### Payload shape recommendation

Use a single tagged-union `state` broadcast rather than separate `phase-changed`, `caption-submitted`, `vote-count-updated` events. One shape, one client-side reducer (`applyState(snapshot)`), no event-ordering bugs, and reconnect is free — a reconnecting client just receives one `state` message and is instantly correct, with zero replay or merge logic needed.

---

## Room/Session Model and Reconnection (recommended, concrete)

- **Room identity:** short alphanumeric code (e.g. 4-5 characters, avoid ambiguous characters like `0/O`, `1/I`), generated by the Room Manager and unique among currently-active rooms only (codes can be recycled once a room ends — no need for global uniqueness across all time).
- **Player identity:** an opaque random token (e.g. UUID) generated by the server on first `join` and returned to the client in a `session` event. The client immediately persists it to `localStorage`. On every subsequent connection attempt (including automatic Socket.IO reconnects after a lock/unlock), the client sends this token in the Socket.IO `auth` payload.
- **Server-side resolution:** on every handshake, the server looks up `token → playerId`. If found and that player belongs to a still-active room, re-attach the new socket to that player record, flip `connected: true`, and immediately push a full `state` snapshot to just that socket (not a room-wide broadcast) so the returning client instantly renders the correct current phase.
- **Why not rely on Socket.IO's own session/id:** confirmed via research — Socket.IO issues a new `socket.id` on every reconnection, including the reconnect that follows a phone lock/unlock or tab reload, so it cannot serve as player identity across that gap.
- **Why not cookies alone:** `localStorage` is simpler to reason about for a single-page app doing a manual `auth` handshake and avoids any same-site/cookie-attribute edge cases across mixed phone browsers at a party; a cookie-based approach would work too but adds no benefit here.

## Photo Asset Handling and No-Repeat Guarantee

- **Where photos live:** bundle the full pre-supplied Tamir photo set as static files in the server's public directory (or client `public/` if serving via the same static host), committed to the repo or added at deploy time. No object storage (S3/R2/etc.) and no upload flow — the photo set is fixed and known in advance, so static bundled assets are strictly simpler, free, and remove an entire integration surface (no upload UI, no storage credentials, no CDN configuration) from a one-week build.
- **No-repeat guarantee:** at game start, the server shuffles the full photo manifest once into a per-room ordered deck (`Fisher-Yates` or equivalent) and draws the next photo from the front of that deck at the start of each round. If `totalRounds` exceeds the number of available photos, decide up front whether to cap the host's round-count input at the photo count (recommended — simplest, fully avoids repeats) or reshuffle and allow a second pass through the deck (only if repeats across a very long game are acceptable). Given the "no repeats" requirement is explicit, capping round count to the photo count is the safer default.

## Meme Compositing Boundary: Client-Side Canvas (recommended)

**Recommendation: composite on the client, at the moment of download/share, never on the server.**

Reasoning against each stated concern:

- **Build time:** server-side compositing would require a native image library (`node-canvas`, `sharp`, or similar) with system-level dependencies that are a known source of deploy-time breakage on constrained/free hosting in exactly the kind of last-minute scramble this project cannot afford. Client-side Canvas is a browser built-in — zero dependencies, zero install risk.
- **iOS Safari download behavior (verified):** iOS Safari does not reliably support the anchor `download` attribute (tracked as an open WebKit limitation), and a common failure mode is that a programmatic click on a generated image/blob link is silently ignored unless it fires synchronously inside a real user tap/touch handler — an async canvas render or fetch completing later and *then* clicking a hidden link will frequently fail on iOS specifically. Recommended pattern: run the composite synchronously inside the tap handler (or immediately followed by a share/save action still inside that same gesture), and prefer `navigator.share({ files: [...] })` where `navigator.canShare` reports support, so iOS offers its native "Save Image" share-sheet option; provide a fallback of opening the composited image in a new tab/`<img>` so the user can long-press → "Add to Photos" if Web Share isn't available. Do not build a flow that depends on an automatic file download completing on iOS — it is not a supported guarantee, and this must be manually tested on a real iPhone in Safari before the party, not assumed to work.
- **Hebrew RTL text rendering (verified):** the Canvas 2D API has a native `direction` property (`ctx.direction = "rtl"`, supported across current browsers) that makes `fillText`/`strokeText` render Hebrew correctly without manual string manipulation. Do not manually reverse the caption string — unnecessary for Hebrew and actively wrong for scripts with ligatures; simply set `ctx.direction = "rtl"` and `ctx.textAlign = "right"` (or the appropriate alignment for the caption's placement on the photo) and use `ctx.measureText` to position the text block precisely.
- **Server never needs the rendered pixels:** the server's Best-Of and results logic only needs caption text + vote counts + a photo reference — never the final composited image — so keeping compositing client-side removes an entire unnecessary data flow (no image upload back to the server, no server-side image storage).

## Failure/Degradation Design: A Player's Socket Drops Mid-Round

The core principle: **the round must never wait indefinitely on a single missing submission.** The server-authoritative timer (Pattern 1) is the primary safety net; the following refines behavior specifically around disconnects:

- **On socket disconnect:** mark the player `connected: false` in the Players map but do **not** remove them or their prior submissions/score. Broadcast the updated player list so others see a "disconnected" indicator (useful for players to notice and shout "someone check on X's phone").
- **Advancing without a missing submission:** the "has everyone submitted?" early-advance check (Pattern 1's example) should count only *connected* players, or alternatively simply rely on the phase's hard timer deadline to advance regardless of submission count once time is up — do not let a disconnected (or simply slow) player's missing caption/vote block the round. When the phase ends (by timer or by all-connected-submitted), any player who never submitted a caption is simply excluded from that round's voting options; any player who never voted simply contributes no vote that round. Neither case should throw an error or halt the FSM.
- **Grace period before treating a player as fully gone:** keep a disconnected player's slot and score reserved for the rest of the game (there is no requirement to ever fully evict someone mid-game at a 10-15 person party) — a brief network blip or a long trip to the bathroom should both resolve the same way: reconnect with the same token, rejoin seamlessly, no penalty beyond having missed whichever round(s) they were away for.
- **Reconnect mid-round:** per the Room/Session Model above, a reconnecting client receives an immediate full `state` snapshot reflecting whatever phase is currently active, so a player who reconnects mid-VOTING sees the voting screen with remaining time, not a stale LOBBY or an error.
- **What NOT to build given one week:** do not build a "kick inactive player" admin control, do not build spectator/rejoin-as-new-identity flows, and do not attempt to distinguish "phone locked" from "phone closed the tab" from "wifi dropped" — treat all of them identically as "disconnected, may return," since the reconnect path is the same regardless of cause.

## Sources

- [MDN: CanvasRenderingContext2D.direction](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/direction) — confirms `direction` property support and behavior (MEDIUM confidence, cross-checked with code.mu RTL canvas guide)
- [WebKit Bugzilla #167341: Add support for the download attribute](https://bugs.webkit.org/show_bug.cgi?id=167341) — confirms iOS Safari's `download` attribute is a long-tracked, still-open limitation (MEDIUM confidence, cross-checked against Apple Developer Forums threads from 2024-2025)
- [Simon Neutert: Force iOS Safari to download media files (2025)](https://www.simon-neutert.de/2025/js-safari-media-download/) — workaround patterns for iOS media download, current as of 2025
- [Apple Developer Forums: Blob URLs not working on iOS 17.4.1](https://developer.apple.com/forums/thread/751063) — confirms blob-URL/download behavior instability persists into recent iOS versions
- [Socket.IO official docs: Client-Socket-Instance, Client Options](https://socket.io/docs/v3/client-socket-instance/) — confirms `socket.id` regenerates on reconnect and `auth` payload mechanism (LOW-MEDIUM confidence, official docs but cross-referenced with community discussion, not independently verified against a running server)
- [Socket.IO GitHub Discussion #4936: How to reconnect with new JWT in handshake](https://github.com/socketio/socket.io/discussions/4936) — confirms token-in-auth-payload reconnect pattern
- [Colyseus](https://colyseus.io/) — reference example of an authoritative-server Node.js multiplayer framework, cited as the formalized version of the hand-rolled pattern recommended here (LOW confidence, not evaluated for adoption — recommendation is to hand-roll the FSM, not adopt Colyseus, given the one-week timeline)
- Project context: `.planning/PROJECT.md` (requirements, constraints, and explicit reconnection/RTL/no-repeat requirements that shaped every recommendation above)

---
*Architecture research for: real-time multiplayer browser party game (Hebrew, phone-only, one-room, one-week build)*
*Researched: 2026-09-05*
