# Phase 2: Server-Authoritative Round Engine - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-06
**Phase:** 2-Server-Authoritative Round Engine
**Areas discussed:** Area selection (all delegated to Claude), Timing defaults, Missing submissions

---

## Area Selection

Four gray areas were offered: Timers & early finish, Missing players, Rounds & game start, and
What players see while waiting. Alongside them, a pace choice between batching all questions and
going area by area.

| Option | Description | Selected |
|--------|-------------|----------|
| Timers & early finish | Writing length, per-meme rating length, early-close behaviour | |
| Missing players | Non-submitters and non-raters | |
| Rounds & game start | How the host picks round count | |
| What players see waiting | Progress display, countdown, interstitials | |
| Pace: Batch — all at once | All questions in one or two turns | ✓ |
| Pace: Area by area | Standard flow, check-in between areas | |

**User's choice:** Free text instead of selecting areas — *"I want you to set default settings on
your own sense based on the original make it meme game. then allow the host to modify those
settings before the game. but you go ahead set all default"*, plus **Batch** for pace.

**Notes:** The user delegated all four areas rather than picking among them, with two binding
constraints attached: defaults should feel like the original caption-and-rate party format, and
the host must be able to change them before the game starts. The second constraint is what turned
LOBBY-06 ("host chooses number of rounds") into a three-setting host panel in the lobby rather
than a single round-count control. The user also opened the session asking to stay lean on tokens
and move quickly to building, which is why the flow was compressed to two question turns total.

Rather than accept the delegation wholesale, the two calls where Claude's judgment could
reasonably have gone the other way were put back to the user as a single batched question pair
(below). The user's stated standing preference is that accurate numbers matter and uncertain ones
should be offered for validation.

---

## Timing Defaults

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, use these | 60s writing / 10s per rating step / 3 rounds. ~3.5 min per round at 12 players, ~10 min for 3 rounds. Host can change all three in the lobby, so a wrong default is a one-tap fix on the night. | ✓ |
| Shorter — keep it snappy | 45s writing / 8s per rating step. ~2.7 min per round. Better for a restless room, riskier for slow Hebrew typing on a phone keyboard. | |
| Longer — give people room | 90s writing / 15s per rating step. ~5.3 min per round, ~16 min for 3 rounds. Better captions, real risk the room gets restless. | |

**User's choice:** Yes, use these — 60s writing, 10s per rating step, 3 rounds default.

**Notes:** Presented with the arithmetic shown rather than as bare numbers, since total round
length (not per-step correctness) was already flagged in STATE.md as the real risk of a round
dragging. Claude stated explicitly that these are set in the spirit of the reference game, not
copied from it — its actual timer values are not known to a confidence worth encoding, and
PROJECT.md forbids taking anything from that site regardless.

---

## Missing Submissions

| Option | Description | Selected |
|--------|-------------|----------|
| Skip them | No meme in the rotation for a player who never submitted. No dead air rating a blank image; the round self-shortens as people drop, which is the LIVE-03 behaviour wanted. | ✓ |
| Empty meme still rated | Their photo enters the rotation with no caption. Keeps rating steps exactly equal to player count (predictable timing) at the cost of the room spending 10 seconds rating a blank. | |

**User's choice:** Skip them.

**Notes:** The consequence was recorded in CONTEXT.md as D-08 because it is easy to get wrong
downstream — the number of rating steps equals the number of *submissions*, not the number of
players, and the engine must not assume those are the same. A related edge case was decided by
Claude without asking (D-09): a round with fewer than two captions skips the rating phase
entirely, since a lone caption cannot be rated by anyone — its only possible rater is its author,
who is barred.

---

## Claude's Discretion

The user handed back every remaining decision ("you go ahead set all default"). Claude set, and
locked in CONTEXT.md:

- Host settings panel in the lobby, preset buttons only, no free text or sliders (D-01, D-02)
- Read-only settings visible to non-host players (D-03)
- Settings lock at game start, mirroring the Phase 1 name-lock (D-05)
- Early finish collapses rather than cuts, and the clock may only ever shorten (D-07)
- Non-raters cast nothing; no default rating value is invented (D-10)
- Fixed 2s between memes / 3s between phases, deliberately not exposed as settings (D-11)
- Absolute deadline timestamp in the snapshot, client counts down locally (D-12)
- Count plus per-name checkmarks during writing; no caption text leaves the server before the
  round closes (D-13, D-14)
- Countdown always visible, urgent in the last 10 seconds (D-15)

Left genuinely open for research and planning: the round state machine's shape, clock-skew
correction, what the Phase 2 placeholder content is, how `RoomPhase` is expanded, where the host
settings live on the server, and the timer test strategy.

## Deferred Ideas

- Host controls acting *during* a running game — skip round, remove player, end early. Phase 6.
- Changing round count or timers mid-game. Same reason.
- How a round score is computed when some eligible raters never rated. Phase 4 — flagged in D-10
  because the roadmap's current "sum of ratings received" wording interacts badly with D-10, and
  the engine must capture enough data for Phase 4 to choose either way without a rework.
- Funny Hebrew tier names for the 3 / 2 / 1 scale. Already a STATE.md todo for Phase 3/4; the
  placeholder engine does not need them.
- Per-player adaptive timers. Not raised by the user; noted only because the fixed presets rule it
  out for now.
