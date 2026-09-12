# Phase 6: Host Controls & RTL Interface Hardening - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-07
**Phase:** 6-Host Controls & RTL Interface Hardening
**Areas discussed:** Interrupted round, Player removal, Known RTL bugs, End-game-early results, Fresh game reset

---

## Interrupted round

| Option | Description | Selected |
|--------|-------------|----------|
| Discard the round entirely | No score awarded from a round that didn't finish normally. | ✓ |
| Keep whatever was already rated | Already-rated memes still contribute their score; only unfinished parts drop. | |

**User's choice:** Discard the round entirely.
**Notes:** Captured as D-01. Chosen for simplicity under live-party pressure.

---

## Player removal

| Option | Description | Selected |
|--------|-------------|----------|
| Permanently barred | Removed name/session can't rejoin this room again. | |
| Can rejoin like a normal reconnect | Removal is a forced disconnect; they can come back with the room code like any dropped player. | ✓ |

**User's choice:** Can rejoin like a normal reconnect.
**Notes:** Captured as D-02. Matches the party's actual failure mode (phone died, stuck player) rather than adversarial moderation.

---

## Known RTL bugs

| Option | Description | Selected |
|--------|-------------|----------|
| No specific bugs noticed — do a full audit | Systematic screen-by-screen RTL check. | ✓ |
| Yes, specific issues to report | Target specific screens/issues in addition to the general audit. | |

**User's choice:** No specific bugs noticed — full audit.
**Notes:** Captured as D-05.

---

## End-game-early results

| Option | Description | Selected |
|--------|-------------|----------|
| Same winner/best-of-night screen, as-is | Reuses the exact GAME_END screen already built. | ✓ |
| Same screen plus an early-end notice | Adds messaging that the game ended early. | |

**User's choice:** Same winner/best-of-night screen, as-is.
**Notes:** Captured as D-03.

---

## Fresh game reset

| Option | Description | Selected |
|--------|-------------|----------|
| Scores reset to 0, same room code, same roster | Clean scoreboard, no rejoin needed. | ✓ |
| Keep cumulative scores across games | Running tournament total across games. | |

**User's choice:** Scores reset to 0, same room code, same roster.
**Notes:** Captured as D-04.

---

## Claude's Discretion

- Exact state-machine transition for skipping a round mid-WRITING vs. mid-RATING.
- Server-side mechanics of player removal (error codes, un-blocking rotation/MIN_SUBMISSIONS calculations for a removed player's pending submission).
- HEB-02 has no code to build beyond standard HTML input elements — it's a real-device verification item, not a feature.

## Deferred Ideas

- Cross-game running tournament totals — not chosen, each game is discrete.
- A distinct "ended early" screen/messaging — not chosen, reuses GAME_END verbatim.
- A permanent-ban concept for removed players — not chosen, removal is a forced disconnect only.
