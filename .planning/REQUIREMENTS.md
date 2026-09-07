# Requirements: Tamir Meme Party

**Defined:** 2026-09-05
**Core Value:** Ten-plus friends in the same room can all join on their phones and play a full game of write-a-caption-and-vote in Hebrew without anyone getting stuck, disconnected, or confused.

## v1 Requirements

Requirements for the party night. Each maps to a roadmap phase.

### Lobby

- [ ] **LOBBY-01**: Host can create a game room and receive a short join code
- [ ] **LOBBY-02**: Join code is also shown as a QR code players can scan
- [ ] **LOBBY-03**: Player can join a room by entering the code and a display name — no signup, no password
- [ ] **LOBBY-04**: Duplicate display names are prevented so players can tell each other apart
- [ ] **LOBBY-05**: All players see the live list of who has joined the room
- [ ] **LOBBY-06**: Host can choose the number of rounds before starting
- [ ] **LOBBY-07**: Host can start the game when everyone has joined

### Round Loop

- [x] **ROUND-01**: Each round, every player receives their own photo of Tamir to caption
- [x] **ROUND-02**: No photo repeats within a single game
- [x] **ROUND-06**: A player can swap their photo for a different one once per round, before submitting a caption
- [ ] **ROUND-03**: Player writes a Hebrew caption for their photo within a visible countdown
- [ ] **ROUND-04**: The server owns the countdown and advances the round when time expires, regardless of who has submitted
- [ ] **ROUND-05**: Players see submission progress only (e.g. "8 of 12 submitted") — never other players' captions before the round closes

### Rating

- [ ] **VOTE-01**: After the writing phase, the round's memes are revealed one at a time, the same meme on every player's screen at once
- [ ] **VOTE-02**: Every player rates the meme currently on screen on a three-point scale — 3 (funniest), 2 (fine), 1 (meh). The three tiers get funny Hebrew names, decided during phase planning
- [ ] **VOTE-03**: A player cannot rate their own meme and sees a waiting state while their meme is on screen
- [ ] **VOTE-04**: Each meme's rating step has a server-owned countdown and advances on time regardless of who has rated
- [ ] **VOTE-05**: Individual ratings stay hidden while a meme is being rated; that meme's total is revealed only once its step closes
- [ ] **VOTE-06**: A round results screen ranks all of the round's memes by total points

### Scoring

- [ ] **SCORE-01**: A player's score for a round is the sum of the ratings their meme received from all other players
- [ ] **SCORE-02**: Round scores accumulate into a running total across the whole game
- [ ] **SCORE-03**: A running scoreboard is shown between rounds
- [ ] **SCORE-04**: A final winner screen is shown at the end of the game

### Memes & Souvenirs

- [ ] **MEME-01**: A meme image is produced with the Hebrew caption drawn onto the photo, laid out right-to-left correctly
- [ ] **MEME-02**: A "best of the night" screen shows the highest-voted memes from the whole game
- [ ] **MEME-03**: A player can save a meme to their phone or share it

### Hebrew

- [ ] **HEB-01**: The entire interface is in Hebrew with correct right-to-left layout
- [ ] **HEB-02**: The caption input works correctly with Hebrew mobile keyboards on both iPhone and Android
- [ ] **HEB-03**: Captions mixing Hebrew with numbers or English render correctly on the meme image — verified with realistic captions, not a single test word

### Live Reliability

- [ ] **LIVE-01**: At least 12 players can play in one room simultaneously without degradation
- [ ] **LIVE-02**: A player's identity survives a phone lock, a page refresh, or a brief disconnect — they rejoin the game in progress with their score intact
- [ ] **LIVE-03**: The game never stalls waiting for a player who has left, disconnected, or stopped playing
- [ ] **LIVE-04**: Host can skip the current round
- [ ] **LIVE-05**: Host can remove a player from the room
- [ ] **LIVE-06**: Host can end the game early and jump to the results
- [ ] **LIVE-07**: Host can start a fresh game with the same group without everyone rejoining

### Deployment

- [ ] **DEPLOY-01**: The game is deployed to a public URL reachable from any phone on mobile data or venue WiFi
- [ ] **DEPLOY-02**: Tamir's photo set is loaded into the game
- [ ] **DEPLOY-03**: A rehearsal is completed with 3-4 real phones at least 24 hours before the party, covering the join flow, Hebrew keyboards on both iPhone and Android, and saving a meme on a real iPhone (kept small deliberately — the party is a surprise)
- [ ] **DEPLOY-04**: A simulated load test proves the server holds 12+ concurrent players through a full game, using scripted or browser-tab clients rather than real guests, so room capacity is verified without revealing the surprise

## v2 Requirements

Deferred. Tracked but not in the current roadmap.

### Presentation

- **PRES-01**: Shared TV / laptop host screen showing photos, captions and scores to the room
- **PRES-02**: Sound effects and music cues between phases

### Social

- **SOCL-01**: Players can join mid-game and be dealt in from the next round
- **SOCL-02**: Emoji reactions on memes during the results screen
- **SOCL-03**: Player avatars or profile pictures

### Content

- **CONT-01**: Uploading new photos through the interface rather than bundling them
- **CONT-02**: A dedicated final "groom round" with a special photo set

## Out of Scope

Explicitly excluded, with reasons, to prevent scope creep during a one-week build.

| Feature | Reason |
|---------|--------|
| Real accounts, email signup, passwords | The game lives for one night; any signup friction loses players at the door |
| Public lobbies or matchmaking with strangers | This is a private party room for one guest list |
| In-game chat | Everyone is in the same physical room and can simply talk |
| Multiple game modes | One loop built well beats three built badly in a week |
| Persistent history of past games | Memes are downloaded on the night; nothing needs to outlive the party |
| Any language other than Hebrew | Every player speaks Hebrew; translation is pure cost |
| A bonus for rating with the crowd | Considered and dropped — points come only from the ratings your own meme receives |
| A database | State lives in memory for a single-room, single-night event |
| Copying makeitmeme.com's code, artwork, fonts or branding | Original implementation and assets only; only the general game format is shared |
| Showing ratings while a meme is still being rated | Everyone can see each other's phones; visible tallies would cause copycat rating |

## Traceability

Which phases cover which requirements. Populated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| LOBBY-01 | Phase 1 | Pending |
| LOBBY-02 | Phase 1 | Pending |
| LOBBY-03 | Phase 1 | Pending |
| LOBBY-04 | Phase 1 | Pending |
| LOBBY-05 | Phase 1 | Pending |
| LOBBY-06 | Phase 2 | Pending |
| LOBBY-07 | Phase 2 | Pending |
| ROUND-01 | Phase 4 (Phase 3 skipped) | Complete |
| ROUND-02 | Phase 4 | Complete |
| ROUND-03 | Phase 4 (Phase 3 skipped) | Pending |
| ROUND-04 | Phase 2 | Pending |
| ROUND-05 | Phase 2 | Pending |
| ROUND-06 | Phase 4 | Complete |
| VOTE-01 | Phase 4 (Phase 3 skipped) | Pending |
| VOTE-02 | Phase 4 (Phase 3 skipped) | Pending |
| VOTE-03 | Phase 4 | Pending |
| VOTE-04 | Phase 2 | Pending |
| VOTE-05 | Phase 4 | Pending |
| VOTE-06 | Phase 4 | Pending |
| SCORE-01 | Phase 4 (Phase 3 skipped) | Pending |
| SCORE-02 | Phase 4 | Pending |
| SCORE-03 | Phase 4 (Phase 3 skipped) | Pending |
| SCORE-04 | Phase 4 | Pending |
| MEME-01 | Phase 5 | Pending |
| MEME-02 | Phase 4 | Pending |
| MEME-03 | Phase 5 | Pending |
| HEB-01 | Phase 6 | Pending |
| HEB-02 | Phase 6 | Pending |
| HEB-03 | Phase 5 | Pending |
| LIVE-01 | Phase 8 | Pending |
| LIVE-02 | Phase 1 | Pending |
| LIVE-03 | Phase 2 | Pending |
| LIVE-04 | Phase 6 | Pending |
| LIVE-05 | Phase 6 | Pending |
| LIVE-06 | Phase 6 | Pending |
| LIVE-07 | Phase 6 | Pending |
| DEPLOY-01 | Phase 7 | Pending |
| DEPLOY-02 | Phase 7 | Pending |
| DEPLOY-03 | Phase 9 | Pending |
| DEPLOY-04 | Phase 8 | Pending |

**Coverage:**

- v1 requirements: 40 total
- Mapped to phases: 40
- Unmapped: 0 ✓

---
*Requirements defined: 2026-09-05*
*Last updated: 2026-09-05 after roadmap revision (voting/scoring mechanic changed to one-at-a-time per-meme rating, bonus dropped; VOTE-06 added and mapped to Phase 4; 40/40 requirements mapped across 9 phases)*
