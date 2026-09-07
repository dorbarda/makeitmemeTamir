# Phase 3: Core Loop Checkpoint (Real Phones, End-to-End) - Context

**Gathered:** 2026-09-06
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase proves the complete write → rate → score loop works for real players on real phones,
using REAL Tamir photos for the first time. It is deliberately thin: enough of each layer to prove
the whole thing connects, not the fuller feature set.

Covers ROUND-01, ROUND-03, VOTE-01, VOTE-02, SCORE-01, SCORE-03.

Explicitly NOT in this phase (Phase 4's job): no-repeat photos across the whole game (ROUND-02),
the one-time photo swap (ROUND-06), fully hidden vote tallies as a completed feature (VOTE-03/05 —
Phase 2 already built the writing-phase content leak prevention; per-step visibility completeness
is Phase 4), the round-results ranking screen (VOTE-06), the running total across the WHOLE game
(SCORE-02 — this phase's score is per-round only), the final winner screen (SCORE-04), and the
"best of the night" screen (MEME-02).

</domain>

<decisions>
## Implementation Decisions

### Photos
- **D-01:** Tamir's photos are delivered by the user uploading image files directly into
  `client/public/tamir-photos/` via the GitHub web UI (this session can see chat-attached images but
  cannot persist their bytes to disk — a genuine environment limitation, not a design choice).
  Vite copies everything under `client/public/` verbatim into `client/dist/` at build time, and the
  server already serves that directory as static files (`server/src/app.ts`), so no server code
  changes are needed to serve them. — **Reversibility:** reversible — swapping the delivery
  mechanism later (e.g. an upload flow) only touches how the folder gets populated, not how it's
  served.
- The exact assignment mechanic (one distinct photo per player per round) is a planner/researcher
  decision — Claude's discretion, informed by whatever set of photos actually lands in the folder.
  No-repeat across the *whole game* is explicitly Phase 4 (ROUND-02); this phase only needs each
  player to receive *a* photo for their own caption each round.

### Rating Tier Names
- **D-02:** The three rating tiers use the user's own inside-joke names, not generic Hebrew slang
  and not placeholder digits:
  - **3 (funniest):** דנה מגנזי
  - **2 (fine):** תמיר פטריות
  - **1 (meh):** תמיר בפאניקה
  These replace the placeholder digit labels (`1`/`2`/`3`) that Phase 2 wave 4 shipped on
  `RatingPanel.tsx` buttons. The underlying values transmitted over the wire remain the numbers
  1/2/3 (that's what scoring sums) — only the button LABEL text changes to these three phrases.
  — **Reversibility:** reversible — pure display-string change, `HEBREW_UI` constant swap.

### Scoreboard
- **D-03:** The scoreboard shown between rounds (SCORE-03) is a **simple ranked list**: player name
  and score, highest first. No per-round score delta/increment shown (e.g. no "+7"). Chosen over a
  richer version explicitly for build speed at this checkpoint — a delta display can be added later
  without changing the underlying data model, since the round-end view already carries each meme's
  individual ratings (`RoundEndEntry` from Phase 2 wave 5).

### Scoring scope for this phase specifically
- **SCORE-01** (a player's round score = sum of ratings their meme received) must be REAL, computed
  math in this phase — it is explicitly this phase's requirement, not deferred. Phase 2 wave 4's
  SUMMARY deferred "real scoring math (sum/average)" to "Phase 4" in its own notes, but
  REQUIREMENTS.md's traceability table assigns SCORE-01 to Phase 3 and SCORE-02 (the running total
  ACROSS the whole game) to Phase 4. Resolve this by building: real per-round sum-of-ratings now
  (SCORE-01), a scoreboard that shows scores accumulated so far in the game session (SCORE-03) —
  but do not build the "official" cross-game persistence/finalization semantics implied by SCORE-02
  if the PLAN's own scope during planning finds daylight between "current running total" and
  "Phase 4's completed SCORE-02" (e.g. edge cases like a player who joined late). If genuinely
  ambiguous during planning, treat "the number that updates the scoreboard round to round" as in
  scope, and any deferred cross-game finalization semantics as a Phase 4 concern to note, not solve.

### Claude's Discretion
- Exact photo-to-player assignment algorithm (random draw from the uploaded set, no same-round
  duplicate assignment to two players — cross-round no-repeat is Phase 4).
- Whether the scoreboard appears as a distinct screen/phase or is layered onto the existing
  ROUND_END view Phase 2 wave 5 already built (`RoundEndPanel.tsx`) — reuse that infrastructure
  rather than building a parallel one if it fits.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project scope and requirements
- `.planning/PROJECT.md` — core value, constraints
- `.planning/REQUIREMENTS.md` — ROUND-01, ROUND-03, VOTE-01, VOTE-02, SCORE-01, SCORE-03 are this
  phase's requirements; note the SCORE-01/Phase-3 vs SCORE-02/Phase-4 boundary discussed above
- `.planning/ROADMAP.md` — Phase 3 goal and success criteria

### What Phase 2 already built (extend, do not rebuild)
- `.planning/phases/02-server-authoritative-round-engine/02-01-SUMMARY.md` through `02-05-SUMMARY.md`
  — the full server-authoritative round clock, writing phase with zero content leakage, one-meme-
  at-a-time rating rotation with author-sits-out, and the round-end/game-end view
  (`RoundEndEntry`: author, caption, raw rating values, `eligibleAtClose` — NOT reduced to a score
  yet; that reduction is this phase's job)
- `client/src/screens/round/RatingPanel.tsx` — currently renders placeholder digit labels (1/2/3)
  on its three buttons; this phase replaces those labels with D-02's tier names
- `client/src/screens/round/WritingPanel.tsx` — currently has no real photo; this phase wires one in
- `client/src/screens/round/RoundEndPanel.tsx` — currently shows raw entries unreduced; this phase
  either extends it or adds a scoreboard view per D-03

### What Phase 1 already built (session/identity — unchanged)
- `.planning/phases/01-room-session-reconnect-foundation/01-04-SUMMARY.md` — session tokens, grace-
  delayed roster fade, automatic host transfer; this phase must not regress reconnection during an
  active round now that content (photos, captions, ratings, scores) exists to potentially desync

No external ADRs or specs exist for this project — all decisions live in the files above plus this
document's `<decisions>` section.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `server/src/rooms/Room.ts` — already tracks `submissions`, `rotation`, `ratings` per Phase 2; this
  phase's scoring logic reduces `ratings` (raw per-rater values) into a per-player sum
- `server/src/rooms/RoundEndEntry` (in `shared/protocol.ts`) — already carries everything needed to
  compute a score; likely needs a new field or a derived view for "total score so far," not a
  protocol rewrite
- `client/src/index.css` — mobile-first system already established (padding, stacked controls, 16px
  base font, 44px tap targets); the photo image element and scoreboard list must fit inside it,
  never a fixed pixel width

### Established Patterns
- Server is sole authority on all state, including scores — the client must never compute or
  display a score the server didn't send
- Absolute-deadline timestamps (D-12 from Phase 2), never "seconds remaining" values
- Every Hebrew string lives in `shared/messages.ts`'s `HEBREW_UI`/`HEBREW_ERRORS` — no inline
  literals

### Integration Points
- Photo assignment plugs into the existing writing-phase entry point (wherever `enterWriting` is
  called in `Room.ts`) — a photo needs to be chosen and attached per player at that moment
- Scoring plugs into the existing `enterRoundEnd` transition — reduce that round's `ratings` into
  scores there, before the snapshot is built

</code_context>

<specifics>
## Specific Ideas

- The user's own words on the tier names — "3= דנה מגנזי, 2= תמיר פטריות, 1= תמיר בפאניקה" — reuse
  verbatim, do not paraphrase or "clean up" for tone; they are a deliberate inside joke.
- This is the first time real players will actually play a round with real content. Everything
  before this point (Phases 1-2) has been infrastructure with placeholder content.

</specifics>

<deferred>
## Deferred Ideas

- No-repeat photos across the whole game — Phase 4, ROUND-02
- The one-time photo swap before submitting — Phase 4, ROUND-06
- Round-results ranking screen — Phase 4, VOTE-06
- Cross-game running total finalization semantics, if they turn out to differ from "the number the
  scoreboard shows round to round" — Phase 4, SCORE-02
- Final winner screen — Phase 4, SCORE-04
- "Best of the night" recap — Phase 4 (MEME-02, per REQUIREMENTS.md's traceability table)
- A scoreboard showing per-round score delta (e.g. "+7") — considered, not chosen; simple ranked
  list only for this checkpoint

</deferred>

---

*Phase: 3-Core Loop Checkpoint (Real Phones, End-to-End)*
*Context gathered: 2026-09-06*
