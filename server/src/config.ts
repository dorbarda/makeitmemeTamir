export const ROOM_CAPACITY = 20; // D-05
export const MIN_PLAYERS_TO_START = 3; // D-11
export const ROOM_CODE_LENGTH = 4; // D-01
// D-08's stated range is 12-15 user-perceived characters; taking the upper
// bound so no legitimate name is clipped.
export const MAX_NAME_GRAPHEMES = 15;
export const PING_INTERVAL_MS = 10_000; // RESEARCH A3 — tuned down for fast dead-socket detection
export const PING_TIMEOUT_MS = 8_000; // RESEARCH A3
export const SERVER_PORT = Number(process.env.PORT ?? 3001);

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
