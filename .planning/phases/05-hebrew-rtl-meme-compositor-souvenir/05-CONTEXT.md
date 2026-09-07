# Phase 5: Hebrew RTL Meme Compositor & Souvenir - Context

**Gathered:** 2026-09-07
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers the actual meme image: a photo of Tamir with one or more Hebrew caption
boxes drawn onto it, correctly right-to-left, that a player can drag into position, then save
or share as their souvenir. Covers HEB-03, MEME-01, MEME-03.

**Architecture-changing decision made in this discussion:** the multi-caption drag editor
does not sit downstream of the existing WRITING phase as a separate "make your souvenir" step —
it REPLACES the WRITING phase's plain caption text box. The countdown, the "X of Y submitted"
progress view, and the submit action from Phases 2-4 stay exactly as built; only what happens
*inside* that countdown changes, from typing one line of text to composing the multi-caption
image directly on the photo. What every player rates during RATING, and what round results /
best-of-night show, becomes the composited meme (photo + positioned captions), not a bare
caption string.

This was explicitly the user's informed choice among two options presented, with the higher
build-risk of the two clearly stated before they chose it (see D-01). It is a bigger change to
the already-shipped Phase 2-4 rendering surfaces (RatingPanel, RoundEndPanel, GameEndPanel all
currently render `photo` + `caption` as two separate elements) than a simple "add a new screen"
phase would be — flagged here so research/planning treat this as the phase's central risk, not
an incidental detail.

</domain>

<decisions>
## Implementation Decisions

### When the meme is composed (MEME-01)
- **D-01:** The WRITING phase itself becomes the drag-editor — not a separate post-round step.
  The player composes their full multi-caption meme (photo + positioned Hebrew text boxes)
  within the existing writing countdown, and THAT composed result is what gets submitted, rated,
  and shown in round results / best-of-night. — **Reversibility:** one-way — chosen with the
  explicit tradeoff on the table (touch-drag editing under a countdown is harder to get right
  than a plain text box, and any bug here breaks the core scored loop, not just a souvenir
  feature); reverting later would mean re-splitting the editor back out into a separate
  post-round step and touching every rendering surface a second time. If Phase 5 timing gets
  tight, PROJECT.md's existing Key Decision row ("revisit if Phase 5 timing gets tight") is the
  documented escape hatch — not a silent scope cut.

### Caption source (MEME-01)
- **D-02:** There is no longer a separate "scored caption" and "souvenir caption" — since D-01
  merges the two, the caption box(es) the player drags around during WRITING ARE the submitted,
  rated content. The first caption box starts empty (there is nothing to pre-fill from anymore,
  since writing IS the editor); the player types directly into it and may add more boxes.

### Souvenir reuse from best-of-night (MEME-01/MEME-02)
- **D-03:** At GAME_END, any player can open any of the top-3 best-of-night memes — including
  ones authored by someone else — and save their own copy of that finished image. This is
  view/export only: opening someone else's meme never edits the original game data or its score;
  it only lets the viewer run the same photo+captions through their own save/share flow (D-05).
  — **Reversibility:** reversible — purely additive to `GameEndPanel.tsx`, no protocol/scoring
  changes; can be cut without touching anything else if time runs short.

### Caption visual style
- **D-04:** Each caption box renders as Hebrew text on a small semi-transparent dark backing
  (not a fixed top/bottom banner, not bare outlined text) — legible on any photo regardless of
  its background, and the whole box (text + backing) is what gets dragged as one unit.

### Caption count limit
- **D-05:** Up to 3 caption boxes per meme. Chosen over 5 to keep drag-and-drop interactions
  manageable on a small phone screen within a countdown, and to bound how cluttered/unreadable a
  rated meme can get.

### Save / Share (MEME-03)
- Per `CLAUDE.md`'s existing stack guidance (not re-litigated here): try
  `navigator.share({ files: [file] })` first for the native "Save Image" share sheet, fall back
  to a full-screen image with long-press-to-save instructions when `navigator.canShare` returns
  false. This is a locked technical approach from prior research, not a new gray area.

### Claude's Discretion
- Exact touch-drag implementation (pointer events vs a drag library) and hit-testing for
  selecting which caption box a touch targets when boxes overlap.
- Whether the composited image is rasterized once client-side at submit time (and the resulting
  PNG/data-URL is what's sent to the server and shown to everyone else), or whether structured
  caption data (text + position per box) is transmitted and each viewer's browser renders the
  same overlay live. This is the single most consequential technical decision in the phase and
  is explicitly left to research/planning — the product-level constraint from this discussion is
  only: whatever every player sees during RATING and ROUND_END must be pixel-identical to what
  the author sees while composing, and must be what gets saved/shared at the end. Font-loading
  discipline (`document.fonts.ready` before any compositing) applies regardless of which path is
  chosen, per `CLAUDE.md`.
- Minimum caption box count to submit (zero vs at least one) — a reasonable default (must have
  at least one non-empty caption box to submit, mirroring the current non-empty-caption
  validation) unless research surfaces a reason to change it.
- Default starting position/size for each new caption box when added.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project scope and requirements
- `.planning/PROJECT.md` — core value, constraints, Key Decisions (the 2026-09-07 meme editor
  scope row this phase implements, including its "revisit if timing gets tight" escape hatch)
- `.planning/REQUIREMENTS.md` — HEB-03, MEME-01, MEME-03 are this phase's requirements; MEME-01's
  entry documents the original scope lock this discussion builds on
- `.planning/ROADMAP.md` — Phase 5 goal and success criteria
- `.claude/CLAUDE.md` (Technology Stack §"Image + Text Compositing") — locked technical guidance:
  Canvas 2D API with `ctx.direction='rtl'` (not html2canvas, not satori/@vercel/og), the
  `navigator.share` → long-press-to-save fallback chain for iOS Safari, self-hosted
  `@fontsource/heebo`/`@fontsource/assistant` with a `document.fonts.ready` check before
  compositing

### What already exists (extend or restructure, do not casually rebuild)
- `client/src/screens/round/WritingPanel.tsx` — currently a plain caption `<textarea>` + submit;
  this phase replaces its core editing surface with the drag-editor while keeping its countdown,
  submit round-trip pattern (`socket.once` error/state cleanup), and swap-photo button (Phase 4)
- `client/src/screens/round/RatingPanel.tsx`, `RoundEndPanel.tsx`,
  `client/src/screens/round/GameEndPanel.tsx` — all currently render `photo` (an `<img>`) and
  `caption` (plain text) as two separate elements; this phase must update whichever of these
  render the composited meme so every viewer sees the same rendering the author composed (see
  Claude's Discretion above on the technical approach)
- `shared/protocol.ts` — `RatingStep` (`caption: string`, `photoUrl: string`), `RoundEndEntry`
  (`caption: string`, plus author/score fields), `BestOfEntry` (`caption`, `photoUrl`,
  `authorName`, `score`) all currently assume a single plain-text caption; this phase's wire
  contract changes are additive/restructuring work for the planner, not yet decided here
- `server/src/rooms/Room.ts` — `applyRoundScores`, `photoAssignments`, `photoUrlFor`, the
  submission validation pattern in the writing-phase handler this phase's new submission shape
  must follow (still server-authoritative: the server validates and is sole source of truth for
  what was submitted, exactly like every other phase)
- `client/src/index.css` — mobile-first system (16px base font, 44px tap targets, no fixed pixel
  widths); the editor's canvas/overlay must fit inside this system on a phone screen

### Playtest history worth knowing
- `.planning/phases/03-core-loop-checkpoint-real-phones-end-to-end/03-01-SUMMARY.md` and
  `.planning/phases/04-full-round-rating-scoring-completion/04-02-SUMMARY.md` — every phase so
  far has needed a real-phone check to catch visible bugs (duplicate roster, etc.); this phase's
  drag-and-drop touch interaction is the highest-risk-of-looking-fine-in-code-but-broken-on-a-
  real-phone feature built so far and should get the same real-device check before being
  considered done

No external ADRs or specs exist for this project beyond `CLAUDE.md`'s stack guidance — all other
decisions live in the files above plus this document's `<decisions>` section.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `shared/messages.ts`'s `HEBREW_UI`/`HEBREW_ERRORS` — every new string (editor instructions,
  add-caption button, save/share button labels) goes here, never inlined
- `WritingPanel.tsx`'s `Intl.Segmenter`-based grapheme counting (`toGraphemes`,
  `graphemesRemaining`, `clampCaptionForInput`) — reusable per caption box for length limits
- `WritingPanel.tsx`'s submit round-trip pattern (`socket.once(error)`/`socket.once(state)` with
  cleanup, no optimistic UI) — the new multi-caption submit event should follow the same shape

### Established Patterns
- Server is sole authority on all state — the composed meme (however it's represented on the
  wire) must be validated server-side before it becomes what's rated, exactly like every other
  submission in this project
- Absolute-deadline timestamps for anything time-bound — the editor lives inside the same
  existing WRITING countdown, no new timer needed
- No dependency currently installed for fonts or canvas work (`@fontsource/*` is not yet in
  `client/package.json`) — this phase is the first to need it

### Integration Points
- The writing-phase submit event (`CLIENT_EVENTS.submitCaption`) and its payload shape need to
  change from `{ text: string }` to something carrying multiple positioned captions — exact shape
  is planner/researcher's job
- Whatever rendering approach is chosen (Claude's Discretion above) must reach `RatingPanel`,
  `RoundEndPanel`, and `GameEndPanel` consistently — a mismatch between what the author composed
  and what a rater sees would be a visible, embarrassing bug in front of the room

</code_context>

<specifics>
## Specific Ideas

- The user was told plainly, before choosing, that replacing the writing phase's caption input
  with the full drag-editor is the higher-risk of two real options and chose it anyway — this is
  not an oversight to flag back to them, it's a deliberate, informed call already recorded in
  PROJECT.md's Key Decisions table.
- "Free text, semi-transparent backing" was chosen specifically over the classic white-outlined-
  text meme look because it reads better across Tamir's actual varied photo backgrounds.

</specifics>

<deferred>
## Deferred Ideas

- None raised beyond what PROJECT.md's Out of Scope and v2 sections already track.

</deferred>

---

*Phase: 5-Hebrew RTL Meme Compositor & Souvenir*
*Context gathered: 2026-09-07*
