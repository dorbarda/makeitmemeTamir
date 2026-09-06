# Phase 3: Core Loop Checkpoint (Real Phones, End-to-End) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-06
**Phase:** 3-Core Loop Checkpoint (Real Phones, End-to-End)
**Areas discussed:** Photos, Tier names, Scoreboard

---

## Photos

| Option | Description | Selected |
|--------|-------------|----------|
| Send them now | User sends photos, Claude wires them in before the phone test | ✓ (attempted) |
| Build with placeholders, swap later | Placeholder images now, real photos before the phone test | |

**What actually happened:** User asked "where should i put them?" — revealing they expected to
place the files themselves rather than attach them in chat. Claude proposed `client/public/tamir-photos/`
(Vite copies it verbatim into the served build, no server code needed) and invited a chat attachment.

User then attached 6 photos directly in the conversation. Claude discovered a genuine environment
limitation: chat-attached images are visible to the model but their bytes are not accessible from
the Bash/filesystem tools available in this session — there is no path to copy them from. Searched
`/tmp`, `/mnt/attach`, and recently-modified files broadly; found nothing.

**Resolution:** Claude pre-created `client/public/tamir-photos/` in the repo (committed, so the path
already exists) and asked the user to upload the same photos directly via the GitHub web UI to that
folder. This is a workaround for a tooling gap, not a deliberate design choice — recorded as D-01.

## Tier Names

| Option | Description | Selected |
|--------|-------------|----------|
| Classic slang (מתוקה/סביר/חלש) | Generic Hebrew party-game slang, safe default | |
| Tamir-themed joke names | Built around Tamir himself, user supplies the joke | |
| Write all three myself | User provides the exact three phrases | ✓ |

**User's choice:** Wrote the three tier names directly via free text:
- 3 (funniest): דנה מגנזי
- 2 (fine): תמיר פטריות
- 1 (meh): תמיר בפאניקה

**Notes:** These are personal inside jokes, recorded verbatim without alteration. They replace
Phase 2 wave 4's placeholder digit labels on the rating buttons; the underlying 1/2/3 values used
for scoring math are unchanged — only the button text differs.

## Scoreboard

| Option | Description | Selected |
|--------|-------------|----------|
| Simple ranked list | Names and scores, highest first | ✓ |
| Ranked list with score change | Same list plus a "+7"-style delta for the round just played | |

**User's choice:** Simple ranked list, explicitly for build speed at this checkpoint stage.

**Notes:** The richer version remains buildable later without a data model change — the round-end
view already carries each meme's individual ratings.

## Claude's Discretion

- Exact photo-to-player assignment algorithm for a single round (random draw, no same-round
  duplicate). Cross-round no-repeat is explicitly Phase 4 (ROUND-02), not this phase's concern.
- Whether the scoreboard is a distinct screen or layered onto the existing `RoundEndPanel.tsx` —
  reuse existing infrastructure if it fits rather than building parallel screens.

## Deferred Ideas

- No-repeat photos across the whole game (Phase 4, ROUND-02)
- The one-time photo swap (Phase 4, ROUND-06)
- Round-results ranking screen (Phase 4, VOTE-06)
- Cross-game running-total finalization semantics, if they diverge from "the number the scoreboard
  shows round to round" (Phase 4, SCORE-02)
- Final winner screen (Phase 4, SCORE-04)
- "Best of the night" recap (Phase 4, MEME-02 — corrected from an initial guess of Phase 5 by
  checking REQUIREMENTS.md's traceability table directly)
- A scoreboard showing per-round score delta — considered, not chosen for this checkpoint
