# Phase 2: Server-Authoritative Round Engine - Context

**Gathered:** 2026-09-06
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers **the clock and the state machine** — and nothing else.

The server becomes the sole authority over which phase the room is in and when that phase ends.
Every transition (lobby → writing → per-meme rating → round end → next round → game end) fires on
a server-owned timer that advances regardless of who has or has not acted. Built and proven with
**placeholder round content**, so state-machine correctness is isolated from gameplay complexity.

In scope: host-configurable game settings in the lobby (round count + the two timer lengths),
starting the game, the writing phase and its countdown, submission-progress-only visibility, the
per-meme rating step and its own countdown, early-finish collapse, and never stalling on an
absent player.

Explicitly NOT in this phase: real photos of Tamir, no-repeat photo selection, photo swap,
real scoring or the scoreboard, the ranked round-results screen, the meme image itself, and any
host break-glass control that acts *during* a running game (skip round, remove player, end early
— those are Phase 6). Covers LOBBY-06, LOBBY-07, ROUND-04, ROUND-05, VOTE-04, LIVE-03.

</domain>

<decisions>
## Implementation Decisions

The user delegated all four gray areas with one instruction: *"set default settings on your own
sense based on the original make it meme game, then allow the host to modify those settings before
the game."* The two calls most likely to be wrong were put back to the user and both were
confirmed (see D-04 and D-08). Everything below is therefore a locked decision, not a suggestion.

Note on provenance: the defaults are set **in the spirit** of the caption-and-rate party format
(fast beats, one-tap input, short rating steps). They are not copied values from makeitmeme.com —
PROJECT.md forbids taking anything from that site, and its exact timer values are not known to a
level of confidence worth encoding.

### Host Settings & Starting the Game (LOBBY-06, LOBBY-07)

- **D-01:** The host gets a **settings panel in the lobby**, host-only, sitting above the start
  button. It exposes exactly three settings: number of rounds, writing-phase length, and
  rating-step length. This is the reading of LOBBY-06 the user asked for — "host chooses rounds"
  becomes "host chooses the game's shape" — and it keeps every tunable on one screen that can be
  fixed with one tap on the night if a default turns out wrong in front of the room.
- **D-02:** Every setting is **preset buttons, never free text and never a slider**. One tap, no
  keyboard, no invalid value to validate, no fat-finger drag on a phone. Values:
  - Rounds: **3** (default) / 5 / 7
  - Writing phase: 45 / **60** (default) / 90 seconds
  - Rating step: 8 / **10** (default) / 15 seconds
- **D-03:** Non-host players see the chosen settings **read-only** in the lobby, so nobody is
  surprised by a 90-second writing phase they did not know about.
- **D-04:** Defaults are **3 rounds / 60s writing / 10s per rating step** — user-confirmed. With
  12 players this is roughly 3.5 minutes per round and about 10-11 minutes for a 3-round game,
  less whenever early finish (D-07) kicks in.
- **D-05:** All settings **lock the moment the game starts**. Changing them mid-game is Phase 6
  territory. This mirrors the Phase 1 name-lock rule (D-09 there) — the lobby is the one place
  where things are still soft.
- **D-06:** Starting the game continues to require the Phase 1 minimum of **3 players**
  (`MIN_PLAYERS_TO_START`); this phase does not change that gate, it only adds settings alongside
  it.

### The Clock (ROUND-04, VOTE-04)

- **D-07:** **The clock only ever shortens, never extends.** When every player has submitted, the
  writing phase collapses to a **3-second** closing beat rather than cutting instantly. When every
  eligible rater has rated the meme on screen, that rating step collapses to **2 seconds** and
  moves on. Nothing anywhere may push a deadline later. Collapsing instead of cutting instantly
  matters because an instant screen swap steals the last person's submit confirmation and reads as
  a bug; never extending is what actually keeps ROUND-04 and LIVE-03 true. Early finish is also
  the single biggest lever on total round length — a fast group can finish a 12-meme round in
  roughly half the worst case.
- **D-08:** A player who **never submits a caption is skipped** from that round's rating rotation —
  user-confirmed. No blank meme is shown and nobody spends 10 seconds rating an empty image, and
  the round automatically gets shorter as people drop off, which is exactly the LIVE-03 behaviour
  wanted. Consequence: **the number of rating steps equals the number of submissions, not the
  number of players.** The engine must not assume those are the same.
- **D-09:** If a round ends with **fewer than 2 submitted captions**, the rating phase is skipped
  entirely and the engine advances to the next round (or to game end). One caption cannot be
  meaningfully rated — the sole author is the one person barred from rating it.
- **D-10:** A player who **does not rate before the step's deadline simply casts nothing**. No
  default rating value is invented. Inventing a 1 punishes a dead phone; inventing a 2 inflates
  the score. The engine's job is only to record who rated what.
  — **Flag for Phase 4, not decided here:** ROADMAP Phase 3 currently states a round score is the
  **sum** of ratings received. Combined with D-10, a meme shown while two people are away scores
  lower purely by bad luck of timing. Whether the score becomes an average, or a sum with some
  floor, is a scoring decision that belongs to Phase 4 — the engine must expose enough data
  (ratings received **and** the eligible-rater count at the moment the step closed) for Phase 4 to
  decide either way without a rework.
- **D-11:** Fixed pacing beats, deliberately **not** exposed as host settings because they are
  animation timing rather than game rules: **2 seconds between memes**, **3 seconds between major
  phases** (e.g. writing closing → first meme). On a phone an instant cut makes people think they
  missed something.
- **D-12:** Timers are transmitted as an **absolute deadline timestamp inside the state snapshot**;
  each client counts down locally against it. The server never ticks per-second messages (12-20
  phones times one message a second is pure waste), and a reconnecting phone lands on the correct
  remaining time for free out of the Phase 1 full-snapshot rule (Phase 1 D-14). The server holds
  the real authority — it runs its own timer and advances the room whatever any client's clock
  believes. — **Reversibility:** costly — the deadline field is read by every countdown surface
  and by the reconnect path, so switching to server ticks later means touching each phase screen
  plus the snapshot contract.

### What Players See While Waiting (ROUND-05)

- **D-13:** During writing, players see **both a bare count and per-name checkmarks** on the
  roster — "8 מתוך 12" plus a ✓ beside each player who has submitted. The count is the
  at-a-glance number; the checkmarks create the friendly social pressure that actually gets the
  last person to hit send. Neither reveals a single character of anyone's caption.
- **D-14:** **No caption text of any kind reaches another player's device before the round
  closes.** This is a server-side rule, not a UI rule — the writing-phase snapshot must not carry
  other players' caption strings at all, so there is nothing to leak even to someone reading the
  socket traffic. — **Reversibility:** costly — it constrains the shape of the round snapshot,
  which every later phase's screens read from.
- **D-15:** The **countdown is always visible**, small, at the top of the screen, and becomes
  visually urgent in the **last 10 seconds**. A hidden timer that suddenly expires reads as the
  app breaking.

### Claude's Discretion

The user explicitly handed these back ("you go ahead set all default"). Beyond the decisions
locked above, the following remain open technical choices for research and planning:

- The shape of the round state machine itself: how phases are represented, where the authoritative
  timer lives on the `Room` object, and how it composes with the existing `fadeTimers` /
  `hostTransferTimer` pattern already in `server/src/rooms/Room.ts`.
- Client clock-skew correction against the D-12 absolute deadline.
- What the Phase 2 **placeholder** round content actually is — enough to prove the state machine
  with no real assets (a numbered panel and the typed text is sufficient). Phase 3 swaps in real
  photos; do not build photo selection here.
- How `RoomPhase` (`"LOBBY" | "IN_GAME"` today) is expanded — whether into a richer enum, a
  nested round-state object, or both.
- Whether the three host settings live on the `Room` or in a separate settings object, and how
  they are validated server-side (the client sends only preset values, but the server must never
  trust that).
- Test strategy for timer-driven behaviour (fake timers vs real waits) — the existing suite in
  `server/test/` already exercises delayed timers in `rosterFade.integration.test.ts` and
  `hostTransfer.integration.test.ts`; follow whatever that established.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project scope and requirements
- `.planning/PROJECT.md` — core value, the one-week constraint, the "original implementation and
  assets only" legal constraint, and the full out-of-scope list
- `.planning/REQUIREMENTS.md` — LOBBY-06, LOBBY-07, ROUND-04, ROUND-05, VOTE-04, LIVE-03 are this
  phase's requirements
- `.planning/ROADMAP.md` — Phase 2 goal and its five success criteria; also read the Phase 4 and
  Phase 6 entries to confirm what is deliberately NOT built here

### Decisions carried in from Phase 1 (binding, do not re-litigate)
- `.planning/phases/01-room-session-reconnect-foundation/01-CONTEXT.md` — especially D-10 (host is
  a full player), D-11 (min 3 to start), D-14 (reconnect lands straight back on the current
  screen, no popup), D-15 (a half-typed caption is deliberately NOT preserved across a
  disconnect), D-17 (a departed player stays on the scoreboard but play never waits for them)

### Architecture and failure modes
- `.planning/research/ARCHITECTURE.md` — the server-authoritative model and
  full-state-resync-on-reconnect, which D-12 depends on
- `.planning/research/PITFALLS.md` — client-owned timers as an explicit danger, and iOS Safari
  dropping connections on backgrounding (a backgrounded phone must land on the right remaining
  time when it wakes)
- `.planning/research/STACK.md` — transport and hosting
- `.planning/research/SUMMARY.md` — cross-cutting consensus

### Live state
- `.planning/STATE.md` — carries two pending todos that this phase's defaults now answer
  (rating-step sizing, total-round-time risk) and two open decisions that do NOT block this phase
  (Render WebSocket support → Phase 7; iOS save/share → Phase 5)

Note: no external ADRs or specs exist for this project. Every decision lives in the files above
plus the `<decisions>` section of this document.

</canonical_refs>

<code_context>
## Existing Code Insights

Phase 1 is complete, verified, deployed, and tested on real phones. This is no longer a greenfield
repo — the round engine attaches to real, working code.

### Reusable Assets
- `server/src/rooms/Room.ts` — the room object this phase extends. Already carries `phase`,
  `players`, `hostId`, `snapshotFor(playerId)`, and `broadcast(io)`. The round state machine hangs
  off this class.
- **The delayed-timer pattern already in `Room`** — `fadeTimers` / `hostTransferTimer`, each with
  a matching `clearX` method, all torn down in `dispose()`, and an `onStateChanged?()` callback so
  a timer that mutates state can trigger a broadcast without `Room` taking a hard dependency on
  `Server`. **The round timer must follow exactly this pattern**, including registration in
  `dispose()` — a leaked round timer firing against a torn-down room is the obvious way to break
  this phase.
- `Room.snapshotFor(playerId)` — already builds a **per-player personalized** snapshot. This is
  precisely what D-14 needs: the same call can omit other players' captions and, later, tell the
  meme's author they are barred from rating.
- `shared/protocol.ts` — `RoomPhase`, `LobbySnapshot`, `CLIENT_EVENTS`, `SERVER_EVENTS`. New round
  events and the expanded snapshot type go here, shared by both packages.
- `shared/messages.ts` — **the single Hebrew string source**. The file's own comment is explicit:
  no player-facing text is ever written inline in a component or a handler. Every new Hebrew
  string in this phase (progress count, countdown labels, phase headings) goes in `HEBREW_UI`.
- `server/src/config.ts` — where the new timer constants belong, alongside the existing ones. Note
  the established convention: each constant carries a comment citing the decision ID or the
  research finding that produced it, and derived constants are expressed as arithmetic on their
  base rather than as independently chosen numbers.
- `client/src/state/gameStore.ts` and `client/src/socket/resync.ts` — the client state and resync
  path the round snapshot flows into.
- `server/test/` — an established integration-test harness, including timer-driven tests
  (`rosterFade.integration.test.ts`, `hostTransfer.integration.test.ts`) that are the model for
  testing the round clock.

### Established Patterns
- **The server is the sole authority; the client renders what it is told.** Already enforced
  throughout Phase 1.
- **Full snapshot, never a diff** — every state change broadcasts a complete personalized
  snapshot. D-12's absolute deadline rides along on this for free.
- **Identity is an app-level session token, never the socket id.**
- **Fail closed, never throw** — see `Room.renamePlayer` returning a typed `RenameOutcome` instead
  of throwing, and `transferHost` tolerating a missing host. Round transitions should be written
  the same way.
- **No client-supplied successor / no client-supplied authority** — `transferHost()` deliberately
  takes no argument so no client can name one. Round advancement must be equally uninfluenceable
  by a client message.
- **Hebrew strings are centralized**, and error codes are a closed union in `shared/protocol.ts`
  paired with a Hebrew message in `HEBREW_ERRORS`.

### Integration Points
- `Room.phase` (`"LOBBY" | "IN_GAME"`) is the seam — this phase expands it into a real state
  machine.
- `Room.snapshotFor()` gains the round payload (current phase, absolute deadline, submission
  progress, current meme index).
- `CLIENT_EVENTS` gains the host's start-game / change-settings intents and the player's
  submit / rate intents.
- `handlers.ts` is where the room's `onStateChanged` is wired to `broadcast(io)` — the round timer
  needs the same wiring.
- Phase 3 consumes this engine directly, swapping placeholder content for real photos and captions.

</code_context>

<specifics>
## Specific Ideas

- The reference point is the general caption-and-rate party format popularised by makeitmeme.com:
  fast beats, one-tap input, short rating steps, no dead air. **Format only** — no code, artwork,
  fonts, branding, or copied timer values from that site.
- The user's stated priority for this discussion was speed and low token cost: set sensible
  defaults, make them host-adjustable so a wrong guess is a one-tap fix on the night, and do not
  litigate each number in advance.
- The party is a surprise with a fixed, immovable date. Reliability outranks polish everywhere
  there is a tradeoff — a round that ends slightly too early is a far smaller failure than a round
  that hangs.

</specifics>

<deferred>
## Deferred Ideas

- **Host controls that act during a running game** — skip the current round, remove a player, end
  the game early. Already Phase 6 (LIVE-04..07). D-05 deliberately locks settings at game start so
  this phase never grows a mid-game mutation path.
- **Changing round count or timers mid-game.** Same reason — Phase 6, if wanted at all.
- **How a round score is actually computed** when some eligible raters never rated (see D-10's
  flag). Phase 4. This phase only guarantees the data needed to decide it is captured.
- **Funny Hebrew tier names for the 3 / 2 / 1 rating scale.** Tracked in STATE.md as a pending
  Phase 3/4 todo; the engine here uses placeholder content and does not need them.
- **Per-player adaptive timers** (e.g. a longer writing phase when more players are in the room).
  Not raised by the user; noted only because D-02's fixed presets rule it out for now.

</deferred>

---

*Phase: 2-Server-Authoritative Round Engine*
*Context gathered: 2026-09-06*
