# Pitfalls Research

**Domain:** Real-time multiplayer browser party game (Hebrew/RTL, phone-only, single live event, one-week build)
**Researched:** 2026-09-05
**Confidence:** MEDIUM (cross-verified platform/browser behavior + established real-time systems practice; hosting tier limits change often and were checked against current 2026 sources)

This document is organized around the six areas requested: live-event failures, Hebrew/RTL, mobile browser, real-time/state, free hosting, and one-week-deadline pitfalls — followed by the standard tables and a concrete rehearsal protocol.

---

## Critical Pitfalls

### Pitfall 1: Phone screen locks / backgrounds and the socket silently dies

**What goes wrong:**
A player's phone auto-locks or they swipe to check WhatsApp mid-round. On iOS Safari in particular, when the tab is backgrounded the WebSocket connection is dropped by the OS/browser after a short idle period — sometimes with a clean `close` event, sometimes with none at all after longer inactivity, so the client has no signal it's disconnected. The player comes back to a frozen screen, the round timer has moved on without them, or they never see the state change and just tap on stale UI.

**Why it happens:**
Mobile OSes suspend background tab network activity aggressively to save battery. iOS Safari has documented, version-dependent inconsistency here: sometimes it fires `onclose`/`onerror` on foreground-return so the client can reconnect, but after longer backgrounding the socket is dead with no event at all, leaving client state believing it's still connected.

**How to avoid:**
- Never trust "connected" state from a WebSocket's lifecycle alone. On every `visibilitychange` → `visible` and on window `focus`, force a reconnect handshake and a full state resync from the server (don't diff — replace client state wholesale from an authoritative server snapshot).
- Use Socket.IO (or equivalent) with reconnection enabled and short `pingInterval`/`pingTimeout` so dead connections are detected server-side quickly (a few seconds, not the default ~50s) — with only ~10-15 players this cost is trivial.
- Design every screen to be re-enterable at any time: on reconnect, server sends "here is the current round, current phase (writing/voting/results), your submission status, time remaining" and the client just renders that — never assumes continuity.
- Treat "locked/backgrounded phone" as the *normal* case for this event, not an edge case — most guests will have their phone lock between rounds.

**Warning signs:**
Testing only with the screen on and the tab foregrounded; no `visibilitychange` handler in the code; client trusts a locally-ticking timer instead of asking the server "how much time is left"; no test where you lock the phone for 30+ seconds mid-round and check what happens on unlock.

**Phase to address:**
Real-time/networking phase (foundational) — this must be baked into the socket layer from the start, not patched on later.

---

### Pitfall 2: Weak venue WiFi + mixed networks causes a split-brain room

**What goes wrong:**
Some players are on the venue's one shared WiFi (which chokes under 10-15 simultaneous phones plus everyone's Instagram Stories), others are on 4G/5G mobile data. Latency and reliability differ wildly between the two groups. Under load, WiFi players start timing out or getting duplicate/out-of-order events while mobile-data players are fine — looks like "random" bugs that are really network-tier-correlated.

**Why it happens:**
Consumer/venue WiFi routers are not built for 15 concurrent devices doing anything more than passive browsing; NAT/AP buffering causes bursty latency spikes. Developers usually test on their own good home WiFi/dev machine and never simulate a crowded, saturated AP.

**How to avoid:**
- Design the protocol to be idempotent and order-tolerant: every state-changing event carries a server-issued sequence/round ID; clients ignore stale events and can always ask "give me current state" rather than relying on receiving every incremental event.
- Keep payloads tiny (JSON diffs, not full image blobs over the socket) — images/photos are served over plain HTTP with caching, not pushed through the realtime channel.
- Recommend/ask the host in advance: get the venue WiFi password ahead of time, but plan for it to be bad — actively encourage players to use mobile data if the WiFi is congested, and make sure the app works fine on data alone (no LAN-only assumptions, no mDNS/local discovery).
- Add a lightweight "reconnecting..." UI state instead of a blank screen so flaky-network players understand what's happening rather than assuming the game is broken.

**Warning signs:**
No plan for what host WiFi actually is on the night; app has never been tested with more than 2-3 concurrent connections from real distinct networks; no reconnect UI state exists.

**Phase to address:**
Real-time/networking phase, verified in the rehearsal phase (see protocol below) with real phones on real venue-like conditions.

---

### Pitfall 3: Late joiner, duplicate names, and joining mid-round

**What goes wrong:**
A friend shows up 20 minutes late and tries to join with the room code. Either the app doesn't let them in ("game already started" dead end), or it lets them in but they land in a broken state (e.g., a voting screen with no photo, or stuck waiting to submit a caption for a round that already ended). Separately, two people type the same first name ("Danny"), and the scoreboard/vote-attribution becomes ambiguous — captions display as coming from "Danny" with no way to tell them apart, or the server can't tell who actually voted.

**Why it happens:**
Name uniqueness and "what happens if someone joins after round 1 starts" are the kind of decisions that feel like edge cases during a one-week sprint and get silently skipped, then surface for real at the actual party (late arrivals are near-guaranteed at a bachelor party).

**How to avoid:**
- Identify players by a server-generated stable player ID (stored in `localStorage`/`sessionStorage` + reissued on join), never by display name. Enforce name uniqueness at join time server-side (case/whitespace-insensitive compare in Hebrew too); on collision, auto-suffix or prompt for a different name before allowing join.
- Decide explicitly (in week-1 planning, not improvised on the night): late joiners can join the *room* anytime, but join the *game* as a spectator until the next round boundary, where they're auto-included. Communicate this in-UI ("You'll join at the next round!") instead of erroring out.
- Never let a late joiner land on a screen with missing data — server always sends a full state snapshot on join, and the client renders whatever phase that snapshot describes (lobby/writing/voting/results/final), including a "waiting for next round" screen if needed.

**Warning signs:**
No decision recorded anywhere about late-join behavior; name field has no server-side uniqueness check; testing only ever starts all players from the lobby simultaneously.

**Phase to address:**
Game-loop/state-machine phase — this is a core state machine design question, not a UI afterthought.

---

### Pitfall 4: One player stalls the whole room (left mid-round, or just never submits)

**What goes wrong:**
A player leaves to go to the bathroom mid-writing-phase, or gets distracted talking to someone, and never submits a caption or vote. If the round is designed to wait for "all players" before advancing, the entire game of 14 other people stalls indefinitely waiting on one person. This is the single most likely on-the-night failure to actually ruin the fun, because it's highly probable (someone always wanders off at a party) and highly visible (everyone is staring at a "waiting for players..." screen).

**Why it happens:**
"Wait for everyone" feels like the obviously fair design and is what gets built first; the failure mode only becomes obvious once you imagine 15 real, distracted, drinking adults instead of 15 obedient test tabs.

**How to avoid:**
- Every phase (writing, voting) has a **server-authoritative countdown timer** that advances the round when it expires, regardless of who has/hasn't submitted — never a "wait for all N players" gate as the *only* path forward.
- Missing submissions are handled gracefully: no caption submitted → that player is simply excluded from that round's caption pool (or gets an auto-placeholder); no vote cast → their vote just doesn't count. Never block on it.
- Optionally, allow the host (or the game itself, via a "X/15 have answered, skip early?" affordance) to force-advance a phase early once a strong majority has submitted, but the automatic timer is the real safety net and must always exist and always fire.
- Make the timer visible and consistent to all clients (server broadcasts remaining seconds; don't let each phone free-run its own countdown from a stale start time — see Pitfall 8).

**Warning signs:**
Server logic contains any `if (submissions.length === players.length)` as the *only* trigger to advance a round; no countdown/timeout exists as a fallback; nobody has tested "what if I just don't tap anything."

**Phase to address:**
Game-loop/state-machine phase — this is the single highest-priority pitfall to design against explicitly before writing any round logic.

---

### Pitfall 5: Someone refreshes the page, or a rage-quitter leaves and comes back (or doesn't)

**What goes wrong:**
A player accidentally refreshes (common on Android back-gesture, or "let me just check something") and loses all client state — if the app has no rejoin flow, they either see a blank join screen and have to re-enter the room code (losing their progress/identity, possibly creating a duplicate "player"), or the app crashes on missing state. Separately, a player is losing badly, gets mock-annoyed, and closes the tab — the room must survive a departure without breaking for the other 14 people (this is explicitly required in PROJECT.md: "a player who briefly loses connection can rejoin... without breaking it").

**Why it happens:**
Client state (current player ID, room code) is kept only in memory (a JS variable), not persisted, so any full page reload wipes identity. Developers test happy-path flows and never actually hit refresh mid-game.

**How to avoid:**
- Persist `{ roomCode, playerId, playerName }` to `localStorage` the moment a player joins. On every app load, check localStorage first: if present, silently attempt to rejoin that room/identity via the server before showing the join screen at all.
- Server keeps player records for the lifetime of the room (until explicitly ended or a long inactivity timeout, e.g. 2+ hours) — a disconnect is not a delete. Reconnecting with the same playerId restores their seat, their past submissions/votes, and current score.
- A player who never comes back is functionally identical to Pitfall 4 (a non-responsive player) — the same "don't block on everyone" timer logic covers rage-quits for free if designed correctly. No special-case "handle rage quit" logic should be needed if late-join/disconnect/timeout are handled generally.
- Explicitly test: join, refresh the tab, confirm you're back in with your name/score intact, not asked to rejoin from scratch.

**Warning signs:**
Player identity lives only in a JS variable or React state with no localStorage backing; refreshing the tab during dev testing currently kicks you back to the join screen; no server-side grace period before removing a disconnected player.

**Phase to address:**
Real-time/networking phase for the reconnect mechanism; verified end-to-end in the game-loop phase.

---

### Pitfall 6: Hebrew text on canvas silently renders reversed, mirrored, or garbled — and it's a build-time-invisible bug

**What goes wrong:**
The downloadable meme (the actual souvenir — the thing people will screenshot-share for weeks after) draws the player's Hebrew caption onto the photo. This is the single highest-risk rendering pitfall in the whole project because canvas text APIs, unlike normal HTML/CSS text, do **not** reliably run the Unicode Bidi Algorithm the way a browser's text layout engine does for regular DOM text. Specific known failure patterns:
- **Reversed Hebrew:** letters appear right-to-left *character by character* (mirror-image word order) instead of correctly-shaped RTL text — a documented, longstanding class of bug across canvas implementations (Firefox tracked this for years: "Canvas text routines draw right-to-left text backwards," Bugzilla #402276).
- **Mixed Hebrew + numbers/Latin punctuation:** a caption like `זה מגניב 100%!` or a caption containing a name in English gets the numeral/Latin run's position or internal digit order scrambled relative to the Hebrew — classic bidi mixed-run bug, because naive canvas text drawing doesn't apply the full Unicode Bidi Algorithm (UAX #9) to mixed-direction runs, only (at best) a single overall direction via `ctx.direction`.
- **Server-side image generation (Node.js) is worse, not better:** if the meme image is generated server-side with `node-canvas` (Cairo-based) — a very likely choice for consistent, shareable output — Cairo's plain text-drawing API does **not** perform bidi reordering or Arabic/Hebrew shaping on its own; it draws glyphs in raw string order. Feeding it a Hebrew string will draw the letters in logical (typed) order, not visual (correct RTL) order, unless the string is pre-reordered or a bidi/shaping library is used. `sharp` has no built-in text rendering at all — if it's used to composite text (e.g. via generated SVG + librsvg), the SVG text element's bidi handling has its own separate set of gaps and must be tested independently. `html2canvas`/`dom-to-image`-style DOM-screenshot approaches inherit the browser's real text layout (better bidi correctness) but are heavier, slower, and have their own font-loading/CORS fragility.

**Why it happens:**
Canvas 2D was designed assuming simple LTR text; RTL support (the `direction` property, bidi handling) was bolted on later, inconsistently, across browsers and headless/server rendering libraries, and almost never gets exercised by non-Hebrew/Arabic-speaking developers or their test suites — this is exactly the kind of bug that looks perfect on an English/Latin test caption ("LOL") and only reveals itself the first time a real Hebrew sentence with a number in it is drawn.

**How to avoid:**
- **Decide the rendering path early and test it with real, messy Hebrew input by day 2 at the latest** — not just "שלום" but a caption with mixed digits, punctuation, and an English word, since that's what real party captions will look like.
- If generating the image **client-side in the browser** (recommended for this project — lower infra risk, no server image-processing dependency to keep alive): set `ctx.direction = 'rtl'` and `ctx.textAlign` appropriately, but do **not** trust the browser to correctly reorder mixed Hebrew/Latin/digit runs on its own — pre-process the caption string through a bidi-reordering step (e.g. the `bidi-js` npm package, or wrap Latin/number substrings in explicit Unicode directional marks/isolates — LRI `U+2066`/RLI `U+2067`/PDI `U+2069` — before drawing) so the *string itself* is already in a form that renders correctly regardless of canvas quirks.
- If generating **server-side** with `node-canvas`: do not assume Cairo shapes/reorders Hebrew correctly — explicitly run the caption text through a bidi-algorithm library first (again `bidi-js`, or ICU bindings) to produce the correct visual-order string, and verify actual output pixels (not just "it didn't throw") with a real Hebrew+digit test string before relying on it.
- Whichever path is chosen, **render a same-image visual comparison test on day 1-2**: generate one meme with a caption containing Hebrew + a number + an English word, and literally look at the resulting PNG to confirm it reads correctly right-to-left. Do this before building any other feature on top of the image pipeline — it is a go/no-go gate for the whole "downloadable meme" requirement.
- Prefer a well-tested, actively maintained canvas/text stack: newer alternatives like `@napi-rs/canvas` or `skia-canvas` use Skia (which has more robust HarfBuzz-based shaping than plain Cairo) and are worth evaluating over vanilla `node-canvas` specifically because of this issue, if the image generation ends up server-side.

**Warning signs:**
The only Hebrew string ever tested is a single simple word; no test caption mixes Hebrew with digits or Latin; the meme-generation code was written and "looked fine" using placeholder English text ("test caption") before real Hebrew was ever tried; nobody has visually inspected an actual downloaded PNG on a phone, only checked that the function runs without error.

**Phase to address:**
Meme/image-generation phase — treat this as a spike/proof-of-concept to de-risk on day 1-2, given it's both invisible-until-tested and central to the product's core deliverable (the downloadable meme is explicitly the "souvenir").

---

### Pitfall 7: RTL layout mirroring mistakes in the interface itself

**What goes wrong:**
Beyond the canvas image, the live UI has its own RTL bugs: icons/arrows that should mirror (e.g., a "next" chevron) don't, because they were built with hardcoded `left`/`right` CSS instead of logical properties; number inputs or timers display with digits in the wrong visual position relative to surrounding Hebrew text; scroll/swipe direction feels backwards; a text input for the caption shows the cursor jumping to the wrong end when Hebrew and a pasted English word are mixed; mobile keyboard autocomplete/autocapitalize behaves oddly because it defaults to English-language assumptions.

**Why it happens:**
Most CSS frameworks and component examples are LTR-first by default; `dir="rtl"` on `<html>` handles a lot automatically (text alignment, flex-direction reversal) but not everything — anything using physical properties (`margin-left`, `text-align: left`, `float: left`) instead of logical ones (`margin-inline-start`, `text-align: start`) will render backwards or fail to mirror.

**How to avoid:**
- Set `dir="rtl"` and `lang="he"` on the root `<html>` element from the very first commit, not retrofitted later — building LTR-first and "RTL-izing" at the end is far more expensive than building RTL-native from hour one.
- Use CSS logical properties (`margin-inline-start/end`, `padding-inline-*`, `inset-inline-*`, `text-align: start/end`) throughout instead of `left`/`right`/physical equivalents; if using a UI/CSS framework, confirm it has RTL support baked in (most modern utility frameworks like Tailwind do via the `rtl:`/`ltr:` variants, but must be used deliberately).
- For the caption text input specifically: use a plain `<textarea>`/`<input>` with `dir="auto"` or explicit `dir="rtl"`, and test on both iOS and Android with real Hebrew keyboard input (not pasted text) — pasted text can behave differently from typed text for cursor/selection edge cases.
- Test every screen by literally reading it aloud in Hebrew word order on a real phone, not just glancing that "Hebrew text is present."

**Warning signs:**
Any CSS in the codebase using `left:`/`right:`/`margin-left`/`float: left`; UI was prototyped in English first "to move fast" with Hebrew swapped in later; nobody on the team has actually typed a Hebrew sentence into the live app on a phone keyboard.

**Phase to address:**
UI/frontend phase — bake in from the first component built, verified continuously rather than as a final pass.

---

### Pitfall 8: Trusting client-side timers instead of the server clock

**What goes wrong:**
Each phone runs its own local countdown for "time left to write your caption." Phones' local timers drift due to background throttling (a backgrounded tab's `setInterval`/`setTimeout` gets throttled or paused entirely by the browser to save battery — see Pitfall 1), so different players see wildly different "time remaining," some submit after the round has already actually ended server-side (and get rejected or silently dropped, confusing the player), and the visual countdown becomes a lie that erodes trust in the whole game the moment one person notices their timer says 5 seconds while their friend's says "time's up."

**Why it happens:**
It's simpler to write `setInterval` on the client and count down locally than to keep syncing with the server; this works fine in a quick local test with one tab open and foregrounded, and only breaks once real phones with locking screens and background throttling are involved — which is exactly the party-night scenario.

**How to avoid:**
- The server is the single source of truth for round timing: it holds `roundEndsAt` (an absolute timestamp) and is the sole authority on when a phase ends and submissions stop being accepted.
- Clients compute displayed countdown as `roundEndsAt - Date.now()` (re-synced against a server-provided timestamp on connect/reconnect to correct for client clock skew), and simply re-render this whenever the tab is visible/focused — never accumulate a local decrementing counter that can drift.
- The server, not the client, decides when a round actually ends and moves the game to the next phase, broadcasting that to all clients — the client's own countdown reaching zero is purely cosmetic, never authoritative.
- Reject/ignore any submission that arrives after the server's actual round-end, but design the UI so this is rare (generous time buffers) rather than a routine occurrence.

**Warning signs:**
Timer countdown logic lives only in client state (`useState`/`setInterval`) with no server timestamp involved; different browser tabs in testing show different countdown values; the server has no concept of "when does this round end," only "has everyone submitted."

**Phase to address:**
Real-time/networking phase, alongside the state-machine design — this is foundational, not a later polish item.

---

### Pitfall 9: Race conditions on simultaneous submit (captions and votes)

**What goes wrong:**
Multiple players tap "submit" within milliseconds of each other. Naive server code that reads room state, mutates it, and writes it back (read-modify-write without atomicity) can lose submissions under concurrent access — e.g., two captions submitted in the same tick both get written to the same array index, or a vote count increments from a stale read and undercounts. At 10-15 players this is a *guaranteed* occurrence at the top of each round (everyone tends to submit right as the timer visibly ticks down), not a rare edge case.

**Why it happens:**
JavaScript's single-threaded event loop makes "race conditions" feel like they can't happen, but with `async` I/O (database calls, even just `await`ing anything) between the read and the write, two near-simultaneous socket events can interleave and both operate on the same pre-mutation snapshot of the room state.

**How to avoid:**
- Keep all room state as a single authoritative in-process object per room (a plain JS object/Map in server memory, given the small scale of one room and ~15 players — no external database round-trip needed for the hot path), and mutate it **synchronously** on each incoming event (push into an array, increment a counter) with no `await` between the read and the write of that specific mutation. Node's single-threaded execution model then guarantees each individual event handler completes atomically relative to others, as long as the mutation itself doesn't `await` mid-way.
- Use each player's ID as an object key for submissions (`submissions[playerId] = caption`), not an array `.push()`, so double-submits (e.g., a laggy double-tap) overwrite rather than duplicate.
- If any persistence layer (database) is used, avoid "read full state, modify, write full state" patterns entirely for concurrent counters — use atomic increment operations if a DB is involved at all. But given the scale here, prefer keeping game state in server memory and only persisting the minimal "final results" snapshot if needed for the "best of the night" screen.

**Warning signs:**
Any server handler that does `await db.read()` then mutates a local copy then `await db.write()`, with no locking; a manual test with two browser tabs submitting "at the same time" (script it, don't rely on manual timing) ever loses one submission.

**Phase to address:**
Game-loop/state-machine phase — verify explicitly with an automated or scripted concurrent-submit test, not just manual single-user testing.

---

### Pitfall 10: Free/cheap hosting sleeps or cold-starts the server mid-party

**What goes wrong:**
This is arguably the single most catastrophic and entirely avoidable on-the-night failure. Many free hosting tiers (notably Render's free web service tier) spin the server down after a period with no inbound traffic (Render: 15 minutes) and take roughly a minute to cold-start again on the next request — during which every player's socket is dead and the room's in-memory state is **gone** (the whole game, scores, and all rounds so far, wiped, since state lived only in that process's memory). If the app is set up the week before and not touched again until party night, the free instance will have gone to sleep hours earlier; the first player to open the link triggers a ~60-second cold start with everyone staring at a spinner, and if the app is *already mid-game* when a scale-to-zero event happens (e.g., a long lull between rounds while people chat), the entire game state is lost outright.

**Why it happens:**
"Free" tiers fund themselves by aggressively reclaiming idle compute; this is invisible during development (you're constantly hitting it, keeping it warm) and only bites once the app sits untouched for the hours between final testing and the actual party.

**How to avoid:**
- **Do not use a scale-to-zero free tier for the live event itself**, even if used for early development. Concretely known 2026 landscape: Render's free web service tier sleeps after 15 minutes idle and cold-starts in about a minute, and does not reliably support persistent WebSocket connections on the free tier at all (long-lived connections are effectively a paid-plan feature there); Railway removed its free tier in 2023 and now requires a paid Hobby plan (~$5/mo) or a time-limited trial credit; Fly.io similarly has no meaningful free tier in 2026 (a short trial only). Budget the (small, one-time) cost of a paid low-tier instance — e.g., Render's cheapest paid web service, or a $5/mo Railway/Fly.io plan — for at least the week of the event; this is far cheaper than the risk of the party's core activity failing.
- Whatever host is chosen, **actively keep the instance warm** in the hours before and during the party regardless of tier: an external uptime-pinger (e.g., a cron job or a service like UptimeRobot hitting a health-check endpoint every 5-10 minutes) starting well before guests arrive and continuing through the event.
- Never let game state live *only* in a single process's memory without a plan for what happens if that process restarts for any reason (crash, redeploy, host-level restart): persist at minimum a periodic snapshot of room state to disk/a lightweight external store (even a simple JSON write, or Redis if already in the stack) so a restart can recover the room rather than losing it — or, given the tiny scale, at least make sure the process itself won't be redeployed/restarted during the event window (freeze deploys, don't push new code once the party starts).
- Test the actual "first load of the night" cold-start path deliberately: let the deployed app sit fully idle for the exact idle window the chosen host uses, then time how long the first player takes to get in.

**Warning signs:**
No paid plan or warm-keeping strategy exists a few days before the event; nobody has checked what happens to in-memory room state if the process restarts; the deployment has been sitting untouched since the last dev session and nobody has re-verified it loads before party day.

**Phase to address:**
Deployment/hosting phase — decided and configured well before the final rehearsal, not on the day of.

---

### Pitfall 11: One-week scope creep — building the fun parts before the plumbing works

**What goes wrong:**
With only a week and a genuinely fun, visual, "creative" game concept (captioning photos, voting, a scoreboard, a "best of the night" reel), it's extremely tempting to spend days 1-3 on the enjoyable parts — photo selection UI, caption input polish, scoreboard animations, meme styling — before the unglamorous foundation (room creation, join flow, reconnect handling, the round state machine, and real multi-device testing) is solid. This inverts the actual risk profile: the fun parts are low-risk (if the caption box looks slightly plain, nobody cares at a bachelor party) while the plumbing is where 100% of the party-night failure risk lives (disconnects, stalls, dead servers).

**Why it happens:**
The core game loop and connection-handling code is the least visually rewarding part to build and doesn't produce a demo-able screenshot, so it's naturally deprioritized against features that feel like "real progress." This is a very common pattern in scrappy party-game clones (make-it-meme-style projects in particular, since the core loop looks deceptively simple — "just show a photo, take text input, show a vote" — hiding all the state-machine and networking complexity underneath).

**How to avoid:**
- Order the week explicitly around risk, not fun: room creation + join + name uniqueness + the full round state machine (writing → voting → results, with server-authoritative timers) working end-to-end with placeholder/ugly UI, tested with 3+ real separate devices, **before** any visual polish begins.
- Treat the Hebrew-canvas meme rendering (Pitfall 6) as a day-1-or-2 spike specifically because it's a silent, invisible-until-tested failure mode that's cheap to de-risk early and expensive to discover on day 6.
- Explicitly timebox: e.g., days 1-2 core loop + networking + Hebrew rendering spike; days 3-4 full feature set with real devices tested continuously; day 5 hosting/deployment + hardening (reconnect, disconnect, late-join edge cases); day 6 full-scale rehearsal with 10+ real phones (see protocol below); day 7 buffer/fixes only, no new features.
- Say no early to anything in "Out of Scope" resurfacing mid-week (chat, avatars, multiple game modes) — PROJECT.md already made these calls; the risk is scope creep re-litigating them under time pressure, not lack of a decision.

**Warning signs:**
By day 3, no version of the game has been played start-to-finish by more than one device at once; visual/UI commits significantly outnumber networking/state-machine commits early in the week; the Hebrew meme rendering hasn't been tried with a real caption yet by day 3.

**Phase to address:**
This is a roadmap-ordering concern, not a single phase — the roadmap itself should sequence plumbing before polish (see Pitfall-to-Phase Mapping below).

---

### Pitfall 12: No multi-device test until the last day (or no real rehearsal at all)

**What goes wrong:**
The single biggest predictor of on-the-night disaster: development happens against one laptop and one phone (or worse, only browser dev tools' "mobile emulation," which does not exercise real mobile Safari/Chrome networking quirks, real screen-lock behavior, or real multi-network conditions at all). The first time the app is tested with 10+ *actual, distinct* phones on their *actual, distinct* networks is the party itself — meaning every pitfall above gets discovered live, in front of the 15 people it was built for, with zero time to fix anything.

**Why it happens:**
Recruiting 10 friends to test-play a game on a random weeknight before the real event feels like a big ask, and a solo/small dev team defaults to "it worked when I tested it" as sufficient confidence. Emulated devices in browser devtools are also seductive because they're free and instant, but they run the *same browser engine and network stack* as the dev machine — they don't reproduce Safari-specific socket/backgrounding behavior, real WiFi congestion, or real human behavior (people don't tap "submit" in a clean, orderly sequence).

**How to avoid:**
See the full rehearsal protocol below — but the core principle is: schedule a real multi-device rehearsal with real distinct phones and real distinct people **at least one full day before the event**, not the morning of, so there is time to fix what breaks.

**Warning signs:**
No rehearsal is on the calendar as of day 5; the only testing done so far is solo, on one device, in a browser tab with devtools' phone emulator.

**Phase to address:**
Dedicated rehearsal step at the end of the build (see roadmap mapping) — this is non-negotiable given the "one shot, fixed date" nature of the project.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|--------------------|-----------------|------------------|
| Store all room/game state as an in-memory JS object, no database | Fast to build, zero infra, avoids async race conditions | State is lost on server restart/crash; doesn't survive redeploys | Acceptable and actually *preferred* for this single-event, single-room, small-scale project — just pair it with Pitfall 10's "don't restart during the party" mitigation |
| Skip authentication entirely (name + room code only) | Matches the "no signup" requirement, fast join | Anyone with the room code can impersonate/spam-join | Acceptable here — private room, everyone physically present, low stakes; never acceptable for a public-facing product |
| Hardcode the photo set and round count client-side rather than building an admin/config UI | Saves a full day of build time | No flexibility to swap photos or tweak round count without a redeploy | Acceptable for a single-event build; host-configurable round count is already a stated requirement, so at minimum that one control needs a real (simple) UI |
| Client-side-only image generation (draw caption onto photo in the player's own browser canvas) | No server image-processing dependency, no extra hosting load, avoids the node-canvas Hebrew-shaping risk entirely | Output can vary slightly across browsers/devices (font rendering differences); no server-side record of generated memes for the "best of the night" screen unless captions are separately stored and the winning ones re-rendered | Recommended default for this project — lower total risk than server-side canvas generation given the one-week timeline and Hebrew rendering risk (Pitfall 6); store the winning **caption text + photo reference**, not the image, and regenerate/display images on demand |
| No automated tests, manual testing only | Saves setup time in a one-week sprint | Regressions in round-advance/reconnect logic go unnoticed until the rehearsal | Acceptable to skip a full test suite, but the state-machine's core transitions (round advance on timeout, reconnect-restores-state, duplicate-name rejection) deserve at least a few scripted/manual checklist runs — see "Looks Done But Isn't" below |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|--------------|-----------------|--------------------|
| Socket.IO (or raw WebSockets) | Relying on default `pingTimeout`/reconnection settings tuned for large-scale, less time-sensitive apps | Shorten ping interval/timeout for fast dead-connection detection at this small scale; explicitly handle `reconnect`, `disconnect`, and force a full state resync on reconnect rather than relying on Socket.IO's built-in "connection state recovery" alone (it explicitly does not survive a server restart/crash) |
| QR code generation for room join | Generating a QR code that encodes a `localhost`/dev URL, or one that isn't tested against the actual venue lighting/phone camera conditions | Point the QR at the final public deployment URL well before the event, and physically test scanning it with 2-3 different phone cameras in dim, party-like lighting |
| Free hosting platform (Render/Railway/Fly.io/etc.) | Assuming "free" tier behaves the same under a live WebSocket-heavy load as it did during light solo dev testing | Read the specific platform's current free/cheap-tier WebSocket and idle-sleep policy explicitly (see Pitfall 10) and budget a small paid tier for event week if there's any doubt |
| Node.js canvas/image libraries (`node-canvas`, `sharp`) for meme generation | Assuming Hebrew text "just works" because English test strings rendered fine | Explicitly bidi-test with real Hebrew+digit+Latin mixed captions before relying on the library (see Pitfall 6) |
| Web Share API / `<a download>` for saving the meme on iOS | Using only the HTML `download` attribute and assuming it triggers a native "save to Photos" flow on iOS Safari | iOS Safari does not support triggering a Photos-app save via the `download` attribute the way desktop browsers do; use the Web Share API (`navigator.share` with a `File`) where available so iOS offers "Save Image," and provide a fallback of "long-press the image to save" by displaying the generated image inline (not just as a JS-triggered download) |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|-----------------|
| Broadcasting full room state (including generated images) over the WebSocket channel on every update | Laggy UI updates, especially on weak WiFi | Send only small JSON state diffs/snapshots over sockets; serve any images via plain cacheable HTTP, never through the socket | Noticeable even at 10-15 players if images are involved; not a "scale" problem here, a "network payload size" problem |
| Re-rendering the entire player list / caption list on every socket event without keying/memoization | UI jank on lower-end Android phones during voting screen with 10-15 captions | Key list items by stable player/caption ID; keep re-renders scoped | Visible on budget Android devices even at this small scale — test on the cheapest phone in the friend group, not just an iPhone |
| Polling for state instead of using push events | Wasted battery/bandwidth, feels laggy, extra load on the free-tier server | Use the WebSocket push model exclusively for state changes; reserve HTTP polling only as a last-resort fallback if sockets are fully unavailable | N/A at this scale for correctness, but drains phone batteries over a multi-hour party if used as primary mechanism |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Room codes that are short/sequential/guessable (e.g., 4-digit numeric, sequentially assigned) | A stranger outside the room (or a bored guest) brute-forces or guesses another room's code — low real risk here given it's one room for one night, but still worth avoiding | Use a short but non-sequential, reasonably random code (e.g., 4-6 random alphanumeric characters excluding ambiguous ones like 0/O, 1/I) |
| Trusting client-submitted player identity/name for anything security-sensitive (e.g., letting the client claim "I am the host") | A player could self-declare host privileges (e.g., to end the game or change round count) by manipulating client state/network requests | Track "who is the host" as a server-side flag tied to the first joiner or a server-issued host token, never inferred from a client-sent flag |
| No rate limiting on join/submit endpoints | A bored/mischievous guest spam-submits or spam-joins with fake names, disrupting the game | Trivial rate limit per socket/IP on join and submit actions is sufficient given the tiny, trusted-room scale — not a priority to over-engineer, but a one-line guard is cheap insurance |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|--------------|-------------------|
| Blank/frozen screen during reconnect or cold-start with no feedback | Non-technical players assume the game/their phone is broken and give up or ask loudly for help, disrupting the party | Always show an explicit Hebrew-language status message ("מתחבר מחדש..." / "reconnecting...") whenever the client isn't in a fully-loaded state, with a visible spinner |
| No indication of how much time is left, or a countdown that's clearly wrong/desynced across phones | Players rush or relax based on wrong information; visible desync (Pitfall 8) undermines trust in the whole game | Server-synced countdown (Pitfall 8's fix) displayed prominently and consistently |
| Ambiguous or silent submit ("did my caption actually send?") | Players tap submit multiple times, or think it failed and stop participating | Immediate, clear visual confirmation on submit (checkmark / "caption sent, waiting for others") and disable the submit control after use |
| No easy way to distinguish two players with similar/identical names in voting/scoreboard | Confusion about who wrote/said what, awkward "wait which Danny" moments live | Enforce unique display names at join (Pitfall 3) |

## "Looks Done But Isn't" Checklist

- [ ] **Reconnect flow:** Often "works" only because the same tab/session was never actually closed — verify by force-quitting the browser app (not just backgrounding) and reopening via the same room code/localStorage.
- [ ] **Round timeout:** Often only tested by everyone submitting quickly — verify by having one test device deliberately never submit and confirming the round still advances on schedule.
- [ ] **Hebrew meme image:** Often only tested with a short, simple, all-Hebrew-letters caption — verify with a caption containing digits, punctuation, and at least one Latin word/name, and actually view the resulting PNG on a phone screen.
- [ ] **Late join:** Often only tested by joining before round 1 starts — verify by joining a brand-new device mid-round 2 or later and confirming a sane screen appears (not an error, not a blank state).
- [ ] **Hosting cold start:** Often "works" only because the developer has been actively pinging it during the build week — verify by leaving the deployed app fully idle for the platform's actual sleep window, then timing the first cold load.
- [ ] **Duplicate names:** Often only tested by one person joining at a time — verify by having two devices attempt the exact same name (including with different casing/whitespace) back-to-back.
- [ ] **Downloading the meme on iOS:** Often only tested on Android/desktop where downloads "just work" — verify the actual save-to-Photos flow on a real iPhone in Safari specifically.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|----------------|-------------------|
| Server went to sleep/cold-started mid-party | LOW (if warm-keeping wasn't set up) | Have someone (the host) open the URL from their own phone the moment guests start arriving and again ~5 min before starting, well ahead of anyone else, so the cold start happens before it matters; keep a paid/always-on tier as the real fix |
| A player's device is completely broken/lost mid-game (they can't reconnect at all) | LOW | Because player identity/score lives server-side keyed by playerId, they can rejoin on a *different* device by re-entering the room code + their exact same name if a "claim existing player" join path is supported — worth adding as a small fallback given real party chaos |
| Room state gets into a genuinely stuck/corrupted state during the live event | MEDIUM | Have a host-only "force-advance round" or "reset room" control built in as a break-glass tool — cheap to build, and far better than restarting the whole server (which loses everything) |
| Hebrew meme rendering turns out broken on party day despite testing | HIGH if discovered live, LOW if caught in rehearsal | This is exactly why Pitfall 6 must be resolved by day 2, not discovered on day 7 — the recovery if it fails live is essentially "the souvenir feature is broken for the rest of the night," which is why it's flagged as a go/no-go gate |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|-------------------|----------------|
| Backgrounding/socket death (1), client-side timers (8) | Real-time/networking foundation phase | Manual test: lock phone screen for 30-60s mid-round, confirm clean resync on unlock |
| Weak WiFi / split networks (2) | Real-time/networking foundation phase | Rehearsal with real phones on real mixed networks (see protocol) |
| Late join, duplicate names (3) | Game-loop/state-machine phase | Scripted test: join mid-round with a new device; join two devices with identical names |
| Stalled round on non-responder (4) | Game-loop/state-machine phase (earliest priority) | Test: one device deliberately never submits; confirm round still advances |
| Refresh/rejoin/rage-quit (5) | Real-time/networking phase (persistence) + game-loop phase (rejoin logic) | Force-quit and reopen browser app mid-game; confirm identity/score restored |
| Hebrew canvas bidi rendering (6) | Meme/image-generation phase — treated as day-1/2 spike | Visual inspection of a generated PNG with mixed Hebrew/digit/Latin caption |
| RTL layout mirroring (7) | UI/frontend phase, from first component | Read every screen aloud in Hebrew word order on a real phone |
| Race conditions on submit (9) | Game-loop/state-machine phase | Scripted near-simultaneous submit test from 2+ clients |
| Free hosting sleep/cold-start (10) | Deployment/hosting phase | Let deployed instance idle for the platform's sleep window, time the cold start |
| Scope creep / plumbing-last (11) | Roadmap sequencing itself | Check by day 3: has the full loop been played end-to-end on 2+ devices yet? |
| No real multi-device rehearsal (12) | Dedicated rehearsal phase, day 6 (1 day before event) | See rehearsal protocol below — pass/fail against a real checklist |

---

## Pre-Party Rehearsal Protocol

This is the single most important risk-reduction activity for a one-shot live event. Schedule it **at least 24 hours before the party**, so there is time to fix what breaks. Do not treat this as optional or as "we'll test as we go" — a dedicated, scheduled, all-hands rehearsal is required.

**Recruit real people, real phones:**
- Get 10-12 real people (doesn't have to be the actual bachelor party guests — any friends/family willing to spend 20-30 minutes) each on their own personal phone. Emulators and browser devtools' "mobile view" do not count — they don't reproduce real iOS Safari backgrounding, real screen-lock, or real network conditions.
- Deliberately mix devices: aim for at least 3-4 iPhones (different iOS versions if possible) and 3-4 Android phones (different manufacturers/ages — include at least one older/budget Android if anyone has one, since these often reveal performance and rendering issues newer flagships hide).
- Deliberately mix networks: have some players on the venue WiFi (or a WiFi network similarly loaded — e.g., a home router with 10+ devices on it) and some on mobile data, simultaneously, in the same rehearsal game.

**Run the actual conditions, not just a happy path:**
1. Full game start-to-finish, at the real intended round count, played normally by everyone — this alone will surface most UI/UX and basic functionality issues.
2. Mid-rehearsal, deliberately have 2-3 people lock their phone screens for 30-60 seconds during a writing or voting phase, then unlock and confirm they land back in the correct, current state.
3. Deliberately have one person never submit a caption or vote for an entire round; confirm the round still advances on schedule for everyone else.
4. Deliberately have one person join late — after round 2 has already started — using the room code; confirm they land somewhere sensible.
5. Deliberately have one person refresh their browser tab (or fully force-quit and reopen) mid-game; confirm they can get back in with their identity/score intact.
6. Deliberately have two people join with the exact same first name (test both simultaneous and sequential joins); confirm the app handles it (rejects duplicate or auto-disambiguates) rather than silently corrupting the scoreboard.
7. At least once, have 3+ people submit their caption/vote within the same second of each other (count down "3-2-1-submit" out loud); confirm no submission is lost.
8. Have every participant actually download/save at least one generated meme with a real Hebrew caption containing at least one number, and visually confirm on their own phone that the text reads correctly right-to-left, not reversed or garbled — this must be checked individually since rendering can vary by device/OS.
9. Let the deployed server sit completely idle (no traffic at all) for at least the sleep-window duration of whatever hosting tier is used (check the specific platform's policy — Pitfall 10), then have the first rehearsal-day player load the app cold and time how long it takes; if this exceeds a few seconds, the warm-keeping/paid-tier mitigation needs to be finalized before party day.
10. If the app supports a host "force-advance"/"reset" control, deliberately trigger it once during the rehearsal to confirm it works and doesn't corrupt state for other players.

**After the rehearsal:**
- Write down every failure observed, however minor, and fix the ones that map to the pitfalls above before party day — do not dismiss anything as "probably won't happen again," since a one-shot live event gives no second chances.
- Re-run at minimum steps 2, 3, 4, 5, and 8 (the highest-likelihood real-party scenarios) a second time after fixes, ideally the day before the event, with a smaller group (3-4 people) as a final smoke test.
- On the actual party day, before guests arrive: do one last solo pass confirming the app loads fresh (cold start timing), the QR code/room code join flow works, and the photo set is loaded correctly — then leave the server warm-keeping mechanism running through the whole event.

---

## Sources

- [Bugzilla #402276 — Canvas text routines draw right-to-left text backwards (Firefox)](https://bugzilla.mozilla.org/show_bug.cgi?id=402276)
- [Bugzilla #1286659 — Allow unicode-bidi: bidi-override in Canvas 2D APIs](https://bugzilla.mozilla.org/show_bug.cgi?id=1286659)
- [MDN — CanvasRenderingContext2D: direction property](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/direction)
- [W3C CSS mailing list — Hebrew in Firefox reversed characters](https://lists.w3.org/Archives/Public/public-css-archive/2019Oct/0195.html)
- [GitHub Automattic/node-canvas — text/font rendering discussion](https://github.com/Automattic/node-canvas/issues/53)
- [Wikipedia — Text shaping (HarfBuzz, complex scripts)](https://en.wikipedia.org/wiki/Text_shaping)
- [Render Docs — Deploy for Free (spin-down/cold-start policy)](https://render.com/docs/free)
- [Render — Platforms with a real free tier for developers in 2026](https://render.com/articles/platforms-with-a-real-free-tier-for-developers-in-2026)
- [Justin McKelvey — Is Render Free? Free Tier Limits, Sleep, and the 30-Day DB (2026)](https://justinmckelvey.com/blog/is-render-free)
- [DEV Community — Render vs Railway vs Fly.io: Pricing Compared (2026)](https://dev.to/pavel-hostim/render-vs-railway-vs-flyio-pricing-compared-2026-2e5p)
- [SaaSPricePulse — Fly.io Free Tier 2026: What's Left After the Cuts?](https://www.saaspricepulse.com/tools/flyio)
- [GitHub socketio/socket.io #2924 — Safari dropping WebSocket connection due to inactivity when page not in focus](https://github.com/socketio/socket.io/issues/2924)
- [Apple Developer Forums — WebSocket closed after backgrounding on iOS 15 Safari](https://developer.apple.com/forums/thread/731211)
- [Socket.IO Docs — Connection state recovery (explicitly does not survive server crash/restart)](https://socket.io/docs/v4/connection-state-recovery)
- [Socket.IO Docs — Tutorial: Handling disconnections](https://socket.io/docs/v4/tutorial/handling-disconnections)
- [WebSocket.org — WebSocket Reconnection: State Sync and Recovery Guide](https://websocket.org/guides/reconnection/)
- [OpenReplay — When 100vh Lies: Fixing Mobile Viewport Issues](https://blog.openreplay.com/fix-100vh-mobile-viewport/)
- [DEV Community — Why CSS dvh ignores the mobile keyboard](https://dev.to/rl0425/why-css-dvh-ignores-the-mobile-keyboard-and-how-to-fix-it-31ao)
- Domain/professional experience with real-time multiplayer game architecture, RTL web development, and mobile browser quirks (MEDIUM confidence, cross-checked against sources above where verifiable)

---
*Pitfalls research for: real-time multiplayer browser party game (Hebrew/RTL, phone-only, single live event)*
*Researched: 2026-09-05*
