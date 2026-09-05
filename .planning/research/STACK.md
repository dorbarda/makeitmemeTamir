# Stack Research

**Domain:** Real-time, browser-based, mobile-first multiplayer party game (Hebrew/RTL, caption-writing + voting, ~10-15 simultaneous players, one-night event, one-week build)
**Researched:** 2026-09-05
**Confidence:** MEDIUM-HIGH (all findings web-verified against multiple independent sources: official docs, MDN, GitHub issue trackers, vendor pricing pages; no library was recommended on memory alone)

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| React | 19.x | Frontend UI | Standard SPA framework; AI-assisted coding tools have the deepest, most reliable training on React, which matters more than any technical edge for a one-week build. No i18n framework needed — Hebrew is the *only* language required (English is explicitly out of scope), so all strings are hardcoded Hebrew and the whole app is set to `dir="rtl"` once at the root. |
| Vite | 8.x (8.2.2 as of Sep 2026, requires Node 20.19+/22.12+) | Build tool / dev server | Fastest, lowest-friction React scaffold (`npm create vite@latest`); zero config needed for a single-page app. |
| Node.js + Express | Node 20/22 LTS, Express 4.x | Backend HTTP + static hosting + Socket.IO attach point | Minimal, well-understood; only needed to serve the built frontend and host the Socket.IO server — no REST API design required. |
| Socket.IO (server: `socket.io`, client: `socket.io-client`) | 4.8.x (4.8.3 latest, Dec 2025) | Real-time transport for rooms, rounds, votes, reconnection | See dedicated section below — this is the highest-leverage decision in the stack. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `qrcode` (npm) | 1.5.x | Generate a QR code (as data URL or SVG) for the room join code | Host screen only — render server-generated join URL as a QR image so players can scan instead of typing a code. |
| `nanoid` | 5.x | Generate short, URL-safe room codes and player/session IDs | Use a small custom alphabet (e.g., uppercase letters + digits, no ambiguous chars) at length 4-5 for a human-typeable room code; use default nanoid for internal session tokens. |
| `Heebo` and/or `Assistant` (Google Fonts, self-hosted via `@fontsource/heebo` / `@fontsource/assistant`) | latest | Hebrew UI typeface + caption typeface on the meme image | Both are free, full-Hebrew-coverage, mobile-legible Google Fonts (Heebo is Roboto's Hebrew companion; Assistant is a clean contemporary sans in 6 weights). Self-host via `@fontsource` rather than a Google Fonts CDN `<link>` so the font is guaranteed loaded (and cached) before you draw text onto canvas — a runtime `document.fonts.ready` / `FontFace.load()` check is required either way before compositing, or the browser will silently fall back to a system font mid-render. |
| Zustand (optional) | 5.x | Lightweight shared client state (current player, round, scores) | Only if plain `useState`/`useContext` plus Socket.IO event listeners start feeling tangled; not required for a game this small — don't add it pre-emptively. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| TypeScript | Type safety on both client and server | Recommended, not mandatory. The highest-value place for it is the server's room/game-state module (round index, submitted captions, votes, scores) — that's exactly the code where an off-by-one or a wrong event payload shape causes a visible failure in front of 15 people. If time pressure mounts, drop TS on the frontend first and keep it on the server. |
| ESLint (default Vite template config) | Catch obvious bugs fast | Use the Vite-generated default config; don't spend build time tuning lint rules. |

## Real-Time Transport (primary recommendation and reasoning)

**Recommendation: Socket.IO (not raw WebSocket, not Colyseus, not a hosted realtime SaaS) on a single Node/Express process holding all room state in memory.**

Considered options and why each was accepted/rejected for *this* project specifically (10-15 players, one room, turn-based caption+vote loop, one-week deadline, reliability is the top priority):

- **Raw WebSocket (`ws` package or native `WebSocket`)** — Technically sufficient for this scale, but you would hand-roll everything Socket.IO gives for free: automatic reconnection with backoff, room/broadcast helpers (`io.to(room).emit(...)`), and connection-state recovery. For a one-week build, reinventing reconnection logic is exactly the kind of "invisible until game night" risk this project can't afford. **Rejected**: more code to get right, no upside at this scale.
- **Socket.IO** — Gives rooms, broadcast-to-room, and built-in **Connection State Recovery** (a v4.6+ feature): on an unexpected disconnect the server holds the socket's id, rooms, and last state briefly, and a reconnecting client can recover missed events automatically. This directly serves the "player who briefly loses connection can rejoin without breaking the game" requirement. Caveat found in research: Connection State Recovery is not magic for a genuine network-interface change (e.g., WiFi→LTE) — `socket.recovered` can come back `false` because the new connection arrives before the old one times out — so **your own reconnection flow still needs a fallback**: on the client, store the room code + player name (and a per-player session token issued at join) in `localStorage`/`sessionStorage`; on `connect`, always emit an explicit `rejoin(roomCode, sessionToken)` and have the server reconcile from its authoritative in-memory state rather than depending solely on Socket.IO's built-in recovery. **Selected**: best power-to-effort ratio, and it degrades gracefully when its automatic recovery isn't enough because you still control the rejoin path explicitly.
- **Colyseus** — A full room + state-synchronization framework with schema-based delta compression, matchmaking, and horizontal scaling via Redis. This is aimed at real-time action games (shooters, .io games) where bandwidth-efficient state diffing matters. A caption-and-vote game sends small, infrequent JSON payloads (a caption per player per round, a vote per player per round) — Colyseus's core value proposition (binary delta sync) is irrelevant here, and its schema/room lifecycle API is a new thing to learn under a one-week deadline. **Rejected**: solves a problem this project doesn't have, at the cost of learning time you don't have.
- **PartyKit (Cloudflare Workers/Durable Objects)** — Now part of Cloudflare (acquired April 2024), actively maintained, generous free tier, and Workers/Durable Objects don't sleep the way a free Render web service does — this is a genuinely strong reliability argument. However, it requires learning the Durable Objects storage/room-lifecycle model and its own client library, which is new ground for a one-week build with no existing code. **Viable alternative, not primary** — pick this instead of Socket.IO+Render only if the developer is already comfortable with Cloudflare Workers; otherwise the learning curve is a bigger risk than Render's free-tier sleep behavior (which has a simple manual mitigation — see Hosting below).
- **Hosted realtime SaaS (Supabase Realtime, Pusher, Ably)** — These are built for broadcasting state changes from a database or a thin backend, not for owning authoritative multiplayer game logic (whose turn it is, timers, scoring). Using one would mean building your own state machine anyway *plus* learning a third-party pub/sub SDK *plus* dealing with their free-tier connection/message caps (typically 100-200 concurrent connections or a fixed monthly message quota — comfortably above 10-15 players, but an unnecessary extra account/service and unnecessary extra failure point for zero benefit at this scale). **Rejected**: adds a dependency and an account to manage without solving a problem plain Socket.IO doesn't already solve.

## Server / Room State — no database needed

The entire game (room roster, current round, photo shown, submitted captions, votes, running scores, "best of the night" leaderboard) fits comfortably in a single **in-memory JavaScript object on the Node process**, keyed by room code. Reasoning:

- It's one room, one event, one night. There is no requirement to persist anything after the party ends (memes are downloaded by players on the night; "Out of Scope" explicitly excludes persistent history across games).
- A single Render free-tier instance is exactly one process — there is no horizontal scaling to coordinate, so there's no need for Redis or any shared-state store that a multi-instance deployment would require.
- The photo set (Tamir's images) can be loaded once from a local `/public` or `/assets` folder at server start and served as static files — no database or CMS needed to manage them; a plain JSON manifest (filenames + a "used" flag per room, held in memory) satisfies the "no repeats" requirement.
- **Explicit warning**: because state is in-memory, a server *restart* (crash, redeploy, or Render's free-tier idle spin-down cycling the process) wipes all in-progress games. This is an acceptable trade-off for a single-night, low-stakes build, but it means: (a) don't redeploy during the party, and (b) see the Render keep-awake mitigation below so the process isn't cycling during the event.

## Image + Text Compositing — the critical RTL risk area

This is the part of the stack where several popular, otherwise-good libraries **silently produce wrong output for Hebrew** and must be actively avoided.

**Recommendation: client-side HTML5 Canvas 2D API, native browser API, no library.**

Concretely: load the photo onto an offscreen `<canvas>`, set `ctx.direction = 'rtl'`, `ctx.textAlign = 'right'` (or `'center'` for centered captions), pick a loaded web font (Heebo/Assistant), implement a small manual word-wrap function (split the caption on spaces, keep appending words to a line until it exceeds the target pixel width, `ctx.measureText` per candidate line — this is not RTL-specific, canvas never auto-wraps in any language), then call `ctx.fillText()` once per wrapped line. Finish with `canvas.toBlob()` to get a PNG/JPEG file for download.

Why this wins over the alternatives, with the specific breakage found in research for each:

| Approach | RTL/Hebrew verdict | Verdict detail |
|----------|--------------------|-----------------|
| **Browser Canvas 2D API** (`ctx.direction='rtl'` + `fillText`) | **Correct, use this** | `CanvasRenderingContext2D.direction` has been a *baseline* (widely supported) feature across Chrome and Safari, including mobile, since May 2022. Setting it before `fillText()` makes the browser apply proper Unicode bidi reordering and correct Hebrew glyph shaping. This is a native browser API — zero dependencies, zero bundle size, works entirely client-side (which also means no server round-trip is needed to produce a downloadable image). |
| **html2canvas** | **Broken for Hebrew — do not use** | Long-standing, still-open GitHub issues (spanning 2013-2021) document RTL/Arabic/Hebrew text rendering as tangled, out of order, or corrupted by `text-align: center`. This is a known, unresolved *class* of bug in the library, not a one-off. |
| **satori / `@vercel/og`** | **Broken for Hebrew — do not use** | Satori shapes complex-script glyphs via HarfBuzz but does **not** yet implement full Unicode bidirectional layout. A PR adding Arabic/Hebrew RTL support (#745) was opened in April 2026 and was still unmerged as of this research. Mixed-direction text (e.g., a Hebrew caption with an embedded number) will not match correct browser ordering. This rules out the common "generate OG-style images with JSX+CSS" pattern for this project. |
| **sharp + SVG `<text>` compositing** | **Works, but unnecessary** | `sharp` has no built-in text API; the standard workaround is building an SVG `<text>` element and `sharp.composite()`-ing it onto the base image. Adding `direction="rtl"` to the `<svg>` root sets correct base direction, and because sharp rasterizes SVG via libvips/librsvg (which uses Pango for text shaping), Hebrew bidi and glyph shaping are handled correctly. This is a legitimate *server-side* option, but it requires a network round-trip (upload/compose/download) that a one-week, client-side-first build doesn't need, and SVG-with-text compositing is measurably slower (seconds, not milliseconds) than plain image composites. **Keep as a documented fallback only** — e.g., if a later requirement needs a server-generated image without requiring the viewer's own device to render it. |
| **node-canvas** (server-side) | **Works, same family as browser Canvas** | Cairo+HarfBuzz-backed; supports `ctx.textDirection='rtl'` with logical-order input text, same mental model as the browser API. Only relevant if compositing needs to move server-side later — not needed for the MVP. |

**Getting the downloaded file into the user's hands (mobile-specific, not RTL-specific but critical to the same requirement):**
- `canvas.toBlob()` → `URL.createObjectURL(blob)` → `<a href={url} download="tamir-meme.png">` works reliably on desktop and Android Chrome.
- iOS Safari's historical support for the `download` attribute has been inconsistent across versions (older WebKit versions largely ignored it and simply navigated to the blob URL instead of downloading). Given "mixed/older Android and iOS phones" is an explicit requirement, **do not rely on the `download` attribute alone on iOS**. The robust pattern for 2025/2026 mobile Safari is: attempt `navigator.share({ files: [file] })` (Web Share API Level 2 file sharing, supported on iOS Safari 15+ and modern Android Chrome) first — this opens the native share sheet with a direct "Save to Photos"/"Save Image" option — and fall back to displaying the composited image full-screen with instructions to long-press-and-save if `navigator.canShare({ files: [...] })` returns false. This detail belongs in the phase that implements the download flow, but it materially affects whether the "download a meme" requirement actually works on the phones in the room, so it's flagged here.

## Hosting / Deployment

**Recommendation: Render.com free "Hobby" web service**, running the Node/Express + Socket.IO server (which also serves the built React app as static files, so it's a single deployable service).

| Platform | WebSocket support | Free tier reality (2026) | Verdict |
|----------|--------------------|-----------------------|---------|
| **Render** | Yes, on the free plan | 750 free instance-hours/month (≈ one always-on free service); the free service **spins down after 15 minutes with no inbound HTTP request or WebSocket message**, and takes about a minute to wake on the next connection. | **Use this.** Mitigation for the sleep behavior: the host opens/pings the deployed URL 5-10 minutes before players start joining (a manual "wake it up" step is a one-time, zero-code action); once the game is underway, continuous WebSocket traffic from active players counts as inbound traffic and keeps the service awake for the rest of the night. |
| **Vercel** | No (for this project's needs) | Vercel Functions gained a *beta* of native WebSocket support in June 2026, but connections are capped at 5 minutes by default (30 min only on paid plans), are single-instance/session-scoped, and provide no fan-out/presence across instances without an external pub/sub store (e.g., Redis) — wrong shape for a 10-15 player broadcast room. | **Do not use** for the realtime server. (Fine for nothing here, since the frontend is bundled with the same Express server — no separate static host needed.) |
| **Netlify** | No | Same serverless-function model as Vercel; cannot hold a persistent WebSocket connection. | **Do not use** for the realtime server. |
| **Fly.io** | Yes (technically) | Free allowances were removed for new accounts starting October 2024; 2026 signups get only a short (2-hour or 7-day) trial before billing kicks in. | **Not a free option** — skip. |
| **Railway** | Yes | No permanent free tier in 2026: a one-time $5 trial credit (30 days), then a $0/mo "Free" plan whose usage allowance can't reliably sustain even one always-on tiny service. | **Not a reliable free option** — skip. |
| **Glitch** | N/A | Glitch shut down project/app hosting entirely in July 2025. | **Does not exist anymore** — do not plan around it. |
| **PartyKit (Cloudflare Workers/Durable Objects)** | Yes, natively (edge, no sleep) | Now part of Cloudflare; Durable Objects are available on the Workers **Free** plan (per an April 2025 platform change) with generous free usage limits, and Workers do not spin down/sleep the way a free container host does. | **Strong alternative primary**, specifically *because* it removes the Render sleep risk entirely. Only reason it isn't the top pick here: it requires adopting Cloudflare's Durable Objects room/storage model, which is new-to-most-teams surface area to learn correctly inside a one-week deadline. If the developer already knows Cloudflare Workers, **this is arguably the more reliable choice** — swap it in. |

## Hebrew Web Fonts

| Font | Why it works well on mobile | Source |
|------|------------------------------|--------|
| **Heebo** | Hebrew companion to Roboto; clean, well-spaced, high-contrast at small sizes — reads well on phone screens. 9 weights available. | Google Fonts / `@fontsource/heebo` |
| **Assistant** | Contemporary Hebrew+Latin sans, 6 weights (ExtraLight-Black), full Hebrew glyph set. | Google Fonts / `@fontsource/assistant` |
| **Noto Sans Hebrew** | Broadest Unicode coverage, safe fallback if a name/emoji uses non-Hebrew characters. | Google Fonts / `@fontsource/noto-sans-hebrew` |

Practical notes carried over from research: use slightly larger font sizes and generous word-spacing for Hebrew than you would for Latin text at the same visual weight; **do not** apply CSS `letter-spacing` to Hebrew text — it breaks Hebrew letterforms/ligature-like joining cues that Latin typography doesn't have the same sensitivity to. Self-host via `@fontsource/*` packages (bundled with the app, loaded via `import`) rather than a Google Fonts `<link>` CDN call, both to remove a runtime network dependency on party night and so you can reliably `await document.fonts.ready` (or `FontFace.load()`) before compositing text onto the canvas — drawing text before the custom font has finished loading silently falls back to a system font mid-canvas-draw.

## Installation

```bash
# Frontend (React + Vite)
npm create vite@latest client -- --template react-ts
cd client
npm install socket.io-client
npm install @fontsource/heebo @fontsource/assistant

# Backend (Node + Express + Socket.IO)
mkdir server && cd server
npm init -y
npm install express socket.io nanoid qrcode
npm install -D typescript @types/express @types/node tsx

# Optional
npm install zustand
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|--------------------------|
| Socket.IO on Node/Express | PartyKit on Cloudflare Workers | If the developer already knows Cloudflare Workers/Durable Objects — removes the Render free-tier sleep risk entirely, at the cost of a steeper one-week learning curve for someone new to it. |
| Socket.IO | Colyseus | If the game evolves toward real-time simultaneous movement/action (not this project's caption+vote loop) where bandwidth-efficient binary state-diffing actually matters. |
| Render free web service | A VPS you already run (any always-on box) | If you already have a small always-on server (e.g., a home server, an existing DigitalOcean droplet) — removes the sleep-mitigation step entirely and is arguably more reliable than any free tier. |
| Client-side Canvas 2D compositing | sharp + SVG `<text>` server-side compositing | If you need the composited image to exist without requiring the downloading device to have rendered it itself (e.g., a server-side gallery of finished memes that anyone can fetch by URL after the event). Not needed for this project's scope. |
| In-memory room state, no DB | SQLite/Postgres | If "Persistent history of past games" ever comes back into scope (currently explicitly Out of Scope) — otherwise adding a database is pure unneeded complexity for a one-night event. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|--------------|
| `html2canvas` for compositing captions onto photos | Long-standing, unresolved GitHub issues show RTL/Hebrew/Arabic text rendering tangled or out of order — this will silently produce broken meme images. | Native browser Canvas 2D API with `ctx.direction = 'rtl'`. |
| `satori` / `@vercel/og` for generating the meme image | Does not yet implement full Unicode bidi layout (RTL support PR still open/unmerged as of April 2026); mixed-direction Hebrew text will render in the wrong order. | Native browser Canvas 2D API (client-side) or sharp+SVG (server-side, if ever needed). |
| Vercel or Netlify as the game server host | Both run on serverless functions with no support (or only a heavily time-capped beta, in Vercel's case) for the persistent, room-broadcast WebSocket connections this game needs. | Render free web service (or PartyKit/Cloudflare Workers if already comfortable with that model). |
| Fly.io or Railway as a "free" host | Neither has a genuine ongoing free tier in 2026 — both are trial-credit-then-billing models that can run out mid-buildup to the event. | Render free web service. |
| Glitch | Shut down project/app hosting in July 2025; it no longer exists as a hosting option. | Render free web service. |
| A database (SQLite/Postgres/Mongo) for game state | Unneeded complexity and another moving part that can fail on the night, for a single in-memory-sized, single-night, single-room game with no persistence requirement. | Plain in-memory JS object on the Node server process, keyed by room code. |
| CSS `letter-spacing` on Hebrew text | Distorts Hebrew letterforms; Hebrew typography conventions favor word-spacing adjustments instead. | Adjust `word-spacing` and font-size instead. |
| Relying only on `<a download>` for the meme download on iOS Safari | iOS Safari's `download` attribute support has been historically inconsistent across versions; a user tapping "download" on an unsupported version just navigates to the image instead of saving it. | Try `navigator.share({ files })` first (native iOS/Android share sheet with a genuine "Save Image" action), fall back to a full-screen image with long-press-to-save instructions. |

## Stack Patterns by Variant

**If the developer is already comfortable with Cloudflare Workers/Durable Objects:**
- Use PartyKit instead of Socket.IO+Render
- Because it removes the free-tier "sleep" reliability risk entirely (Workers don't cold-start-sleep the way a free container host does), and the free tier is genuinely ongoing (not a trial)

**If a later requirement needs a server-visible gallery of finished memes (not just device-local downloads):**
- Add `sharp` + SVG `<text>` server-side compositing as a second code path, keeping the client-side Canvas path as the default for the download-on-your-own-phone flow
- Because sharp+SVG correctly handles Hebrew via Pango/librsvg, unlike satori/html2canvas

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|------------------|-------|
| `socket.io@4.8.x` | `socket.io-client@4.8.x` | Keep server and client on matching major.minor Socket.IO versions to avoid protocol mismatches; Connection State Recovery requires both sides on a recent 4.6+ release. |
| `vite@8.x` | Node 20.19+ / 22.12+ | Vite 8 requires these Node versions (bundled Rolldown-based build) — verify Render's default Node runtime version meets this before deploying, or pin Node 22 explicitly in `package.json` `engines` / Render's Node version setting. |
| `@fontsource/*` fonts | Any bundler (Vite) | Import directly in an entry file (`import '@fontsource/heebo/400.css'`); no CDN dependency, works offline/at low-signal venues. |

## Sources

- MDN — `CanvasRenderingContext2D.direction` (browser support baseline since May 2022) — confidence MEDIUM (cross-checked against caniuse and WHATWG canvas spec discussion)
- Socket.IO official docs — Connection State Recovery — confidence MEDIUM
- GitHub — `niklasvh/html2canvas` issues #2488, #948, #686, #289 (RTL/Arabic rendering bugs) — confidence MEDIUM (multiple independent, long-standing reports)
- GitHub — `vercel/satori` PR #745 (Arabic/Hebrew RTL support, open as of April 2026) — confidence MEDIUM
- GitHub — `lovell/sharp` issue #1120 (text-on-image via SVG composite pattern) — confidence MEDIUM
- Render official docs (`render.com/docs/free`) and community reporting on free-tier spin-down behavior — confidence MEDIUM
- Vendor pricing/status pages and 2026 comparison articles for Fly.io, Railway, Vercel, Netlify WebSocket/free-tier status — confidence MEDIUM (cross-checked across multiple independent 2026-dated sources)
- Cloudflare Workers changelog (Durable Objects on Free plan, April 2025) and PartyKit/Cloudflare acquisition coverage (April 2024) — confidence MEDIUM
- npm registry — `socket.io`, `socket.io-client` (4.8.3), `vite` (8.2.2), `@vitejs/plugin-react` (6.1.1) current versions as of Sep 2026 — confidence MEDIUM
- Google Fonts specimen pages for Heebo, Assistant, Noto Sans Hebrew — confidence MEDIUM
- Apple Developer Forums / WebKit bug tracker threads on `download` attribute and Web Share API file-sharing behavior on iOS Safari — confidence LOW (version-specific behavior changes across iOS releases; treat as "needs a manual on-device smoke test before the event" rather than a settled fact)

---
*Stack research for: real-time Hebrew/RTL mobile party game (caption + vote), one-week greenfield build*
*Researched: 2026-09-05*
