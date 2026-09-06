export const ROOM_CAPACITY = 20; // D-05
export const MIN_PLAYERS_TO_START = 3; // D-11
export const ROOM_CODE_LENGTH = 4; // D-01
// D-08's stated range is 12-15 user-perceived characters; taking the upper
// bound so no legitimate name is clipped.
export const MAX_NAME_GRAPHEMES = 15;
export const PING_INTERVAL_MS = 10_000; // RESEARCH A3 — tuned down for fast dead-socket detection
export const PING_TIMEOUT_MS = 8_000; // RESEARCH A3
export const SERVER_PORT = Number(process.env.PORT ?? 3001);

// Worst case before Socket.IO itself concludes a socket is dead (a client
// that goes silent right after answering a ping has up to a full interval
// plus a full timeout before the server gives up on it).
export const DEAD_SOCKET_WINDOW_MS = PING_INTERVAL_MS + PING_TIMEOUT_MS; // 18s

// D-13: how long a disconnected player stays in the lobby roster before
// fading. D-16: how long the room waits for a dead host before moving host
// powers. Both derive from DEAD_SOCKET_WINDOW_MS on purpose (RESEARCH.md
// Pitfall 2) — two independently chosen numbers would let a player fade
// before the same disconnect had even started the host-transfer countdown.
//
// Plan 01-01's real-phone human-check measured the RETURN side of this: a
// woken phone resyncs and lands back on the correct roster with no
// perceptible delay ("seems instant"). That evidence removes any pressure to
// shorten these numbers defensively for the returning player's sake — they
// never flicker regardless of how long or short the grace is, because the
// resync itself is effectively instantaneous. What it does NOT settle is how
// long the OTHER players should wait before a vanished player is shown as
// gone, which is a live-audience UX judgment bounded below by
// DEAD_SOCKET_WINDOW_MS, not something the instant-reconnect measurement
// speaks to either way. Absent a real stopwatch read on an actual lock/blip
// duration, the original RESEARCH.md A3 reasoning is retained rather than
// re-guessed: 30s of roster grace comfortably covers a quick glance at a
// phone without reading as broken once someone has genuinely left, and 60s
// (2x) gives the host-transfer countdown enough margin that the lobby fade
// and the host handover can never race each other into an inconsistent
// state. The literal on-device stopwatch confirmation (locking a real phone
// for 10s/30s/45s/90s and watching what these numbers actually produce) is
// this plan's own Task 3 human-check and still requires real phones this
// environment does not have — see 01-04-SUMMARY.md's "Still requires a real
// phone" section.
export const ROSTER_FADE_GRACE_MS = DEAD_SOCKET_WINDOW_MS + 12_000; // 30s
export const HOST_TRANSFER_GRACE_MS = ROSTER_FADE_GRACE_MS * 2; // 60s

// PUBLIC_BASE_URL (optional): when set, this is the authoritative origin
// used to build every join URL and QR code, regardless of what the
// connecting socket's own handshake headers report. Phase 7's deployment
// sets this on the deployed host; local/LAN dev derives the origin from
// headers instead (see rooms/joinUrl.ts's resolveOrigin). Read directly from
// process.env at the point of use, not re-exported as a constant here,
// since it must reflect whatever is set at request time.

// Cheap insurance against a bored guest spamming room creation/joins
// (PITFALLS.md's "unbounded room creation / join spam" note). Deliberately
// scoped to create-room/join-room only — a phone reconnecting repeatedly on
// a bad network must never be locked out of its own room by this.
export const RATE_LIMIT_WINDOW_MS = 10_000;
export const RATE_LIMIT_MAX_INTENTS = 10;
