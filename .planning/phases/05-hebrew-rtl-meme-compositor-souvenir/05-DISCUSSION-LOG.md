# Phase 5: Hebrew RTL Meme Compositor & Souvenir - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-07
**Phase:** 5-Hebrew RTL Meme Compositor & Souvenir
**Areas discussed:** When to build the meme, Caption source, Which photos can be edited, Caption visual style, Caption count limit

---

## When to build the meme

| Option | Description | Selected |
|--------|-------------|----------|
| After the round ends | The round's caption stays a simple text box for scoring; the drag-editor is a separate post-round/post-game step to compose a personal souvenir. Zero risk to the already-shipped scored loop. | |
| Replaces the round's caption input | The WRITING phase itself becomes the drag-editor; the composed image is what gets rated. Higher risk — touch-drag under a countdown, any bug breaks the core scored loop. | ✓ |

**User's choice:** Replaces the round's caption input.
**Notes:** User was told plainly this is the higher-risk option before choosing it. Recorded as D-01 in CONTEXT.md, with the existing PROJECT.md "revisit if Phase 5 timing gets tight" row as the documented escape hatch.

---

## Caption source

| Option | Description | Selected |
|--------|-------------|----------|
| Starts from their submitted caption, editable | Editor opens pre-filled with the already-submitted rated text, then more boxes can be added. | ✓ (selected before the "replaces" answer made it moot) |
| Fully freeform, unrelated to scoring | Editor starts blank, independent of any scored text. | |

**User's choice:** "Starts from their submitted caption, editable."
**Notes:** Because the prior answer merged writing and composing into one step (D-01), there is no longer a separate pre-existing submitted caption to pre-fill from — CONTEXT.md's D-02 documents the resulting reality (first box starts empty, since writing IS the editor now) rather than re-asking.

---

## Which photos can be edited

| Option | Description | Selected |
|--------|-------------|----------|
| Only their own photos from rounds they played | Smallest scope — no question of editing someone else's caption. | |
| Also from the best-of-the-night gallery | At game end, any player can open any top-3 best-of meme (even authored by someone else) and save their own copy. | ✓ |

**User's choice:** Also from the best-of-the-night gallery.
**Notes:** Captured as D-03 — view/export only, never edits the original game data or score.

---

## Caption visual style

| Option | Description | Selected |
|--------|-------------|----------|
| Free text, semi-transparent backing | Small semi-transparent dark box behind Hebrew text, draggable as one unit, no fixed banner. | ✓ |
| Plain outlined text, no background | Classic white-text-black-outline meme look, no background box. | |

**User's choice:** Free text, semi-transparent backing.
**Notes:** Chosen for legibility across Tamir's varied photo backgrounds. Captured as D-04.

---

## Caption count limit

| Option | Description | Selected |
|--------|-------------|----------|
| Up to 3 | Enough for setup/punchline/tag without cluttering a small phone screen under time pressure. | ✓ |
| Up to 5 | More creative freedom, more overlap/clutter risk, more drag interactions to get right before the deadline. | |

**User's choice:** Up to 3.
**Notes:** Captured as D-05.

---

## Claude's Discretion

- Exact touch-drag implementation and hit-testing for overlapping caption boxes.
- Whether the composited meme is rasterized client-side at submit time (server/other viewers get a
  finished image) vs. transmitted as structured position data and rendered live by every viewer —
  the single most consequential technical call in the phase, left to research/planning.
- Minimum caption box count required to submit (defaulting to "at least one non-empty box").
- Default starting position/size for a newly added caption box.

## Deferred Ideas

None raised beyond what PROJECT.md's Out of Scope and v2 sections already track.
