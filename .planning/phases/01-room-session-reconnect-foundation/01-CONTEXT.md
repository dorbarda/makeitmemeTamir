# Phase 1: Room, Session & Reconnect Foundation - Context

**Gathered:** 2026-09-05
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers everything about **getting into a room and staying in it** — and nothing else.

In scope: creating a room, sharing the way in, joining with a display name, seeing who else is
here, and surviving a phone lock, a page refresh, or a brief disconnect without losing your
identity or your score.

Explicitly NOT in this phase: photos, captions, the rating mechanic, scoring rules, timers for
gameplay phases, the meme image, or host recovery buttons. Those are Phases 2-6. Covers
LOBBY-01 through LOBBY-05 and LIVE-02.

</domain>

<decisions>
## Implementation Decisions

### Getting In
- **D-01:** The room code is **4 digits** (e.g. `4827`). Digits open the numeric keypad on every
  phone, are fastest to type, are easy to shout across a loud room, and avoid any confusion
  between Hebrew and Latin letters.
- **D-02:** The primary way in is a **WhatsApp link pasted into the group chat**, not a QR code
  scanned off the host's phone. With ~12 people joining at once, crowding around one phone is the
  slow path; a link everyone taps is the fast one.
- **D-03:** The link **embeds the room code**, so a joiner sees exactly one screen: type a display
  name, tap join. — **Reversibility:** reversible — the manual-code path below already exists as
  the fallback, so changing what the link carries touches only link generation and one route.
- **D-04:** Manual 4-digit code entry remains supported as a fallback for anyone not in the
  WhatsApp group. The QR code (LOBBY-02) is still built and shown, but it is the secondary path.
- **D-05:** Room capacity is capped at roughly **20 players**. Anyone beyond the cap sees a clear
  Hebrew message rather than a broken screen. The cap is generous enough to absorb surprises but
  keeps the room within a size the server is actually tested for.

### Names & Clashes
- **D-06:** Names are **free text** — players type whatever they want, real name or inside joke.
  No preset nickname list.
- **D-07:** Duplicate names are resolved by **automatically appending a number** (a second "Dor"
  becomes "Dor 2") rather than rejecting the name. Nobody is ever blocked at the door.
- **D-08:** Names are limited to roughly **12-15 characters** so they fit the scoreboard on a small
  phone. **Emojis are allowed** — it is a party.
- **D-09:** A player **can rename themselves while waiting in the lobby**, but the name **locks
  once the game starts** so scores are never ambiguous mid-game. This is the deliberate escape
  hatch for D-07: auto-numbering never blocks anyone, and lobby renaming lets them fix an unwanted
  number or a typo before play begins.

### The Waiting Room
- **D-10:** The **host is also a full player** — writes captions and rates like everyone else, and
  additionally holds the host controls. At a 12-person party nobody should sit out.
- **D-11:** The host can start the game once **at least 3 players** have joined. The rating
  mechanic needs an author plus at least two people to rate, so below 3 the game is not meaningful.
- **D-12:** The lobby screen shows a **live roster of names, a ready count, and the room code kept
  visible** so anyone — not just the host — can re-share the code to a straggler.
- **D-13:** A player who leaves before the game starts **fades from the roster only after a short
  grace delay**, so a phone lock or a two-second network blip is never mistaken for leaving.

### Coming Back
- **D-14:** On reconnect the player lands **straight back on whatever screen the game is currently
  showing** — no "welcome back" popup, no extra tap while a timer is running. Reconnection should
  feel like nothing happened.
- **D-15:** A half-typed caption is **NOT preserved** across a disconnect; the caption box starts
  empty on return. Chosen deliberately for build simplicity over convenience, accepting that a
  player who locks their phone mid-caption will have to retype.
- **D-16:** If the **host's phone dies**, host powers **transfer automatically to another player**
  after a short grace period, so the game keeps moving. The original host rejoins as an ordinary
  player. — **Reversibility:** costly — host authority is checked wherever a host-only action is
  handled, so moving from automatic transfer to manual hand-off later means revisiting every one
  of those checks plus the reconnect path.
- **D-17:** A player who leaves mid-game and never returns **stays on the scoreboard** with their
  score and past memes intact, but play **never waits for them**. They may rejoin at any time.

### Claude's Discretion
The user made no "you decide" calls in this discussion. The following remain technical choices for
research and planning, and were deliberately not put to the user:
- Session-token mechanics: token format, where it is stored on the device, and its lifetime.
  Research already established that identity must be an app-level token, never the raw socket id,
  because the socket id is regenerated every time a phone wakes.
- Length of the "short grace delay" in D-13 and D-16 — pick from real reconnect timing, not taste.
- Whether room state lives in a single in-memory object keyed by code, and how a room is disposed.
- Transport and reconnect-backoff configuration.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project scope and requirements
- `.planning/PROJECT.md` — core value, constraints, and the full out-of-scope list
- `.planning/REQUIREMENTS.md` — LOBBY-01..05 and LIVE-02 are this phase's requirements
- `.planning/ROADMAP.md` — Phase 1 goal, success criteria, and what is deferred to Phases 2-6

### Architecture and session model (most important for this phase)
- `.planning/research/ARCHITECTURE.md` — room/session model, why identity must be an app-level
  session token rather than the socket id, full-state-resync-on-reconnect, and the argument for
  building join/reconnect first as the riskiest integration point
- `.planning/research/SUMMARY.md` — the cross-cutting consensus across all four research files

### Stack and failure modes
- `.planning/research/STACK.md` — transport recommendation and the hosting comparison
- `.planning/research/PITFALLS.md` — iOS Safari dropping connections on backgrounding, client
  state never being trusted after a wake, and the danger of client-owned timers

Note: no external ADRs or specs exist for this project — all decisions live in the files above
plus the `<decisions>` section of this document.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
None. This is a greenfield repository — it currently contains only GSD tooling under `.claude/`
and the planning documents under `.planning/`. There is no application source code, no package
manifest, and no dependency tree yet.

### Established Patterns
None in code. The binding constraints come from research rather than from an existing codebase:
- Identity is an app-level session token persisted on the device, never the socket id
- The server is the sole authority on state; clients render what they are told
- Every reconnect and window-focus triggers a **full state resync**, never an incremental diff

### Integration Points
This phase establishes the foundation every later phase builds on, so its shape matters more than
usual. It must create: the server room registry, the join/rejoin path, and the client-side session
store. Phase 2's round engine attaches its state machine to the room object this phase defines.

</code_context>

<specifics>
## Specific Ideas

- The reference point for the overall game is the general caption-and-vote party format popularised
  by makeitmeme.com. Only the format is shared — no code, artwork, fonts, or branding from that
  site is used anywhere.
- The WhatsApp group is the real distribution channel for the party. The join link should be
  pasteable into a chat and work on first tap, since that is how every guest will actually arrive.
- The party is a **surprise**, which is why capacity is proven by a simulated load test (Phase 8)
  and the real-phone rehearsal (Phase 9) is deliberately kept to only 3-4 people.

</specifics>

<deferred>
## Deferred Ideas

- **Joining mid-game** — a player arriving after the game has started being dealt in from the next
  round. Already tracked as v2 `SOCL-01` in REQUIREMENTS.md; not part of Phase 1.
- **Preset funny Hebrew nicknames** as quick-pick buttons at name entry. Offered during discussion
  and not chosen; free text was preferred. Recorded in case it is wanted later.
- **A visible host crown / explicit host marker** in the lobby. The user chose the simpler roster
  showing names, count and code. Worth revisiting in Phase 6 when host controls are built.
- **Showing departed players greyed out as "disconnected"** rather than fading them from the
  roster. Considered and not chosen for the lobby; the same question returns in Phase 4 for
  in-game presence.

</deferred>

---

*Phase: 1-Room, Session & Reconnect Foundation*
*Context gathered: 2026-09-05*
