# Phase 4: Full Round, Rating & Scoring Completion - Context

**Gathered:** 2026-09-07
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase completes the game loop to full spec, on top of the proven Phase 3 checkpoint:
no-repeat photos, the one-time photo swap, ranked round results, the final winner screen, and
"best of the night." Covers ROUND-02, ROUND-06, VOTE-03, VOTE-05, VOTE-06, SCORE-02, SCORE-04,
MEME-02.

VOTE-03 (author excluded from rating their own meme, waiting state) is already built and working
(Phase 2 wave 4's `RatingPanel.tsx`) — this phase should verify it still holds, not rebuild it.
VOTE-05 (individual ratings hidden until a step closes) should also be verified against current
behavior rather than assumed complete or assumed missing — confirm during planning/research.

Explicitly NOT in this phase: the meme image itself (caption drawn onto the photo, multi-caption
drag-and-drop editor) — that is Phase 5's MEME-01, a separate and much larger effort scoped
2026-09-07 after Phase 3's real-phone playtest (see PROJECT.md Key Decisions and
REQUIREMENTS.md's MEME-01 entry for the full tradeoff).

</domain>

<decisions>
## Implementation Decisions

### Photo Swap (ROUND-06)
- **D-01:** Tapping "swap photo" instantly replaces the assigned photo with a new one — no preview
  step, no confirm. Chosen for build simplicity over a "reveal then decide" moment.
- **D-02:** The swap locks permanently the moment the player submits their caption — consistent
  with every other per-round action in this project (writing, rating) being final on submit. No
  swapping after submission, even if the round is still open for others.
- Still exactly one swap per round, per the original decision recorded in `03-CONTEXT.md`.

### No-Repeat Photos (ROUND-02) — Claude's Discretion
- The user has only 5 photos uploaded right now, with more possibly coming before the party. The
  literal "never see the same photo twice in the ENTIRE game" guarantee is mathematically
  impossible once a player has been in more rounds than there are photos in the pool.
- **Resolution:** track, per player, which photos they've already been shown across the whole game.
  Draw their next assignment only from photos they haven't seen yet; once a player has exhausted
  the full pool, treat their "seen" set as reset and allow repeats again rather than crashing or
  stalling the round. This degrades gracefully instead of hitting an impossible constraint, and the
  common case (fewer rounds than photos) gets a clean, true no-repeat guarantee.
- Photo swap (D-01) draws from the same not-yet-seen pool as a normal assignment — a swap must not
  hand back a photo the player has already seen this game (that would defeat the point of swapping).

### Round Results Screen (VOTE-06) — Claude's Discretion
- Ranks that round's memes by their real total point score (sum of ratings), highest first —
  replacing the current placeholder display of "X of Y people rated this" with the actual score.
- Author identity stays visible in results, matching the existing pattern already shipped in
  `RoundEndPanel.tsx` (`entry.authorName` is already shown) — this phase is not introducing new
  anonymity, just fixing what number is displayed.

### Winner & Ties (SCORE-04)
- **D-03:** If two or more players tie for the highest score, ALL of them are shown as winners —
  no tiebreaker rule. Simple, and avoids inventing a rule nobody will remember at 1am.

### Best of the Night (MEME-02)
- **D-04:** Shows the top 3 highest-scoring memes from across the WHOLE game, tracked as the game
  progresses (per the roadmap's own instruction — "tracked from round one rather than reconstructed
  at the end") rather than recomputed from scratch at game end.

### Running Total (SCORE-02) — Claude's Discretion
- The additive scoring model already in `Room.applyRoundScores` (each round adds to the existing
  score, never resets) is correct and needs no redesign. A player who is not present for an earlier
  round simply carries whatever total they had when they left/joined — no special "backfill" or
  penalty logic. Document this plainly rather than inventing cross-game finalization rules Phase 3's
  discussion explicitly deferred without resolving.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project scope and requirements
- `.planning/PROJECT.md` — core value, constraints, Key Decisions (including the 2026-09-07 meme
  editor scope note, which does NOT belong to this phase)
- `.planning/REQUIREMENTS.md` — ROUND-02, ROUND-06, VOTE-03, VOTE-05, VOTE-06, SCORE-02, SCORE-04,
  MEME-02 are this phase's requirements
- `.planning/ROADMAP.md` — Phase 4 goal and success criteria

### What already exists (extend, do not rebuild)
- `server/src/rooms/photos.ts` — `assignPhotos`, `photoUrl`, `PHOTO_FILENAMES`; this phase adds
  per-player "already seen" tracking on top of this, does not replace it
- `server/src/rooms/Room.ts` — `applyRoundScores` (the sole score-mutation site), `photoAssignments`,
  `photoUrlFor`, the full round/rating/round-end state machine from Phase 2
- `client/src/screens/round/RoundEndPanel.tsx` — currently shows unranked entries with a rater
  count instead of a score; this phase fixes the ranking and the displayed number
- `client/src/screens/Round.tsx` — recently fixed (2026-09-07) to stop double-rendering the player
  roster; any new screen this phase adds must respect that same "only one list per screen" rule
- Phase 3's `WritingPanel.tsx` real-photo rendering pattern (relative width, `max-width`, matching
  the QR code image convention from Phase 1) — reuse for the swap button's photo display

### Playtest history worth knowing
- `.planning/phases/03-core-loop-checkpoint-real-phones-end-to-end/03-01-SUMMARY.md` — what Phase 3
  actually shipped and what real-phone testing found
- The Phase 3 real-phone playtest found and fixed one real bug (duplicate roster rendering,
  `f3e66da`) — the lesson: features that look correct in code can still visibly break when watched
  on a real phone; plan for this phase's new screens (swap button, ranked results, winner, best-of)
  to get a similar real-device check before considering the phase done.

No external ADRs or specs exist for this project — all decisions live in the files above plus this
document's `<decisions>` section.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `shared/messages.ts`'s `HEBREW_UI`/`HEBREW_ERRORS` — every new string (swap button label, winner
  heading, best-of heading) goes here, never inlined
- The mobile-first CSS system in `client/src/index.css` — no fixed pixel widths, everything stacks

### Established Patterns
- Server is sole authority on all state — a swap request, like everything else, must be validated
  and executed server-side; the client only ever displays what the server sends
- Absolute-deadline timestamps for anything time-bound (unaffected by this phase, noted for
  consistency if a swap-related timer question comes up during planning)

### Integration Points
- Photo swap needs a new client event (e.g. `CLIENT_EVENTS.swapPhoto`) and server handler, following
  the exact shape of `submit-caption`'s validation-then-mutate pattern in `handlers.ts`
- The "already seen" photo tracking needs a place to live per-room, most naturally alongside
  `Room.photoAssignments` — a `Map<playerId, Set<filename>>` accumulated round over round, not reset
  between rounds (only reset per-player once their seen-set covers the whole pool, per D-04's
  discretion note above)

</code_context>

<specifics>
## Specific Ideas

- The user cares about the deadline risk they explicitly created by choosing the ambitious meme
  editor for Phase 5 — this phase should stay lean and not accumulate its own scope creep. Every
  decision above was chosen for simplicity where a choice existed (instant swap, no tiebreaker,
  top 3 not top 5).

</specifics>

<deferred>
## Deferred Ideas

- None raised beyond what PROJECT.md's Out of Scope and v2 sections already track.

</deferred>

---

*Phase: 4-Full Round, Rating & Scoring Completion*
*Context gathered: 2026-09-07*
