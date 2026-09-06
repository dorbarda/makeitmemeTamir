# Feature Research

**Domain:** Caption-and-vote party game (Jackbox/Quiplash-style prompt→caption→vote loop; also seen in Cards Against Humanity clones and image-captioning games like Make it Meme)
**Researched:** 2026-09-05
**Confidence:** MEDIUM-HIGH (genre mechanics are well-documented and consistent across many independent implementations; project-specific numbers like timer lengths are judgment calls, not verified facts)

This research studies the **genre in general** — the caption-submit-then-vote party game format used across many titles (Jackbox's Quiplash/Fibbage family, browser-based Cards Against Humanity clones, meme-captioning games). No product's specific text, art, UI copy, or branding is referenced or should be copied; only the shared structural pattern of the format is described.

Context locked in from PROJECT.md: ~10-15 players, all physically in one room, phones only, Hebrew/RTL, one-week build, one specific live event (not a long-lived product). This changes several defaults versus a general-purpose party game product — noted throughout.

## Feature Landscape

### 1. Lobby & Joining

| Feature | Category | Complexity | Required to play? | Notes |
|---------|----------|------------|--------------------|-------|
| Room code (short, easy to say aloud) | TABLE STAKES | LOW | YES | 4-6 alphanumeric chars, case-insensitive, avoid ambiguous chars (0/O, 1/I). Must be trivial to shout across a room. |
| Name entry (no password, no account) | TABLE STAKES | LOW | YES | Free text, RTL-aware input. Validate non-empty. |
| QR code to join (encodes room URL) | DIFFERENTIATOR (near table stakes here) | LOW | NO, but strongly recommended | For this project specifically: typing a room code on a Hebrew keyboard, then switching layouts to type a name, is real friction for ~12 phones at once. A QR code on the host's screen skips the code-typing step entirely. Cheap to build (any QR-gen library) and directly serves the "no one gets stuck" core value — treat as effectively required despite being technically optional. |
| Host controls: create room, set round count, start game | TABLE STAKES | MEDIUM | YES | Needs a "host" role distinct from "player" — first client to create the room, or a specific start flow. Round-count picker before start matches the explicit "host chooses how many rounds" requirement. |
| Late joiners (join lobby before game starts) | TABLE STAKES | LOW | YES | Anyone joining before "Start" is pressed is just a normal player. |
| Late joiners (join after game has started) | DIFFERENTIATOR | MEDIUM | NO | Real party dynamic: someone was in the bathroom, someone's phone needed a restart. Simplest acceptable behavior: let them join and spectate/wait until the next round begins, then fold them in. Do not attempt mid-round injection (breaks vote-count math). Skip for v1 if time-pressured — host can simply hold the "Start" button an extra 60 seconds and instruct latecomers verbally. |
| Duplicate name handling | TABLE STAKES | LOW | YES | With ~12 friends, "Yossi" collisions are near-certain. Either reject with inline error ("this name is taken") or auto-suffix. Reject-with-error is simpler to build and good enough for a live room where people can just retype. |
| Phone locks / backgrounds while waiting in lobby | TABLE STAKES (behavior) | (covered by Robustness §7) | YES | Not a separate feature — solved by the reconnection/resync mechanism below. Listed here because it's the first place it will bite (people locking their phone while waiting for others to join). |

### 2. The Round Loop

| Feature | Category | Complexity | Required to play? | Notes |
|---------|----------|------------|--------------------|-------|
| Prompt/photo display + caption text box | TABLE STAKES | MEDIUM | YES | The core mechanic. Each player gets the same photo, submits their own free-text caption. RTL text input must be correct here (this is where most of the Hebrew typing happens). |
| Submission timer (60-90s typical in the genre) | TABLE STAKES | LOW-MEDIUM | YES | Without a hard timer, one slow typist holds 12 people hostage. Genre standard is a visible countdown that creates gentle urgency (confirmed pattern in Quiplash/Fibbage). |
| "Waiting for others" screen with progress (e.g. "8/12 submitted") | TABLE STAKES | LOW | YES | Prevents the single biggest live-party failure: people wondering "is this frozen?" Show a count or list of who's still writing, not the content. |
| Auto-advance the instant all players have submitted (don't wait out the full timer) | DIFFERENTIATOR | LOW | NO | Cheap and meaningfully improves pace once most rounds finish early. Easy win, do it. |
| Non-submitter handling (player doesn't submit in time) | TABLE STAKES (must define behavior) | LOW-MEDIUM | YES | Simplest safe default: that player is silently excluded from that round's voting pool (no blank/placeholder caption shown). Avoids embarrassing an AFK player and avoids voting on empty captions. |
| Minimum-submission guard (need ≥2 captions to hold a vote) | TABLE STAKES (edge case) | LOW | YES | If everyone but one person fails to submit, skip straight to results/next round rather than showing a one-option "vote." |

### 3. Voting

| Feature | Category | Complexity | Required to play? | Notes |
|---------|----------|------------|--------------------|-------|
| Show all captions anonymized, randomized order, no author shown | TABLE STAKES | LOW-MEDIUM | YES | Anonymity is what makes voting honest instead of a popularity contest among friends. Randomize display order per viewer or globally to avoid position bias. |
| Prevent self-voting | TABLE STAKES | MEDIUM | YES | Requires the server to know which caption belongs to which player and filter that player's own caption out of their own voting screen. Explicit requirement in PROJECT.md. |
| One vote per player per round | TABLE STAKES | LOW | YES | Standard; server should reject/ignore a second vote from the same player+round. |
| Live vote tally visible *during* voting | ANTI-FEATURE (for this use case) | LOW | NO | Showing running vote counts while voting is open invites bandwagon voting in a room where everyone can see everyone's phone — actively harmful to the "funniest caption wins" premise. Only show submission progress ("X/Y voted"), never partial results, until voting closes. |
| Tie handling | TABLE STAKES (must define, not build a resolver) | LOW | YES | Simplest and most common genre answer: tied captions split/share the round's top scoring outcome. No tiebreaker round needed — do not build one. |
| Results reveal (ranked captions with vote counts, once voting closes) | TABLE STAKES | LOW-MEDIUM | YES | This is the emotional payoff of the whole genre — the moment everyone finds out what won. Must ship. |
| Animated/suspenseful reveal (low-to-high count-up) | DIFFERENTIATOR | MEDIUM | NO | Nice-to-have polish. Defer if the week gets tight; a plain ranked list is a complete, working feature on its own. |

### 4. Scoring

| Feature | Category | Complexity | Required to play? | Notes |
|---------|----------|------------|--------------------|-------|
| Points awarded per vote received | TABLE STAKES | LOW | YES | Base mechanic — no scoring, no game. |
| Running cross-round scoreboard | TABLE STAKES | LOW | YES | Explicit requirement in PROJECT.md. |
| Percentage-of-votes scoring (a caption's score = its share of total votes cast that round, genre pattern seen in Quiplash) | DIFFERENTIATOR | MEDIUM | NO | Normalizes for the fact that total voters may shift slightly if a late joiner is folded in. Feels fairer at ~12 players than a raw vote count because "won by a landslide" and "won by one vote" score differently. Worth doing if scoring logic is otherwise simple, but raw vote-count-as-points is a perfectly adequate fallback for a one-week build. |
| Bonus for voting for the eventual round winner ("you picked the crowd favorite") | DIFFERENTIATOR | MEDIUM | NO | Rewards paying attention/good taste, adds a light strategic layer. Not to be confused with Fibbage's "guess the truth" bonus, which is a different game type (deception-guessing) and doesn't apply here — this project has no "correct answer," only funniest-by-vote. |
| "Sweep" / unanimous-vote bonus (genre pattern: extra points if a caption gets literally every vote) | DIFFERENTIATOR | LOW | NO | Cheap, fun, rewards a standout joke. Easy to bolt on if base scoring is already vote-count-based. |
| Podium / rank-change highlight between rounds ("you moved up 2 places") | DIFFERENTIATOR | LOW | NO | Small dopamine hit, cheap to add once the scoreboard exists. |

### 5. End of Game

| Feature | Category | Complexity | Required to play? | Notes |
|---------|----------|------------|--------------------|-------|
| Final winner reveal screen | TABLE STAKES | LOW | YES | Explicit requirement. |
| "Best of the night" recap (top-voted captions across the whole game) | TABLE STAKES (explicit project requirement) | MEDIUM | YES | Requires tracking top-N captions by vote count across all rounds, not just the final round — a small but real piece of server-side bookkeeping that must be planned in from round 1, not bolted on at the end. |
| Download meme as image (Hebrew caption drawn onto the photo) | TABLE STAKES (explicit project requirement) | MEDIUM-HIGH | YES | The hardest "simple-sounding" feature in the whole project. Rendering RTL Hebrew text onto an HTML canvas (for image export) needs verification well before the event — canvas text APIs have historically had uneven bidi/RTL shaping support across browsers, and this must be tested with real Hebrew strings including mixed punctuation, not assumed to "just work" because the on-screen HTML text renders fine (HTML has proper bidi algorithm support; `<canvas>` text drawing does not inherit it automatically in all browsers). Flag for dedicated technical verification, not just implementation. |
| Native share button (Web Share API — "send to WhatsApp") | DIFFERENTIATOR, but high-value | LOW | NO | For a group of Israeli friends, sharing memes straight to a WhatsApp group is the natural next action after downloading. `navigator.share()` with an image file is well-supported on mobile Safari/Chrome and is a thin wrapper once the image-generation feature exists. Strongly recommended if time allows — cheap add-on to a feature you're building anyway. |
| "Play again" / new game with the same lobby | ANTI-FEATURE (for this event) | LOW-MEDIUM | NO | This is a one-time event for one specific party, not a repeatable product. Building session persistence for a second game adds real state-management complexity (do you reset scores? keep players? reuse photos already shown?) for a scenario that may never occur. If the group wants to play again, host creates a fresh room — that flow already exists for free. |
| Persistent history of past games / accounts | ANTI-FEATURE | — | NO | Explicitly out of scope in PROJECT.md. Memes are downloaded on the night; no server-side archive needed after the event ends. |

### 6. Host Powers (Live-Event Recovery Tools)

These are the features that matter only when something goes wrong — and at a live party with 12 phones on venue wifi, something *will* go slightly wrong at some point. Treat this whole category as cheap insurance, not a "nice admin panel."

| Feature | Category | Complexity | Required to play? | Notes |
|---------|----------|------------|--------------------|-------|
| Skip current round | TABLE STAKES | MEDIUM | YES | Needed when a photo fails to load, a round gets stuck, or the group wants to move on. Forces a clean state transition regardless of submission/vote status. |
| End game early / jump to final results | TABLE STAKES | LOW | YES | If the room is losing energy or something is broken beyond a quick fix, the host must be able to end gracefully rather than leave everyone staring at a stalled screen. |
| Kick a player | TABLE STAKES | LOW-MEDIUM | YES | Handles the "someone joined by mistake / duplicate device / phone is glitching and needs to be dropped and rejoined" case. |
| Restart / reset the room | TABLE STAKES | LOW | YES | The ultimate recovery button if state gets weird and nothing else fixes it — same room code, clean slate. Cheap if the server treats "reset" as reinitializing room state rather than requiring a new code (which would force everyone to rejoin). |
| Pause the game | DIFFERENTIATOR | LOW | NO | Useful for a bathroom break or a toast, but the group can just... pause verbally while phones sit idle (timers are the only thing that would keep running — consider whether a pause needs to also pause the round timer, which adds a bit of complexity). Nice-to-have, not blocking. |

All four TABLE STAKES host powers here are best built as a small fixed panel on the host's own screen (a handful of buttons), not a general admin system — keep this cheap.

### 7. Robustness (Features Nobody Notices Until They're Missing)

| Feature | Category | Complexity | Required to play? | Notes |
|---------|----------|------------|--------------------|-------|
| Reconnection: rejoin in progress after phone lock, backgrounding, or refresh | TABLE STAKES (explicit project requirement) | MEDIUM-HIGH | YES | The single most important robustness feature for this event. A player who locks their phone (very likely — it happens by default after ~30s of no touch) must come back to their current round, their prior submission if any, and their score, without breaking the game for everyone else. |
| Persistent player identity across reconnects (a token stored client-side, not just a socket ID) | TABLE STAKES | MEDIUM | YES | Socket connections are ephemeral; a raw socket ID cannot be the player's identity. Store a lightweight per-player token (e.g. in `localStorage`) tied to their seat in the room so a reconnect can be matched back to the same player rather than treated as a new joiner. |
| Server-authoritative full-state resync on (re)connect, not "replay missed events" | TABLE STAKES | MEDIUM | YES | On any connect/reconnect, the client should ask "what is the current state of the room?" and render that, rather than relying on having received every event since it disconnected (missed socket events are simply gone once a client is offline — this is a known Socket.IO limitation, not a bug to code around). |
| Host is not a single point of failure (game state lives on the server, not on the host's device) | TABLE STAKES (architectural) | MEDIUM | YES | If the host's own phone locks or drops, the party's game must not freeze. The host client should be treated as "a client with extra buttons," with all real state on the server. |
| Duplicate name rejection | TABLE STAKES | LOW | YES | (Also listed under Lobby — repeated here because it's fundamentally a robustness/data-integrity concern: two "Yossi"s would corrupt vote/score attribution if not caught.) |
| Idempotent submit/vote handling (double-tap doesn't double-submit or error) | TABLE STAKES | LOW | YES | Phones are laggy, people tap twice. Server should treat a second identical submission/vote as a no-op, not a crash or a duplicate entry. |
| Screen Wake Lock during active input (keep screen from sleeping while a player is mid-caption) | DIFFERENTIATOR | LOW | NO | The Screen Wake Lock API is supported on most modern mobile browsers and directly reduces how often the core reconnection path gets exercised. Cheap to add, not required if reconnection is solid regardless. |
| Graceful "someone closed the tab entirely, not reconnecting" handling | (Covered by timer + minimum-submission-guard) | — | YES | Not a separate build — the round timer and the ≥2-caption voting guard already ensure the game doesn't wait forever for a player who never comes back. |

## Failure States That Ruin a Live Party Game — and What Prevents Each

| Failure state | What it looks like | Feature that prevents it |
|---|---|---|
| Game stalls on one slow/distracted player | Everyone stares at "waiting for others" indefinitely | Submission timer + auto-advance |
| Host's phone dies or locks and the whole party freezes | No one can do anything until the host comes back | Server-authoritative state (host is not a single point of failure) |
| A player's phone locks mid-round and they come back to a broken/blank screen | Player thinks the game crashed, has to be rescued manually | Reconnection + persistent identity + full-state resync |
| Two players both named "Yossi" | Votes/scores get misattributed, confusion about who's who | Duplicate-name rejection at join |
| A player can tell whose caption is whose (by elimination, order, or an accidental name leak) | Voting becomes a popularity contest, not a funniest-caption contest | Anonymized captions + randomized order + self-vote exclusion |
| Live vote counts visible while voting is still open | Bandwagon voting — last voters just copy the leader | No partial results shown during voting; only reveal after close |
| A latecomer can't get into the room quickly | Person feels excluded at their own friend's bachelor party | Fast join flow: short code + QR code, no signup |
| Something visibly breaks mid-round in front of the whole room | No way to recover except telling everyone to reload/rejoin manually | Host powers: skip round / end game / kick / restart |
| Double-tapping "submit" or "vote" on a laggy phone | Duplicate entries corrupt vote counts or throw visible errors | Idempotent submit/vote handling |
| Hebrew caption text renders reversed, mis-shaped, or with reversed punctuation on the downloaded meme image | The souvenir people actually keep looks broken; this is the one artifact everyone will show off after the party | Correct RTL-aware canvas rendering, verified with real Hebrew captions before event night (technical spike, not an assumption) |
| Server can't hold up under ~12-15 concurrent real-time connections in one room | Random disconnects/lag with the whole party watching | Choose hosting/realtime infra that comfortably exceeds this small scale, load-test with a rough approximation before the event (see STACK.md / ARCHITECTURE.md) |

## Feature Dependencies

```
Room code + name entry (join)
    └──requires──> Persistent player identity (token)
                       └──requires──> Server-authoritative room state
                                          └──enables──> Reconnection / resync
                                          └──enables──> Host powers (skip/kick/end/restart)

Prompt+caption round
    └──requires──> Submission timer
    └──requires──> Server tracks caption→player mapping (for self-vote exclusion + scoring)

Voting
    └──requires──> Caption→player mapping (to exclude self, to attribute votes for scoring)
    └──requires──> Anonymized/randomized caption display
    └──enables──> Scoring (per-round)

Scoring (per-round)
    └──requires──> Voting results
    └──enables──> Running scoreboard
                       └──enables──> Final winner reveal

"Best of the night" recap
    └──requires──> Server tracks top-N captions by votes across ALL rounds (must be built in from round 1, not retrofitted)

Meme image download
    └──requires──> RTL-correct canvas text rendering (technical spike recommended)
    └──enables──> Native share button (thin wrapper on top of the generated image)

QR code join ──enhances──> Room code join (removes typing step, doesn't replace the code)
Screen Wake Lock ──enhances──> Reconnection (reduces how often it's triggered, doesn't replace it)
Live vote tally during voting ──conflicts──> Fair/honest voting (bandwagon effect) — do not build
```

### Dependency Notes

- **Reconnection requires persistent player identity, which requires server-authoritative state:** you cannot bolt reconnection on later if the server was designed to trust socket IDs as identity. This is a foundational architecture decision, not a late-stage feature — plan it into the very first slice of the game loop.
- **"Best of the night" requires tracking top captions across all rounds:** if this bookkeeping isn't built in from round 1, retrofitting it after the fact means replaying/reconstructing history that was never stored. Build the "track every round's vote results in a durable list" habit from the start even though the recap screen itself only appears at the end.
- **Meme download requires RTL-correct canvas rendering, which the rest of the UI does not need:** normal HTML text in the interface gets correct RTL for free from the browser's bidi algorithm; canvas-drawn text does not automatically inherit that. This is the one feature in the whole project that deserves an early, isolated technical spike — confirm it works with real Hebrew text (including numbers and punctuation mixed with Hebrew, which is where bidi bugs usually hide) before building anything else on top of it.
- **Live vote tally conflicts with fair voting:** these are not two features that can coexist as "add both, let the host toggle it" — showing live counts fundamentally undermines the reason voting exists in this genre (finding the funniest caption, not the fastest bandwagon). Don't build a toggle for this; just don't show it during the open-voting window.

## MVP Definition

### Launch With (v1 — must exist for the party to be playable at all)

- [ ] Room creation with short code + QR code — join is the very first thing 12 impatient friends will do
- [ ] Name entry with duplicate rejection — required before anyone can be identified in scoring/voting
- [ ] Host: pick round count, start game
- [ ] Round loop: photo + Hebrew caption box + submission timer + "waiting for others" progress
- [ ] Non-submitter exclusion + minimum-submission guard
- [ ] Voting: anonymized captions, randomized order, self-vote excluded, one vote per player, no live tally during voting
- [ ] Tie handling defined (split score, no tiebreaker round)
- [ ] Results reveal after each round (ranked, with vote counts)
- [ ] Points-per-vote scoring + running scoreboard
- [ ] Final winner screen
- [ ] "Best of the night" recap (built from data tracked since round 1)
- [ ] Meme image download with Hebrew caption drawn onto the photo, RTL-verified
- [ ] Host powers: skip round, end game early, kick player, restart room
- [ ] Reconnection: persistent identity + server-authoritative state + full-state resync on reconnect/refresh
- [ ] Idempotent submit/vote handling

### Add After Core Loop Works (only if days remain)

- [ ] Native share button (WhatsApp) on the downloaded meme
- [ ] Auto-advance the instant all players submit (skip remaining timer)
- [ ] Percentage-of-votes scoring instead of raw vote count
- [ ] Unanimous-vote / "sweep" bonus points
- [ ] Join-after-game-has-started flow for latecomers
- [ ] Screen Wake Lock during caption typing

### Explicitly Deferred / Not Building for This Event

- [ ] Animated suspenseful results reveal
- [ ] "Play again" with the same lobby / persisted session
- [ ] Pause game
- [ ] Rank-change / podium animations
- [ ] Any form of account, history, or multi-game persistence
- [ ] Live vote tally during open voting (actively avoid — see Anti-Features)

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|----------------------|----------|
| Room code + QR join | HIGH | LOW | P1 |
| Reconnection / persistent identity / server-authoritative state | HIGH | MEDIUM-HIGH | P1 |
| Round loop (photo, caption, timer, waiting state) | HIGH | MEDIUM | P1 |
| Voting (anonymized, self-vote excluded, no live tally) | HIGH | LOW-MEDIUM | P1 |
| Scoring + running scoreboard | HIGH | LOW | P1 |
| Final winner + best-of-night recap | HIGH | MEDIUM | P1 |
| Meme image download (RTL) | HIGH | MEDIUM-HIGH | P1 |
| Host powers (skip/end/kick/restart) | HIGH | LOW-MEDIUM | P1 |
| Duplicate-name + idempotent-submit handling | MEDIUM (invisible when present, disastrous when absent) | LOW | P1 |
| Native share button | MEDIUM-HIGH | LOW | P2 |
| Percentage-based scoring | MEDIUM | MEDIUM | P2 |
| Auto-advance on full submission | MEDIUM | LOW | P2 |
| Join-after-start for latecomers | MEDIUM | MEDIUM | P2 |
| Screen Wake Lock | LOW-MEDIUM | LOW | P2 |
| Animated results reveal, podium effects, pause | LOW | MEDIUM | P3 |
| Play-again / persisted sessions, accounts, history | LOW (not needed for a one-night event) | MEDIUM-HIGH | P3 (skip) |

**Priority key:**
- P1: Must have — the party genuinely cannot run smoothly without it
- P2: Should have if the week allows — meaningfully better, not launch-blocking
- P3: Nice to have / explicitly out of scope for this event

## Competitor/Genre Feature Analysis

Studied at the level of shared genre mechanics only — no specific product's text, art, or branding referenced.

| Feature | Jackbox-style titles (Quiplash/Fibbage genre) | Cards-Against-Humanity-style clones | This project's approach |
|---------|-----------------------------------------------|--------------------------------------|--------------------------|
| Prompt type | Text prompt, players write a matching quip | Fixed cards, players pick from a hand | Fixed photo, players write a free-text caption (closer to the Quiplash-style free-text submission than to a card-pick mechanic) |
| Scoring | Percentage-of-vote-share + winner bonus + sweep bonus | A "judge" picks one winner per round (not crowd-voted) | Crowd-voted, points per vote received — closer to the Jackbox-family voting model than to the single-judge model, since a bachelor party has no natural single judge and full-group voting keeps everyone engaged every round |
| Anonymity in voting | Author hidden until after voting | Author hidden until after voting | Same — author hidden, order randomized, self-vote excluded |
| Reconnection | Not typically a public design detail (console/TV-based sessions are usually short-lived per game) | Varies widely by clone implementation quality | Treated as a first-class, must-have requirement given phones-only, no shared screen, and a live audience that will notice immediately if it's missing |
| Host role | A dedicated device drives a shared screen (TV/console) | Varies — some have a rotating "judge," some a fixed host | No shared screen at all (explicit project decision); host is a privileged player on their own phone with recovery-tool buttons, not a display surface |

## Sources

- [Quiplash (series) | Jackbox Games Wiki – Fandom](https://jackboxgames.fandom.com/wiki/Quiplash_(series)) — MEDIUM confidence (community wiki, cross-checked against multiple independent write-ups of the same mechanic)
- [Critical Play: Quiplash & other Jackbox Games – The Mechanics of Magic](https://mechanicsofmagic.com/2024/04/24/critical-play-quiplash-other-jackbox-games-ellie/) — MEDIUM confidence
- [A Competitive Analysis of Quiplash – Game Design Fundamentals (Medium)](https://medium.com/game-design-fundamentals/a-competitive-analysis-of-quiplash-dcb375fa1069) — MEDIUM confidence
- [Socket.IO: Tutorial – Handling disconnections](https://socket.io/docs/v4/tutorial/handling-disconnections) — HIGH confidence (official framework documentation)
- [Socket.IO: Connection state recovery](https://socket.io/docs/v4/connection-state-recovery) — HIGH confidence (official framework documentation)
- Domain/genre pattern knowledge (Jackbox family game structure, Cards Against Humanity-style judge/vote models, and general live-multiplayer-web-app robustness patterns) cross-checked against the sources above — MEDIUM confidence, treated as genre-general design conventions rather than facts about any single product, and not copied from any product's implementation.

---
*Feature research for: caption-and-vote party game genre, scoped to a single private one-night live event*
*Researched: 2026-09-05*
