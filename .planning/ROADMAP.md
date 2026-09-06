# Roadmap: Tamir Meme Party

## Overview

One week, one shot, one party. The build follows a horizontal-layer structure — session/identity,
then the server-authoritative round engine, then full gameplay features, then hardening, then
deployment and testing — because that is the structure the user explicitly chose for this project.
Layer-by-layer means nothing is fully playable until partway through the build, so a single
thin, real-phones, end-to-end checkpoint (Phase 3) is placed as early as the layers allow: it
proves join → write a caption → rate memes one-at-a-time → score actually works before any of the
fuller feature set or polish is layered on top. The Hebrew RTL meme compositor (Phase 5) is pulled
out as its own early, parallel spike because it is a silent, invisible-until-tested risk to the
literal souvenir of the night, and it has no dependency on the multiplayer plumbing. The last three
phases are deliberately kept separate and sequential — deploy, then a scripted capacity test, then
a small real-phone rehearsal — because the party is a surprise and the user explicitly asked that
the scripted load test never be merged with the real-guest-adjacent rehearsal.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Room, Session & Reconnect Foundation** - Players can create/join a room by code or QR with a unique name, see who's in the room live, and survive a phone lock or refresh without losing identity or score
- [ ] **Phase 2: Server-Authoritative Round Engine** - The server owns every phase's clock so the game never freezes on a missing or slow player
- [ ] **Phase 3: Core Loop Checkpoint (Real Phones, End-to-End)** - A full round of write-a-caption, rate memes one-at-a-time, and score is proven working on real phones before deeper features are built
- [ ] **Phase 4: Full Round, Rating & Scoring Completion** - The complete round loop ships: no-repeat photos, photo swap, cannot-rate-own-meme with hidden ratings until each meme's step closes, ranked round results, running score totals, final winner, and best-of-night
- [ ] **Phase 5: Hebrew RTL Meme Compositor & Souvenir** - Players can produce and keep a correctly rendered, right-to-left Hebrew meme image as their souvenir
- [ ] **Phase 6: Host Controls & RTL Interface Hardening** - The host has recovery tools for live mishaps, and the whole interface reads correctly in Hebrew on iPhone and Android
- [ ] **Phase 7: Deployment & Hosting** - The game is live on a public URL, on a hosting choice verified to hold persistent connections, with Tamir's photos loaded
- [ ] **Phase 8: Load & Capacity Verification** - A scripted test proves the server holds 12+ simultaneous players through a full game, without involving real guests
- [ ] **Phase 9: Real-Device Rehearsal** - A small group on real phones proves the join flow, Hebrew keyboards, and the iPhone save flow at least 24 hours before the party

## Phase Details

### Phase 1: Room, Session & Reconnect Foundation

**Goal**: Ten-plus friends can join a room by code or QR with a unique display name, see a live roster of who's in the room, and survive a phone lock, refresh, or brief disconnect without losing their identity or score. This is the riskiest integration point in the whole project and is built and phone-tested before anything else.
**Depends on**: Nothing (first phase)
**Requirements**: LOBBY-01, LOBBY-02, LOBBY-03, LOBBY-04, LOBBY-05, LIVE-02
**Success Criteria** (what must be TRUE):

  1. Host can create a room and receive a short join code plus a scannable QR code that leads to the same room
  2. A player can join by tapping a shared link (or entering the 4-digit room code) and a display name, with no signup or password, and a duplicate display name is automatically numbered rather than rejected, so nobody is ever blocked from joining
  3. Every player who has joined appears in a live-updating roster visible to everyone else in the room
  4. A player who locks their phone, refreshes the page, or briefly disconnects rejoins the same room afterward with their same name and score intact — verified on a real phone, not just a browser tab

**Plans**: 4 plans

Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Greenfield scaffold, shared wire contract, and the end-to-end create/join/roster/reconnect tracer slice

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02-PLAN.md — Free-text names: grapheme-aware limits, auto-numbered duplicates, lobby rename, capacity cap

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 01-03-PLAN.md — Ways in: WhatsApp join link, QR code, manual 4-digit fallback, and the live lobby screen

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 01-04-PLAN.md — Resilience: grace-delayed roster fade, automatic host transfer, and full resync on every return

### Phase 2: Server-Authoritative Round Engine

**Goal**: The server is the sole authority over game phase and timing, so no single player's actions, absence, or slow connection can freeze the room for everyone else. Built and proven with placeholder round content before real photos or scoring exist, isolating state-machine correctness from gameplay complexity.
**Depends on**: Phase 1
**Requirements**: LOBBY-06, LOBBY-07, ROUND-04, ROUND-05, VOTE-04, LIVE-03
**Success Criteria** (what must be TRUE):

  1. Host can choose how many rounds the game will run and start the game once players have joined
  2. The writing phase always ends when its countdown reaches zero, whether or not everyone has submitted
  3. Each meme's rating step — revealed one at a time — closes on its own server-owned countdown, regardless of how many players have rated it
  4. While writing is open, players see only a submission-progress count (e.g. "8 of 12") — never other players' content before the round closes
  5. A round or a rating step never stalls indefinitely because one player left, disconnected, or simply never responded

**Plans**: 5 plans

Plans:
**Wave 1**

- [ ] 02-01-PLAN.md — Wire contract, timing constants, and the end-to-end tracer: the server runs the whole round clock by itself

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 02-02-PLAN.md — Host settings: preset-only rounds/writing/rating lengths, server-side validation, and the lock at game start

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 02-03-PLAN.md — The writing phase: captions in, progress-only visibility, and a deadline that only ever moves earlier

**Wave 4** *(blocked on Wave 3 completion)*

- [ ] 02-04-PLAN.md — One meme at a time: the submission-derived rating rotation and its per-step server clock

**Wave 5** *(blocked on Wave 4 completion)*

- [ ] 02-05-PLAN.md — Closing the loop: too-few-captions skip, round and game end, and the never-stalls battery

### Phase 3: Core Loop Checkpoint (Real Phones, End-to-End)

**Goal**: A complete round of write-a-caption, one-at-a-time meme rating, and score works for real players on real phones, proving every layer built so far actually connects, before the fuller feature set or any polish is layered on top. This is the early integration checkpoint the horizontal-layer structure needs, run well before the final phases.
**Depends on**: Phase 1, Phase 2
**Requirements**: ROUND-01, ROUND-03, VOTE-01, VOTE-02, SCORE-01, SCORE-03
**Success Criteria** (what must be TRUE):

  1. Every player receives their own photo of Tamir and can type and submit a Hebrew caption within the round's countdown
  2. After writing closes, that round's memes are revealed one at a time — the same meme on every player's screen at once — and each player rates the meme currently on screen on the three-point scale (3/2/1)
  3. Each player's round score is the sum of the ratings their own meme received, and a running scoreboard updates after the round
  4. This full loop — join, write, rate meme-by-meme, score — has been played start-to-finish on at least two distinct real phones with no stalls, crashes, or desyncs

**Plans**: TBD

### Phase 4: Full Round, Rating & Scoring Completion

**Goal**: The round loop and endgame reach the complete game spec: no repeated photos across the game, a one-time photo swap, a meme's author correctly excluded from rating their own meme with a waiting state while it's on screen, individual ratings kept fully hidden until each meme's rating step closes, a round results screen that ranks that round's memes by total points, round scores accumulating into a running game total, and proper final/best-of screens. Built on top of the proven Phase 3 checkpoint.
**Depends on**: Phase 3
**Requirements**: ROUND-02, ROUND-06, VOTE-03, VOTE-05, VOTE-06, SCORE-02, SCORE-04, MEME-02
**Success Criteria** (what must be TRUE):

  1. No player sees the same photo twice in a single game, and a player can swap their assigned photo for a different one exactly once per round before submitting
  2. A meme's author cannot rate their own meme and instead sees a waiting state while it is on screen; every other player's individual rating for that meme stays hidden while it is being rated
  3. Once a meme's rating step closes, its total score is revealed, and once every meme in the round has been rated, the round results screen ranks all of that round's memes by total points
  4. Each round's score accumulates into a running game total, and a final winner screen appears once the last round ends
  5. A "best of the night" screen shows the highest-scoring memes from across the whole game, tracked from round one rather than reconstructed at the end

**Plans**: TBD
**UI hint**: yes

### Phase 5: Hebrew RTL Meme Compositor & Souvenir

**Goal**: Every player can produce and keep a correctly rendered, right-to-left Hebrew meme image as the literal souvenir of the night. Treated as a go/no-go spike run in parallel with the earliest layers, since Hebrew-on-canvas rendering is invisible-until-tested and has no dependency on the multiplayer plumbing.
**Depends on**: Nothing (parallel spike — build alongside Phase 1-2, independent of the multiplayer plumbing)
**Requirements**: HEB-03, MEME-01, MEME-03
**Success Criteria** (what must be TRUE):

  1. A realistic caption mixing Hebrew, digits, and a Latin word is drawn onto the photo and reads correctly right-to-left, confirmed by visually inspecting the actual output image — not just a single clean Hebrew test word
  2. A player can save the finished meme image to their phone or share it directly, with the save/share flow specifically confirmed working on a real iPhone in Safari

**Plans**: TBD

### Phase 6: Host Controls & RTL Interface Hardening

**Goal**: The host has break-glass recovery tools to keep the party moving through any live mishap, and the entire interface — not just the meme image — reads correctly in Hebrew right-to-left on both iPhone and Android. Done once the full feature set from Phase 4 exists, so there's a complete game to harden rather than a moving target.
**Depends on**: Phase 4
**Requirements**: LIVE-04, LIVE-05, LIVE-06, LIVE-07, HEB-01, HEB-02
**Success Criteria** (what must be TRUE):

  1. Host can skip the current round, remove a player from the room, and end the game early to jump straight to results
  2. Host can start a fresh game with the same group of players without anyone needing to rejoin
  3. Every screen in the app reads correctly right-to-left in Hebrew, confirmed by reading each screen aloud in Hebrew word order on a real phone
  4. Typing a Hebrew caption works correctly on both a real iPhone keyboard and a real Android keyboard

**Plans**: TBD
**UI hint**: yes

### Phase 7: Deployment & Hosting

**Goal**: The game is live at a public URL, on a hosting choice whose support for persistent WebSocket connections has been verified against its current live pricing/terms (resolving the direct contradiction found in research between sources on free-tier WebSocket support), with Tamir's photos loaded and the game ready to run for the whole event without losing state mid-party.
**Depends on**: Phase 4, Phase 5, Phase 6
**Requirements**: DEPLOY-01, DEPLOY-02
**Success Criteria** (what must be TRUE):

  1. The deployed app is reachable at a public URL from a phone on mobile data and separately from venue WiFi, on a host explicitly verified (against its current docs/pricing page, not assumed from research) to reliably hold persistent WebSocket connections for the length of a game — with a decision made on paying for event week if there is any doubt
  2. Tamir's full photo set is loaded into the deployed game and available to be drawn from during rounds

**Plans**: TBD

### Phase 8: Load & Capacity Verification

**Goal**: The deployed server is proven to hold a full game with 12+ simultaneous players without degrading, using scripted or browser-tab clients rather than real guests, so room capacity is verified without any risk of revealing the surprise to the actual guest list.
**Depends on**: Phase 7
**Requirements**: DEPLOY-04, LIVE-01
**Success Criteria** (what must be TRUE):

  1. A simulated test using 12+ scripted or browser-tab clients (not real guests) completes a full game against the deployed server without crashing, hanging, or requiring a restart
  2. During that test, 12+ simultaneous players can submit captions and ratings within the same round with no submission lost and no noticeable slowdown

**Plans**: TBD

### Phase 9: Real-Device Rehearsal

**Goal**: A small group of real people on real phones proves the join flow, Hebrew keyboards on both platforms, and the iPhone save flow work end-to-end at least 24 hours before the party — kept deliberately small since the party is a surprise, and run separately from the scripted load test in Phase 8 rather than merged into one combined rehearsal.
**Depends on**: Phase 7 (Phase 8 should ideally run first for confidence, though it is not a strict blocker)
**Requirements**: DEPLOY-03
**Success Criteria** (what must be TRUE):

  1. 3-4 real phones, mixing iPhone and Android, complete the join flow and play through a short real game without confusion, errors, or a stuck screen
  2. Hebrew keyboard input is confirmed working correctly on both a real iPhone and a real Android device during that rehearsal
  3. Saving a meme to Photos is confirmed working on a real iPhone in Safari during that rehearsal
  4. The rehearsal completes at least 24 hours before the party, leaving time to fix anything that broke

**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9
(Phase 5 is built as a parallel spike alongside Phases 1-2 in practice, but is listed here in its
natural requirement-coverage position.)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Room, Session & Reconnect Foundation | 4/4 | Complete | 2026-09-06 |
| 2. Server-Authoritative Round Engine | 0/5 | Not started | - |
| 3. Core Loop Checkpoint (Real Phones, End-to-End) | 0/TBD | Not started | - |
| 4. Full Round, Rating & Scoring Completion | 0/TBD | Not started | - |
| 5. Hebrew RTL Meme Compositor & Souvenir | 0/TBD | Not started | - |
| 6. Host Controls & RTL Interface Hardening | 0/TBD | Not started | - |
| 7. Deployment & Hosting | 0/TBD | Not started | - |
| 8. Load & Capacity Verification | 0/TBD | Not started | - |
| 9. Real-Device Rehearsal | 0/TBD | Not started | - |
