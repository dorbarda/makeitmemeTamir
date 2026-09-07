# Phase 4: Full Round, Rating & Scoring Completion — Discussion Log

**Date:** 2026-09-07

This log is for human reference only; downstream agents read `04-CONTEXT.md`, not this file.

## Prior decision: Phase 3 skipped

Before this discussion, the user decided (time-constrained, approaching a weekly usage limit) to
skip Phase 3 (Core Loop Checkpoint, Real Phones, End-to-End) and move straight to Phase 4. This
was recorded via `/gsd-phase --edit 3` marking Phase 3 SKIPPED in ROADMAP.md, with its
requirements (ROUND-01, ROUND-03, VOTE-01, VOTE-02, SCORE-01, SCORE-03) re-pointed to Phase 4 in
REQUIREMENTS.md, since Phase 4 is now the only phase that builds them.

## Gray areas presented

1. Scoring formula (sum vs. average vs. floor; best-of-night list size)
2. Rating tier names (funny Hebrew names for 3/2/1)
3. Photo swap & no-repeat pool (what happens when the pool runs low)
4. Round results & final screens (ties, pacing, what final/best-of screens show)

## User's answer

"i trust you" — delegated all four areas.

## Decisions made (Claude's judgment, recorded in 04-CONTEXT.md)

- **Scoring:** straight sum (D-01), additive running total (D-02), best-of-night top 3 with ties
  kept rather than dropped (D-03).
- **Tier names:** "מת מצחוק" (3) / "חייכתי" (2) / "אה, בסדר" (1) (D-04).
- **Photo pool:** per-room used-set, no DB; allow LRU repeats if the pool runs low rather than
  capping rounds (D-05, D-06); one-way swap, no swap-back (D-07); flagged that the real photo set
  isn't in the repo yet — build against a placeholder set (D-08).
- **Results & finals:** author sees a waiting state, no partial numbers (D-09); ranked results
  list with staggered reveal and shared rank for ties (D-10); plain final winner + scoreboard, no
  effects layer scoped here (D-11).
- **Playtest:** a lightweight 2-phone real-device playtest at the end of this phase's execution,
  folding in what would have been Phase 3's checkpoint (D-12).

## Deferred ideas

- Meme compositor / download-share flow — already Phase 5.
- Host break-glass controls — already Phase 6.
- Confetti/celebration effects on final screen.
- Fairness-adjusted scoring (average / floor) — revisit only if the D-12 playtest surfaces it as
  a real problem.

## Claude's discretion (left open for research/planning)

- Photo-pool data structure shape on `Room`.
- How the writing screen wires into the existing Phase 2 snapshot contract.
- Best-of-night tracking: running array vs. computed-at-end.
- Test strategy (follow existing `server/test/` conventions).
- Exact placeholder photo set (count/format) until real Tamir photos are supplied.
