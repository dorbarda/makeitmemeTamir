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

- [ ] **ROUND-01**: Each round, every player receives their own photo of Tamir to caption
- [ ] **ROUND-02**: No photo repeats within a single game
- [ ] **ROUND-06**: A player can swap their photo for a different one once per round, before submitting a caption
- [ ] **ROUND-03**: Player writes a Hebrew caption for their photo within a visible countdown
- [ ] **ROUND-04**: The server owns the countdown and advances the round when time expires, regardless of who has submitted
- [ ] **ROUND-05**: Players see submission progress only (e.g. "8 of 12 submitted") — never other players' captions before the round closes

### Voting

- [ ] **VOTE-01**: After the writing phase, every player sees all the memes from that round and votes for the funniest
- [ ] **VOTE-02**: A player cannot vote for their own meme
- [ ] **VOTE-03**: Vote counts stay hidden until voting closes, so nobody can copy the leader
- [ ] **VOTE-04**: Voting has a server-owned countdown and closes on time regardless of who has voted
- [ ] **VOTE-05**: Round results screen shows each meme with the votes it received

### Scoring

- [ ] **SCORE-01**: A player earns points for each vote their meme receives
- [ ] **SCORE-02**: A player earns bonus points for voting for the round's winning meme
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
| A database | State lives in memory for a single-room, single-night event |
| Copying makeitmeme.com's code, artwork, fonts or branding | Original implementation and assets only; only the general game format is shared |
| Live vote tallies during open voting | Everyone can see each other's phones; visible tallies would cause copycat voting |

## Traceability

Which phases cover which requirements. Populated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| (to be filled by roadmap) | | |

**Coverage:**
- v1 requirements: 39 total
- Mapped to phases: 0
- Unmapped: 39 ⚠️

---
*Requirements defined: 2026-09-05*
*Last updated: 2026-09-05 after initial definition*
