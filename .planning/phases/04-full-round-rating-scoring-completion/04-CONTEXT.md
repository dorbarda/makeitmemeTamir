# Phase 4: Full Round, Rating & Scoring Completion - Context

**Gathered:** 2026-09-07
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers **the whole real game loop**, not just the "completion" items its name
suggests. Phase 3 (the dedicated real-phones checkpoint) was explicitly skipped — the user is
time-constrained (approaching a weekly usage limit) and chose to move straight here, accepting the
risk, with a lightweight real-phone playtest folded into the end of this phase instead of a
standalone checkpoint. Nothing else in the roadmap builds ROUND-01, ROUND-03, VOTE-01, VOTE-02,
SCORE-01, or SCORE-03 — so this phase now absorbs them alongside its original scope.

In scope: real Tamir photos assigned per player per round with no repeats across the game, one
free photo swap per round before submitting, the Hebrew caption-writing screen wired to the Phase 2
round engine, memes revealed one at a time with the 3/2/1 rating scale (funny Hebrew tier names
decided below), the meme's author excluded from rating their own meme with a waiting state,
individual ratings hidden until each meme's step closes, a round results screen ranking that
round's memes, round scores summing into a running game total shown on a scoreboard between
rounds, a final winner screen, and a "best of the night" screen tracked live across the game.

Explicitly NOT in this phase: the meme image compositor / download flow (Phase 5 — MEME-01,
MEME-03), host break-glass controls (Phase 6), Hebrew RTL interface hardening beyond what this
phase's own new screens need, and deployment (Phase 7). Covers ROUND-01, ROUND-02, ROUND-03,
ROUND-06, VOTE-01, VOTE-02, VOTE-03, VOTE-05, VOTE-06, SCORE-01, SCORE-02, SCORE-03, SCORE-04,
MEME-02.

</domain>

<decisions>
## Implementation Decisions

The user delegated all four gray areas raised for this phase with one instruction: *"i trust you"*.
Everything below is therefore a locked default, in the same spirit as Phase 2's D-04/D-08 pattern —
sensible, reversible where it matters, and a one-tap or one-line fix if wrong on the night.

### Scoring Formula & Best-of-Night (SCORE-01, SCORE-02, SCORE-04, MEME-02)

- **D-01:** A round score is a **straight sum** of the ratings a player's meme received —
  matches SCORE-01's literal wording and the ROADMAP text. No average, no floor. Phase 2's D-10
  flagged that a meme rated while some eligible raters are away scores lower by bad luck of
  timing; **accepted as-is** — reliability and simplicity outrank fairness-tuning for a one-night
  build, and it is an easy follow-up if it ever matters again.
- **D-02:** Round scores **accumulate additively** into a running game total (SCORE-02). The
  scoreboard shown between rounds (SCORE-03, built in Phase 3's original scope, now here) shows
  each player's running total, sorted highest first.
- **D-03:** "Best of the night" (MEME-02) shows the **top 3 highest-scoring memes** of the whole
  game — image + caption + final score + round number. Tracked incrementally as each round's
  scores land (a running top-3 list), not reconstructed at game end, per the existing ROADMAP
  wording. Ties for 3rd place: keep all tied entries rather than arbitrarily dropping one — a
  short list growing to 4 is a smaller failure than fabricating a tiebreak nobody asked for.

### Rating Tier Names (VOTE-02)

- **D-04:** The 3/2/1 scale gets three short, punchy Hebrew names instead of raw numbers on the
  rating buttons:
  - **3 (funniest):** "מת מצחוק" (dying of laughter)
  - **2 (fine):** "חייכתי" (I smiled)
  - **1 (meh):** "אה, בסדר" (eh, okay)
  These are single short phrases sized for a phone-width tap target, carry an escalating-funny
  tone appropriate to a bachelor party, and avoid emoji (kept as plain Hebrew text per the
  project's centralized-strings convention). They go in `shared/messages.ts` `HEBREW_UI` like
  every other player-facing string — never inline.

### Photo Pool & No-Repeat (ROUND-01, ROUND-02, ROUND-06)

- **D-05:** Photos are assigned **per player per round**, drawn from the room's unused pool,
  tracked as a per-room "used" set (per PROJECT.md's plain in-memory JSON-manifest approach —
  no database). ROUND-02 requires no repeats within a single game.
- **D-06:** **If the pool runs low** (rounds × players can exceed the unique photo count with a
  big group and many rounds), the engine **allows repeats rather than blocking or capping rounds**
  — a repeated photo late in a long game is a far smaller failure than the host being unable to
  start the round count they picked in Phase 2's lobby settings. When repeats become necessary,
  prefer the **least-recently-used** photo first, so repeats spread out rather than clustering.
- **D-07:** The one-time photo swap (ROUND-06) draws from the same unused pool (or LRU-repeat
  fallback under D-06) and **cannot be swapped back** — one swap, spent, per player per round,
  mirroring the "no revoking" spirit of Phase 1/2's other one-way locks (e.g. D-05 settings lock).
  The photo actually shown for that player's round photo of the caption update the instant it's
  used; it does not change who else's photo they'll get next round.
- **D-08:** The **actual photo set is not yet in the repo** — `client/public/tamir-photos/` is
  currently just a reserved directory with a `.gitkeep`. This phase's engine work must run against
  a small placeholder set (a handful of numbered/generic images) so build isn't blocked on the
  user supplying real photos; swapping in the real set before the party is a drop-in, zero-code
  step. Flagged here so research/planning doesn't assume the real set exists.

### Round Results, Author Wait State & Final Screens (VOTE-03, VOTE-05, VOTE-06, SCORE-04)

- **D-09:** While a meme is on screen and being rated, the **author sees a waiting state** —
  their own screen shows the photo/caption without rating buttons and a short "ממתין לדירוגים..."
  ("waiting for ratings...") message. No numbers, no partial tally — VOTE-05 requires individual
  ratings (and by extension the running total) to stay fully hidden until the step closes, for
  every player including the author.
  Note this is a UI decision only — the eligible-rater exclusion mechanism (server never asking
  the author to rate their own meme) is a Phase 2 state-machine concern already covered by D-08/D-09
  in `02-CONTEXT.md`. This phase renders the client side of it.
- **D-10:** The **round results screen** (VOTE-06) shows a simple ranked list — meme thumbnail,
  caption, author name, total points — highest first, revealed with a short staggered reveal
  (fastest-to-slowest count-up, ~150ms stagger per row) rather than all at once, matching Phase
  2's D-11/D-15 "instant cuts read as broken" pacing philosophy. **Ties** are shown at the same
  rank with a shared position number (e.g. two memes both shown as "#2") — no arbitrary tiebreak.
- **D-11:** The **final winner screen** (SCORE-04) shows the player with the highest running
  total, plus the full final scoreboard below it, once the last round's results screen has been
  dismissed. Kept as plain and unadorned as the round results screen — no separate confetti/effects
  layer scoped here (that kind of polish is a Phase 6-or-later nice-to-have, not blocking).

### End-of-Phase Real-Phone Playtest (folds in the skipped Phase 3 checkpoint)

- **D-12:** Once this phase's plans are executed and verified, run a **lightweight real-phone
  playtest** — at least 2 distinct real phones playing one full round (join → write with a real
  photo → rate meme-by-meme → see round results and running score) before moving to Phase 5. This
  is the folded-in Phase 3 success criterion; it does not need its own phase or plan, just a
  UAT pass at the end of Phase 4's execution.

### Claude's Discretion

The user explicitly handed these back ("i trust you"). Beyond the decisions locked above, the
following remain open technical choices for research and planning:

- Exact shape of the photo-pool/used-set data structure on `Room` and whether it lives inline or
  as a small dedicated module, following the existing `fadeTimers`-style pattern conventions noted
  in Phase 2's context.
- How the writing screen's real caption input integrates with the existing round-engine snapshot
  contract from Phase 2 (`Room.snapshotFor`, `CLIENT_EVENTS`, `SERVER_EVENTS` in
  `shared/protocol.ts`) — this phase wires real content into an already-proven state machine, it
  does not redesign the state machine.
- Whether the "best of night" top-3 tracking lives as a running array on the room/game object
  updated after each round, or is computed once at game end from full round history — D-03 only
  requires it be visibly maintained "from round one," not a specific data structure.
- Test strategy for the new screens/flows — follow the existing `server/test/` and
  `client/src` test conventions already established in Phases 1-2.
- The exact placeholder photo set used until real Tamir photos are supplied (count, format,
  filenames) — small enough to exercise no-repeat and swap logic (e.g. 15-20 placeholder images
  is plenty for a 3-7 round game with 10-15 players).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project scope and requirements
- `.planning/PROJECT.md` — core value, the one-week constraint, Hebrew/RTL requirement, "original
  implementation and assets only" legal constraint, full out-of-scope list
- `.planning/REQUIREMENTS.md` — this phase now covers ROUND-01, ROUND-02, ROUND-03, ROUND-06,
  VOTE-01, VOTE-02, VOTE-03, VOTE-05, VOTE-06, SCORE-01, SCORE-02, SCORE-03, SCORE-04, MEME-02
  (traceability table updated to reflect Phase 3's absorbed requirements)
- `.planning/ROADMAP.md` — Phase 4's goal and success criteria (updated 2026-09-07 to absorb
  Phase 3's scope); also read the skipped Phase 3 entry (marked SKIPPED, rationale preserved) and
  the Phase 5/6 entries to confirm what is deliberately NOT built here

### Decisions carried in from prior phases (binding, do not re-litigate)
- `.planning/phases/01-room-session-reconnect-foundation/01-CONTEXT.md` — host-is-a-player,
  min-3-to-start, reconnect-lands-on-current-screen, departed-player-stays-on-scoreboard rules
- `.planning/phases/02-server-authoritative-round-engine/02-CONTEXT.md` — **read in full**; the
  entire round/rating state machine this phase's real content plugs into. Especially D-07/D-08/D-09
  (early-finish collapse, skip-non-submitters, skip-rating-if-<2-submissions), D-10 (the flagged
  scoring-fairness question this phase's D-01 resolves), D-12 (absolute-deadline timer contract),
  D-13/D-14 (progress-only visibility, no leaking captions early)

### Architecture and failure modes
- `.planning/research/ARCHITECTURE.md` — server-authoritative model, full-state-resync-on-reconnect
- `.planning/research/PITFALLS.md` — client-owned timers, iOS Safari backgrounding
- `.planning/research/STACK.md` — canvas/RTL notes relevant to how captions will later feed Phase 5
- `.planning/research/SUMMARY.md` — cross-cutting consensus

### Live state
- `.planning/STATE.md` — Roadmap Evolution log now records Phase 3's skip and this phase's
  absorbed scope; open decisions that do NOT block this phase (Render WebSocket support → Phase 7;
  iOS save/share → Phase 5)

Note: no external ADRs or specs exist for this project. Every decision lives in the files above
plus the `<decisions>` section of this document.

</canonical_refs>

<code_context>
## Existing Code Insights

Phases 1-2 are complete, verified, and tested (168 server + 34 client tests). This phase plugs
real content into an already-proven round engine — it does not redesign it.

### Reusable Assets
- `server/src/rooms/Room.ts` (785 lines) — the round state machine from Phase 2 lives here:
  `phase`, `players`, `hostId`, `snapshotFor(playerId)`, `broadcast(io)`, the round/rating-step
  clock, and the delayed-timer pattern (`fadeTimers`/`hostTransferTimer`-style, each with a
  matching `clearX`, torn down in `dispose()`). This phase's photo-pool/scoring state should
  follow that same established pattern.
- `shared/protocol.ts` (141 lines) — `RoomPhase`, snapshot types, `CLIENT_EVENTS`,
  `SERVER_EVENTS`. New events (submit-caption-with-photo, swap-photo, submit-rating) and expanded
  snapshot fields (photo assignment, rating tallies, scoreboard, best-of-night list) go here.
- `shared/messages.ts` (86 lines) — the single Hebrew string source (`HEBREW_UI`). D-04's tier
  names and D-09's waiting-state message go here, never inline in a component.
- `server/src/config.ts` (94 lines) — timer/round constants from Phase 2 live here with
  decision-ID comments; this phase's constants (placeholder photo count, best-of-night list size)
  follow the same convention.
- `client/public/tamir-photos/` — currently just a `.gitkeep` (see D-08) — the real photo set is
  not yet in the repo.
- `server/test/` — established integration-test harness including timer-driven tests
  (`rosterFade.integration.test.ts`, `hostTransfer.integration.test.ts`) as the model for testing
  round-by-round scoring accumulation.

### Established Patterns
- Server is the sole authority; client renders what it is told (enforced throughout Phases 1-2).
- Full personalized snapshot on every state change, never a diff — `Room.snapshotFor(playerId)`
  is exactly where per-player "your photo" / "you're the author, wait" logic belongs.
- Fail closed, never throw — typed outcome returns, not exceptions, for anything a client can
  trigger (submit caption, swap photo, submit rating).
- No client-supplied authority — a client cannot claim its own score or dictate the photo pool;
  the server assigns and validates everything.
- Hebrew strings centralized in `HEBREW_UI` / `HEBREW_ERRORS`.

### Integration Points
- `Room.snapshotFor()` gains: assigned photo (+ swap-used flag), current meme under rating (image
  + caption, omitting rater identity/ratings until closed), round results (once closed), running
  scoreboard, best-of-night top-3.
- `CLIENT_EVENTS` gains: submit-caption (with photo id), swap-photo, submit-rating.
- Phase 5 consumes this phase's finished caption+photo pairing directly for the meme compositor —
  keep the "photo id + caption text" shape stable and simple for that handoff.

</code_context>

<specifics>
## Specific Ideas

- The user's stated priority for this discussion, given the weekly usage-limit time pressure, was
  speed: "i trust you" — set sensible defaults across the board rather than litigating each one.
- The party is a surprise with a fixed, immovable date; reliability outranks fairness-tuning or
  polish everywhere there is a tradeoff (D-01, D-06, D-11 all lean this way explicitly).
- Skipping Phase 3 was a deliberate, acknowledged risk (see ROADMAP.md Phase 3 SKIPPED note and
  STATE.md Roadmap Evolution) — D-12's end-of-phase playtest is the mitigation, not a nice-to-have.

</specifics>

<deferred>
## Deferred Ideas

- **The meme image compositor and download/share flow** — Phase 5 (MEME-01, MEME-03). This phase
  only produces the photo+caption pairing Phase 5 will composite.
- **Host break-glass controls during a running game** (skip round, remove player, end early) —
  Phase 6 (LIVE-04..07), unaffected by this phase's scope absorption.
- **Confetti/celebration effects on the final winner screen** — noted in D-11 as explicitly out,
  candidate for later polish if time allows.
- **Fairness-adjusted scoring** (average instead of sum, floor for meme rated while raters absent)
  — explicitly declined in D-01; revisit only if playtesting in D-12 surfaces it as a real problem.

</deferred>

---

*Phase: 4-Full Round, Rating & Scoring Completion*
*Context gathered: 2026-09-07*
