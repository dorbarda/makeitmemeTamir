# Phase 4: Full Round, Rating & Scoring Completion - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-07
**Phase:** 4-Full Round, Rating & Scoring Completion
**Areas discussed:** Photo swap, Winner & best-of screens

---

## Photo Swap

| Option | Description | Selected |
|--------|-------------|----------|
| New photo shown, then you decide | See the replacement before committing | |
| Instant, no preview | Tap swap, new photo is just there and locked in | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| No — swap locks once you submit | Matches how writing/rating already work | ✓ |
| Yes, until the round ends | More flexible, reopens a caption already in the rating queue | |

**User's choice:** Instant swap, no preview; locks permanently on caption submission.

## Winner & Best-Of Screens

| Option | Description | Selected |
|--------|-------------|----------|
| Both win | Show every tied player as a winner | ✓ |
| Tiebreaker rule | Some rule picks a single winner | |

| Option | Description | Selected |
|--------|-------------|----------|
| Top 3 | A tight highlight reel | ✓ |
| Top 5 | More variety | |
| Everyone's single best meme | One entry per player | |

**User's choice:** All tied players win; best-of shows the top 3 memes from the whole game.

## Claude's Discretion

- No-repeat photo mechanism: per-player "already seen" tracking across the whole game, gracefully
  resetting once a player has seen the entire pool rather than hitting an impossible constraint
  with only 5 photos currently uploaded.
- Round results display: rank by real point total (replacing the current rater-count placeholder);
  author identity stays visible, matching the pattern Phase 2 already shipped.
- Running total (SCORE-02): the existing additive scoring model needs no redesign; no special
  backfill logic for a player who joined late.

## Deferred Ideas

None raised in this discussion beyond what PROJECT.md already tracks.
