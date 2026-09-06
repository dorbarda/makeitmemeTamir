# Project Research Summary

**Project:** Tamir Meme Party
**Domain:** Real-time, browser-based, mobile-first, Hebrew/RTL party game (caption-and-vote genre), single one-night live event
**Researched:** 2026-09-05
**Confidence:** MEDIUM-HIGH

## Executive Summary

This is a Jackbox/Quiplash-style caption-and-vote party game (photo -> free-text Hebrew caption -> anonymous crowd vote -> scoring), built for a single live event with 10-15 phones in one room, on a hard one-week deadline where reliability outranks every other quality. All four research streams converge on the same architecture: a single Node/Express process running Socket.IO holds all room state in memory (no database, no Redis -- there is exactly one room, one event, no persistence requirement), the server is the sole authority for game phase and timers, and every player is identified by an opaque session token in `localStorage` rather than a Socket.IO `socket.id` (which regenerates on every reconnect). This combination directly answers the project's hardest explicit requirement -- "a player who briefly loses connection can rejoin without breaking the game" -- and every researcher independently flagged phone screen-locking/backgrounding as the *normal* case to design for, not an edge case.

The single most important and consistent risk finding across STACK, FEATURES, ARCHITECTURE, and PITFALLS is Hebrew RTL text baked onto the downloadable meme image (the literal souvenir of the event). All four files agree that native browser Canvas 2D (`ctx.direction = 'rtl'`) is the correct approach, and that html2canvas and satori/`@vercel/og` are actively broken for Hebrew and must not be used. PITFALLS.md is meaningfully more cautious than the others here: it warns that even the native canvas `direction` property is not guaranteed to correctly reorder *mixed* Hebrew+digit+Latin runs (a documented class of canvas bidi bug going back years in Firefox and other engines), and recommends pre-processing captions through a bidi-reordering library (`bidi-js`) or explicit Unicode directional isolate characters before drawing, rather than trusting `ctx.direction` alone on realistic input. This is carried forward below as a mandatory early spike using messy, realistic captions (Hebrew + numbers + punctuation + an English word), not a single clean test word -- treated as a go/no-go gate for the entire "downloadable meme" requirement, ideally resolved by day 2 of the build.

The second major risk area is hosting: free tiers that don't reliably hold a persistent WebSocket connection, or that sleep/cold-start mid-party and wipe in-memory game state. This is flagged below as an explicit **open decision requiring human verification** rather than resolved by this summary, because STACK.md and PITFALLS.md directly disagree on Render's current free-tier WebSocket support (see "Gaps to Address"). Beyond hosting, the build-order risk is well-agreed: the temptation on a "fun, visual" project like this is to build caption UI and scoreboard polish before the unglamorous plumbing (join/reconnect/session-token/state-machine) is solid -- every pitfall that can ruin the party live (stalled rounds, desynced timers, lost identity on reconnect) lives in the plumbing, not the polish, so the roadmap should sequence accordingly, ending in a mandatory real multi-device rehearsal at least 24 hours before the event.

## Key Findings

### Recommended Stack

React 19 + Vite for the frontend (hardcoded Hebrew strings, `dir="rtl"` set once at the root -- no i18n framework needed since Hebrew is the only language in scope), and Node/Express + Socket.IO 4.8.x for a single-process backend that also serves the built frontend as static files. Room/game state lives entirely in an in-memory JS object keyed by room code -- no database, no Redis, because it's one room, one event, one night, with no persistence requirement. `nanoid` generates short room codes and session tokens; `qrcode` renders a scannable join QR on the host's screen (removes a real friction point: typing a room code then switching keyboard layouts to type a Hebrew name, ~12 times at once). Heebo/Assistant (self-hosted via `@fontsource`) are the recommended Hebrew web fonts, loaded via `import` (not a CDN `<link>`) so `document.fonts.ready` can be awaited before any canvas text draw.

**Core technologies:**
- React 19 + Vite -- fastest, lowest-friction SPA scaffold; AI coding assistance is deepest on React, which matters more than any technical edge under a one-week deadline
- Node/Express + Socket.IO 4.8.x -- rooms, broadcast-to-room, and built-in Connection State Recovery give the best power-to-effort ratio for this scale; raw WebSocket would mean hand-rolling reconnection logic, Colyseus solves a bandwidth-diffing problem this game doesn't have
- In-memory JS object (no DB) -- the entire game state fits in one process's memory for one night; a database is unneeded complexity and an extra failure point
- Native browser Canvas 2D (`ctx.direction='rtl'`) -- the only compositing path that correctly handles Hebrew RTL without a library dependency; see Critical Pitfalls below

### Expected Features

Genre mechanics (Quiplash/Fibbage-style caption+vote, not Cards-Against-Humanity's judge-picks-one model) are well-documented and consistent across independent sources. Crowd-voting (not a single judge) fits this project because a bachelor party has no natural single judge and keeps everyone engaged every round.

**Must have (table stakes):**
- Room code + QR join, name entry with duplicate rejection, host round-count picker
- Round loop: photo + Hebrew caption box + submission timer + "waiting for others" progress
- Non-submitter exclusion + minimum-submission guard (>=2 captions to hold a vote)
- Voting: anonymized/randomized captions, self-vote excluded, one vote per player, **no live tally during voting** (this is an explicit anti-feature -- showing partial results while voting is open invites bandwagon voting in a room where everyone can see everyone's phone)
- Tie handling defined as split score (no tiebreaker round -- do not build one)
- Points-per-vote scoring + running scoreboard, final winner screen, "best of the night" recap (must track top captions across ALL rounds from round 1, not retrofitted at the end)
- Meme image download with Hebrew caption drawn on the photo, RTL-verified
- Host powers: skip round, end game early, kick player, restart room
- Reconnection: persistent identity (session token, not socket ID) + server-authoritative state + full-state resync on reconnect
- Idempotent submit/vote handling (double-tap doesn't double-submit)

**Should have (competitive, add after core loop works):**
- Native share button (`navigator.share` -- "send to WhatsApp") -- cheap add-on once the image pipeline exists
- Auto-advance the instant all players submit (skip remaining timer)
- Percentage-of-votes scoring instead of raw count; join-after-game-started flow for latecomers; Screen Wake Lock during caption typing

**Defer (v2+, explicitly out of scope for this event):**
- Animated suspenseful results reveal, "play again" with persisted session, pause game, rank-change/podium animations, any account/history/multi-game persistence, live vote tally during voting (actively avoid)

### Architecture Approach

Server-authoritative finite state machine, one per room, with phases `LOBBY -> CAPTION -> VOTING -> ROUND_RESULTS -> (loop) -> FINAL_RESULTS -> BEST_OF`. Every phase transition happens server-side, driven by either a submission-completion check or a server-side timer -- clients never decide phase, they only render whatever the server broadcasts. The server pushes a **complete state snapshot** on every transition (not deltas), which is what makes reconnection trivial: a reconnecting client just receives one `state` message and is instantly correct, with zero replay/merge logic.

**Major components:**
1. Room Manager -- creates/looks up rooms by short code, holds `roomCode -> Room` in a plain in-memory `Map`
2. Room State Machine (per room) -- single source of truth for phase, round number, and server-driven timers (`setTimeout`, not client-ticking countdowns)
3. Players map (per room, keyed by stable `playerId`, never `socket.id`) -- identity, name, connection status, score
4. Photo deck (per room) -- shuffled once at game start, drawn front-to-back, no-repeat guarantee; recommend capping round count to photo count rather than reshuffling
5. Client-side Meme Compositor -- Canvas 2D draw of photo + Hebrew caption, built and tested independently of the multiplayer plumbing, only at the moment of download/share

### Critical Pitfalls

1. **Hebrew text on canvas silently renders reversed/garbled for mixed Hebrew+digit+Latin captions** -- native `ctx.direction='rtl'` handles simple Hebrew but is not guaranteed to correctly reorder mixed-direction runs; pre-process captions through `bidi-js` or explicit Unicode directional isolates if the naive approach fails on realistic test captions. Treat as a day-1/2 go/no-go spike, not an assumption.
2. **One player stalls the whole room** -- never gate phase advancement on "all players submitted" as the only path; every phase needs a hard server-authoritative timer that fires regardless of who has/hasn't submitted, with missing submissions/votes simply excluded, never blocking.
3. **Phone screen locks/backgrounds and the socket silently dies** -- treat this as the *normal* case, not an edge case; on `visibilitychange`->visible and on reconnect, always force a full state resync from the server rather than trusting continuity.
4. **Trusting client-side timers instead of the server clock** -- clients must only display `deadline - Date.now()` from a server-provided epoch timestamp; the server alone decides when a phase actually ends.
5. **Free hosting sleeps/cold-starts mid-party, wiping in-memory state** -- the single most catastrophic and avoidable failure; see the explicit open decision below on Render's free-tier WebSocket support and the recommended mitigations.

## Implications for Roadmap

### Phase 1: Room, Session, and Reconnect Skeleton
**Rationale:** ARCHITECTURE.md explicitly names this "the riskiest integration point -- build this first," since it touches every other component at once and is the single requirement most likely to embarrassingly fail live (phones lock constantly, per PROJECT.md's own stated context). Getting the shape right early prevents rework everywhere else, and PITFALLS.md independently confirms it as pitfall #1 in likelihood-and-visibility terms.
**Delivers:** Room code generation, join flow, session-token issuance/persistence (`localStorage`), reconnect resolving token -> existing player, minimal LOBBY-only state broadcast. Verified on an actual phone: lock screen, unlock, land back in the same room with the same name/score.
**Addresses:** Room code + QR join, name entry with duplicate rejection (FEATURES.md table stakes)
**Avoids:** Socket.id-as-identity anti-pattern; refresh/rage-quit losing player state (Pitfall 5)

### Phase 2: Server-Authoritative Round State Machine (placeholder content)
**Rationale:** Prove phase transitions and server-driven timers work correctly -- including reconnecting mid-phase rendering the correct current phase -- before any real gameplay content exists. This isolates the state-machine correctness question from photo/caption/scoring complexity.
**Delivers:** LOBBY/CAPTION/VOTING/RESULTS phases with placeholder content, server-driven timers (never client-ticking), full-snapshot broadcast pattern.
**Addresses:** Host round-count picker, submission timer, "waiting for others" progress
**Avoids:** Client-side-timer desync (Pitfall 8), stalled-round-on-non-responder (Pitfall 4)

### Phase 3: Photo Deck, Caption Submission, Anonymized Voting, Scoring
**Rationale:** With the reconnect skeleton and FSM proven, wire in real gameplay data -- this is where the genre-specific mechanics (anonymized captions, self-vote exclusion, tie handling, scoring) live, and they depend on Phase 1/2's identity and phase-transition primitives being solid.
**Delivers:** Photo deck with no-repeat draw, caption submission -> server-side anonymize/shuffle -> voting -> scoring, race-condition-safe synchronous mutation of in-memory state.
**Addresses:** Full round loop table-stakes features, minimum-submission guard, idempotent submit/vote
**Avoids:** Race conditions on simultaneous submit (Pitfall 9), a player seeing whose caption is whose (self-vote/anonymity failure)

### Phase 4: Round Loop, Final Results, Best-of-Night
**Rationale:** Repeat-N-rounds looping, final winner screen, and best-of recap all depend on Phase 3's per-round scoring existing and on "top captions across all rounds" bookkeeping having been tracked from round 1 (not retrofittable).
**Delivers:** Multi-round looping, running scoreboard, final winner screen, best-of-night recap.
**Addresses:** Running scoreboard, final winner, best-of-night (all explicit PROJECT.md requirements)

### Phase 5: Hebrew RTL Meme Compositor (can run in parallel with Phase 3/4)
**Rationale:** This has no dependency on the multiplayer plumbing -- only on having a photo + caption text pair to render -- so it can and should be built as an isolated spike in parallel by a second work stream, starting as early as day 1-2, specifically because it is the one silent, invisible-until-tested failure mode central to the product's core deliverable (the downloadable meme is the literal souvenir).
**Delivers:** Client-side Canvas 2D compositor with `ctx.direction='rtl'`, verified against real messy Hebrew captions (digits + punctuation + a Latin word), plus the iOS-specific save/share flow (`navigator.share` with file, falling back to long-press-save).
**Uses:** Native Canvas 2D API, Heebo/Assistant self-hosted fonts, `bidi-js` as fallback if native `ctx.direction` proves insufficient on mixed-direction test strings
**Implements:** Meme Compositor component (client-only, never server-side -- avoids `node-canvas`/Cairo native-dependency install risk on constrained hosting)

### Phase 6: Host Recovery Powers + RTL UI Hardening
**Rationale:** Once the core loop and compositor both exist, layer in the "break glass" tools and sweep the rest of the interface for RTL correctness (logical CSS properties, not physical left/right) -- these are cheap, mostly additive, and best done once there's a working game to harden rather than earlier when phases are still shifting.
**Delivers:** Host panel (skip round, end game, kick player, restart room), full-app RTL pass (logical properties, `dir="rtl"` from root, tested by reading every screen aloud in Hebrew on a real phone).
**Addresses:** All four host-power table stakes; RTL layout mirroring (Pitfall 7)

### Phase 7: Deployment/Hosting + Warm-Keeping
**Rationale:** Decided and configured well before rehearsal, not on the day of -- hosting choice has its own open decision (see below) that must be resolved with a live pricing/terms check, and the warm-keeping/cold-start mitigation needs to be tested against the actual chosen platform's real idle-sleep window.
**Delivers:** Deployed single-process app on the chosen host, warm-keeping mechanism (external pinger or manual pre-party wake), frozen-deploy policy during the event window.
**Avoids:** Free-tier sleep/cold-start wiping game state mid-party (Pitfall 10) -- see Gaps below

### Phase 8: Full Multi-Device Rehearsal
**Rationale:** Non-negotiable given the one-shot, fixed-date nature of the event. Must run at least 24 hours before the party so there is time to fix what breaks -- this is the only way most of the pitfalls above (backgrounding, weak WiFi, late join, duplicate names, race conditions, RTL rendering, cold-start timing) get verified under real conditions instead of assumed.
**Delivers:** A pass/fail run against the full rehearsal protocol in PITFALLS.md (10+ real phones, mixed iOS/Android, mixed WiFi/mobile-data, deliberate lock-screen/refresh/late-join/duplicate-name/simultaneous-submit/cold-start tests).

### Phase Ordering Rationale

- Plumbing before polish: every researcher independently warns against building the visually rewarding parts (caption UI polish, scoreboard animations) before the unglamorous foundation (join/reconnect/state-machine), because 100% of the party-night failure risk lives in the plumbing.
- The Hebrew-canvas spike is pulled forward and run in parallel specifically because it's invisible-until-tested and would be catastrophic to discover on day 6-7 -- it has no dependency on the multiplayer plumbing, so parallelizing it doesn't block anything else.
- Hosting and rehearsal are pushed to the end deliberately but with enough runway (rehearsal at least 24 hours before the event, hosting decided days earlier) -- both need to be tested against real, current, possibly-idle conditions that can't be simulated during active development.
- "Best of the night" bookkeeping is called out explicitly to start in Phase 3, not Phase 4, per FEATURES.md/ARCHITECTURE.md's shared warning that retrofitting top-N-across-rounds tracking after the fact means reconstructing history that was never stored.

### Research Flags

Needs research/deeper verification during planning:
- **Phase 5 (Meme Compositor):** PITFALLS.md's caution about mixed-direction bidi reordering on canvas is more conservative than STACK/ARCHITECTURE's "just set `ctx.direction='rtl'`" -- this phase should be planned with a `--research-phase` pass or at minimum a scripted, photographed verification of a real messy Hebrew+digit+Latin caption before building anything on top of it.
- **Phase 7 (Hosting):** Direct contradiction between STACK.md and PITFALLS.md on Render's free-tier WebSocket support (see Gaps) -- verify against Render's current terms before committing to this phase's plan.
- **iOS Safari save/share flow (part of Phase 5):** Rated LOW confidence in STACK.md due to version-specific WebKit behavior; needs a real on-device smoke test on an actual iPhone in Safari, not just implementation from documentation.

Phases with standard, well-documented patterns (skip deep research):
- **Phase 1, 2, 3, 4 (core multiplayer loop):** Server-authoritative FSM + session-token reconnection + full-state-snapshot broadcast are all standard, well-established real-time architecture patterns cross-verified against Socket.IO's own official docs -- implementation guidance in ARCHITECTURE.md is concrete and directly actionable.
- **Phase 6 (RTL UI hardening):** CSS logical-properties approach is a settled, well-documented pattern (not project-specific research needed).

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM-HIGH | Cross-verified against official docs (Socket.IO, MDN), GitHub issue trackers, and npm registry versions; hosting-tier terms explicitly flagged as changing frequently |
| Features | MEDIUM-HIGH | Genre mechanics well-documented and consistent across independent sources (Jackbox family, CAH clones); project-specific numbers (timer lengths) are judgment calls, not verified facts |
| Architecture | MEDIUM | Patterns are well-established real-time systems practice; iOS Safari and RTL canvas specifics cross-checked against multiple sources but carry inherent platform-version uncertainty |
| Pitfalls | MEDIUM | Cross-verified platform/browser behavior against Bugzilla/WebKit/Socket.IO GitHub issues; hosting tier limits explicitly noted as changing often and checked against current 2026 sources |

**Overall confidence:** MEDIUM-HIGH for the multiplayer architecture and genre feature set; MEDIUM (with one explicit unresolved contradiction) for hosting; MEDIUM for the exact severity of canvas bidi bugs on mixed Hebrew+digit+Latin text, which is why it's scoped as a mandatory early spike rather than assumed to work from documentation alone.

### Gaps to Address

- **OPEN DECISION -- Render free-tier WebSocket support (requires human verification before deployment, do not resolve by fiat):** STACK.md states Render's free web service IS the only genuinely free host that supports persistent WebSockets, with a 15-minute idle spin-down (~1 minute wake) mitigated by manually waking the server ~10 minutes before the party. PITFALLS.md states the opposite conclusion from its own research pass -- that Render's free tier "does not reliably support persistent WebSocket connections... at all (long-lived connections are effectively a paid-plan feature there)" -- and recommends budgeting a small paid tier (Render's cheapest paid plan, or a $5/mo Railway/Fly.io plan) for event week as insurance. Both files independently rated their own hosting findings only MEDIUM confidence and both explicitly noted that hosting-tier terms change frequently and should be re-checked close to the event. **This must be verified against Render's current live pricing/docs pages before Phase 7 is planned or executed** -- do not assume either finding is current. Given the cost of being wrong is losing the entire game mid-party, the safe default is: verify early (days, not hours, before the event), and be willing to pay a small amount for event week if there is any doubt about free-tier WebSocket reliability, rather than betting the party on a free tier's exact current terms.
- **Hebrew+digit+Latin bidi reordering on canvas:** STACK.md and ARCHITECTURE.md present `ctx.direction='rtl'` as sufficient; PITFALLS.md is more cautious, citing longstanding Firefox/Bugzilla reports of canvas RTL text drawing backwards and warning that canvas text drawing does not reliably run the full Unicode Bidi Algorithm on mixed-direction runs the way browser DOM text layout does. Carry PITFALLS.md's caution forward: the Phase 5 spike must test with a real, messy caption (e.g. a Hebrew phrase mixed with a number and an English name), not a single clean Hebrew word, and `bidi-js` (or explicit Unicode directional isolate characters, LRI/RLI/PDI) should be the documented fallback if the native `ctx.direction` approach visibly fails on that test string.
- **iOS Safari meme download/share flow:** Rated LOW confidence by STACK.md specifically due to version-dependent WebKit `download`-attribute and Web Share API file-sharing behavior; needs a manual on-device smoke test on a real iPhone in Safari well before the rehearsal, not an assumption from documentation.
- **Venue WiFi conditions:** No researcher can predict the actual venue's WiFi quality; PITFALLS.md's mitigation (design for idempotent/order-tolerant events, encourage mobile data as a fallback, test under simulated congestion during rehearsal) should be treated as the working plan, verified at the Phase 8 rehearsal rather than resolved in advance.

## Sources

### Primary (HIGH confidence)
- Socket.IO official docs -- Tutorial: Handling disconnections; Connection state recovery (explicitly does not survive server crash/restart)
- MDN -- `CanvasRenderingContext2D.direction`

### Secondary (MEDIUM confidence)
- GitHub -- `niklasvh/html2canvas` issues #2488, #948, #686, #289 (RTL/Arabic rendering bugs, longstanding and unresolved)
- GitHub -- `vercel/satori` PR #745 (Hebrew/Arabic RTL support, unmerged as of April 2026)
- Bugzilla #402276 (Firefox: canvas text routines draw right-to-left text backwards), #1286659 (bidi-override in Canvas 2D)
- Render official docs (render.com/docs/free) and multiple independent 2026-dated comparison articles on Render/Railway/Fly.io/Vercel/Netlify free-tier and WebSocket status -- flagged in both STACK.md and PITFALLS.md as reaching different conclusions on Render specifically; see Gaps to Address above
- Cloudflare Workers changelog (Durable Objects on Free plan, April 2025); PartyKit/Cloudflare acquisition coverage (April 2024)
- Apple Developer Forums / WebKit Bugzilla #167341 -- iOS Safari `download` attribute and Web Share API file-sharing behavior
- Jackbox Games Wiki (Quiplash series), independent critical-play write-ups on Quiplash/Fibbage genre mechanics
- Google Fonts specimen pages (Heebo, Assistant, Noto Sans Hebrew)

### Tertiary (LOW confidence)
- Apple Developer Forums / WebKit bug tracker threads on iOS-version-specific `download`/Web Share behavior -- explicitly flagged as needing a manual on-device smoke test, not settled fact
- General domain/professional pattern knowledge in PITFALLS.md and ARCHITECTURE.md, cross-checked against sources above where verifiable but not independently sourced

---
*Research completed: 2026-09-05*
*Ready for roadmap: yes*
