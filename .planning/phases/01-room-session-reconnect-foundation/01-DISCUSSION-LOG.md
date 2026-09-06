# Phase 1: Room, Session & Reconnect Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-05
**Phase:** 1-Room, Session & Reconnect Foundation
**Areas discussed:** Getting in, Names & clashes, The waiting room, Coming back

---

## Getting In

| Option | Description | Selected |
|--------|-------------|----------|
| 4 digits, e.g. 4827 | Numeric keypad on every phone, easy to shout, no Hebrew/Latin letter confusion | ✓ |
| 4 English letters, e.g. TMIR | Can spell something funny, but slower to type and easy to mishear | |
| 6 digits | More combinations than one room needs, more to type | |

| Option | Description | Selected |
|--------|-------------|----------|
| WhatsApp link | One link in the group chat, everyone taps it — smoothest for 12 people at once | ✓ |
| QR on the host's phone | Works, but 12 people crowding one phone is slow | |
| Both link and QR | More flexible, slightly more work | |

| Option | Description | Selected |
|--------|-------------|----------|
| Straight in, just type your name | Link carries the code; one screen, fewest mistakes | ✓ |
| Show the code filled in, they confirm | One extra tap, but they learn the code | |
| They type the code themselves | Most steps; only worth it if the code should feel like a password | |

| Option | Description | Selected |
|--------|-------------|----------|
| Generous cap, around 20 | Absorbs surprises without exceeding a tested room size | ✓ |
| No limit | Nobody turned away, but a huge room makes rating drag | |
| Tight cap at 15 | Matches the expected group, risks locking out a late guest | |

**User's choice:** 4-digit code, WhatsApp link as the primary path, link jumps straight to name entry, ~20 player cap.
**Notes:** QR is still built (LOBBY-02) but demoted to the secondary path; manual code entry kept as the fallback for anyone outside the WhatsApp group.

---

## Names & Clashes

| Option | Description | Selected |
|--------|-------------|----------|
| Type anything they want | Free text — real name or inside joke | ✓ |
| Type a name, with funny suggestions offered | Joke Hebrew nicknames as quick buttons, still free to type | |

| Option | Description | Selected |
|--------|-------------|----------|
| Block it, ask for another | Everyone stays clearly identifiable | |
| Add a number automatically | Second "Dor" becomes "Dor 2"; nobody gets stuck | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Short limit, emojis allowed | ~12-15 chars so names fit the scoreboard; emojis fine | ✓ |
| Longer names allowed | More room to be funny, breaks layout on small phones | |
| Short limit, no emojis | Cleanest look, but annoying for no real benefit | |

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, while waiting in the lobby | Fix a typo before the game; locked once it starts | ✓ |
| No, name is fixed at join | Simplest, but a typo stays visible all night | |
| Yes, at any time | Most freedom, confusing scoreboard mid-game | |

**User's choice:** Free-text names, auto-numbered duplicates, ~12-15 char limit with emojis, renaming allowed in the lobby only.
**Notes:** Auto-numbering and lobby renaming were chosen as a deliberate pair — auto-numbering means nobody is ever blocked at the door, and lobby renaming is the escape hatch to fix an unwanted number before play starts.

---

## The Waiting Room

| Option | Description | Selected |
|--------|-------------|----------|
| Host plays too | Host writes and rates like everyone, plus holds host controls | ✓ |
| Host only runs the game | Wastes a player at a 12-person party | |

| Option | Description | Selected |
|--------|-------------|----------|
| At least 3 | Rating needs an author plus two raters | ✓ |
| At least 5 | Waits for a real crowd, blocks quick testing | |
| Host decides, no minimum | Risks starting a broken 2-person game | |

| Option | Description | Selected |
|--------|-------------|----------|
| Names, count, and the code | Anyone can re-share the code to a straggler | ✓ |
| Just names and count | Cleaner, but the host must hunt for the code | |
| Names, count, code, and who is host | Most informative, busier screen | |

| Option | Description | Selected |
|--------|-------------|----------|
| They disappear quietly after a short wait | Grace delay means a phone lock is not mistaken for leaving | ✓ |
| Show them greyed out as "disconnected" | Honest, slightly more cluttered | |
| Remove them instantly | A two-second blip would wrongly kick someone | |

**User's choice:** Host is a full player, minimum 3 to start, lobby shows names + count + code, departures fade after a grace delay.
**Notes:** The "who is host" marker was not chosen; noted as worth revisiting in Phase 6 when host controls are built.

---

## Coming Back

| Option | Description | Selected |
|--------|-------------|----------|
| Straight back into the live screen | No popup, no extra tap while a timer runs | ✓ |
| Short "welcome back" then continue | Reassuring, but costs a tap under time pressure | |

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, restore what they typed | Losing a caption mid-round is when people give up | |
| No, start the box empty | Simpler to build; retyping under a countdown is the cost | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Host powers pass to someone else automatically | Game keeps moving; original host returns as a normal player | ✓ |
| Game continues, nobody has host buttons | Risky if the host never returns | |
| Host can hand over before it happens | Useless in the case that matters — a battery dying without warning | |

| Option | Description | Selected |
|--------|-------------|----------|
| Stay on the scoreboard, skipped in play | Score and past memes still count; game never waits | ✓ |
| Remove them completely | Cleaner, but unfair and confusing | |

**User's choice:** Silent return to the live screen, caption drafts NOT preserved, automatic host transfer, abandoned players kept on the scoreboard.
**Notes:** The caption-draft answer went against the stated recommendation — the user chose build simplicity over convenience, accepting that a player who locks their phone mid-caption must retype. Recorded plainly in CONTEXT.md as D-15 so the tradeoff is visible rather than looking like an oversight.

## Claude's Discretion

The user made no explicit "you decide" calls. These were deliberately not put to the user and left
to research and planning as technical choices: session-token format, storage and lifetime; the
exact length of the grace delays; room-state storage and disposal; transport and reconnect-backoff
configuration.

## Deferred Ideas

- Joining mid-game (already tracked as v2 SOCL-01)
- Preset funny Hebrew nicknames as quick-pick buttons at name entry
- A visible host crown / explicit host marker in the lobby — revisit in Phase 6
- Showing departed players greyed out as "disconnected" — the same question returns in Phase 4 for in-game presence
