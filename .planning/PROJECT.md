# Tamir Meme Party

## What This Is

A Hebrew-language, phone-first party game for Tamir's bachelor party. Each round every
player sees a photo of Tamir, writes a funny Hebrew caption for it, and then everyone votes
for the funniest caption. Points accumulate across rounds, a winner is crowned, and the
funniest memes of the night can be downloaded and kept.

It is built for one specific event: roughly 10-15 friends, all in the same room, each on
their own phone, joining a private room with a short code.

## Core Value

Ten-plus friends in the same room can all join on their phones and play a full game of
write-a-caption-and-vote in Hebrew without anyone getting stuck, disconnected, or confused.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Host can open a game room and get a short join code (and QR) to share
- [ ] 10+ players can join a room by entering the code and a display name — no signup, no password
- [ ] Host chooses how many rounds the game runs before starting
- [ ] Each round shows every player a photo of Tamir and a Hebrew text box to write a caption
- [ ] A player can swap their photo once per round before submitting a caption
- [ ] All submitted captions for the round are shown to every player for voting
- [ ] Players vote for the funniest caption (cannot vote for their own)
- [ ] Points are awarded per round and a running scoreboard is shown
- [ ] Final winner screen at the end of the game
- [ ] "Best of the night" screen showing the highest-voted memes from the game
- [ ] Player can download a meme as an image with the Hebrew caption drawn on the photo
- [ ] Entire interface is in Hebrew with correct right-to-left layout
- [ ] Game is deployed to a public URL that phones on any network can reach
- [ ] A player who briefly loses connection can rejoin the game in progress without breaking it
- [ ] Tamir's photo set can be loaded into the game and reused across rounds without repeats

### Out of Scope

- Real user accounts, email signup, passwords — the game lives for one night; friction kills it
- Public lobbies / matchmaking with strangers — this is a private party room only
- Chat and emoji reactions — everyone is in the same physical room and can talk out loud
- Avatars and player customisation — no time value in a one-week build
- Multiple game modes — one loop, done well, beats three half-working ones
- A shared TV / host big-screen view — decided phones-only; may return later if time allows
- Persistent history of past games — memes are downloaded on the night, then the game is done
- English or any other language — Hebrew only
- Copying makeitmeme.com's code, artwork, fonts, or branding — original implementation and
  assets only; only the general party-game format is shared

## Context

- The occasion is Tamir's bachelor party, exactly one week from project start. The date is
  fixed and cannot move, so the deadline is hard.
- Inspiration is the online game Make it Meme (makeitmeme.com): players caption a supplied
  image, then vote on each other's captions. We build our own implementation of that general
  format; we do not copy their code, assets, or brand.
- All content is photos of Tamir. The photo set already exists and is ready to be supplied.
- All players are physically together in one room. This means: latency between phones is not
  a problem, people can shout "I'm stuck!", and there is no need for chat. It also means a
  failure in front of everyone is very visible — reliability matters more than features.
- Players are ordinary phone users, not technical. Joining must be trivially easy.
- Hebrew is right-to-left. Both the interface layout and the caption text rendered onto the
  downloaded meme image must handle RTL correctly.
- Expected concurrency is small (one room, ~10-15 people) but must be genuinely simultaneous.

## Constraints

- **Timeline**: Must be playable one week from start — the party date is fixed and immovable
- **Language**: Hebrew only, full RTL support, including text rendered onto downloaded images
- **Platform**: Mobile browser first — no app install, no app store, phones of mixed makes and ages
- **Scale**: Must reliably hold 10+ simultaneous players in one room; more than that is a bonus
- **Onboarding**: No signup, no password, no email — join with a code and a name
- **Cost**: Prefer free or near-free hosting; this runs for one night
- **Legal**: Original implementation and assets only — no code, artwork, fonts, or branding
  taken from makeitmeme.com

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Phones only, no shared TV screen | Fewer moving parts to fail on the night; the whole game fits one screen size | — Pending |
| Room code + name to join, no accounts | Ten non-technical people must be in the game in under a minute | — Pending |
| Simple version of the game loop only | One week to build; the core loop is what makes the game fun | — Pending |
| Host picks the round count | Lets the game fit whatever the party mood is — one quick game or a long one | — Pending |
| Caption drawn onto the photo for download | The saved memes are the souvenir; text underneath the photo does not read as a meme | — Pending |
| Reliability prioritised over polish | If it breaks in front of 15 people the night is spoiled; a plain game that works wins | — Pending |
| Own implementation, not a copy of makeitmeme.com | Keeps the project clean legally; the game format itself is free to use | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-09-05 after initialization*
