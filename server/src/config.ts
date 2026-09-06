export const ROOM_CAPACITY = 20; // D-05
export const MIN_PLAYERS_TO_START = 3; // D-11
export const ROOM_CODE_LENGTH = 4; // D-01
export const PING_INTERVAL_MS = 10_000; // RESEARCH A3 — tuned down for fast dead-socket detection
export const PING_TIMEOUT_MS = 8_000; // RESEARCH A3
export const SERVER_PORT = Number(process.env.PORT ?? 3001);
