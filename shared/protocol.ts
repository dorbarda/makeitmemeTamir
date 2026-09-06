export type RoomPhase = "LOBBY" | "IN_GAME";

export type PlayerView = {
  id: string;
  name: string;
  connected: boolean;
  isHost: boolean;
  score: number;
};

export type LobbySnapshot = {
  phase: RoomPhase;
  roomCode: string;
  joinUrl: string; // filled by plan 01-03; "" until then
  qrDataUrl: string; // filled by plan 01-03; "" until then
  players: PlayerView[];
  readyCount: number; // connected players
  capacity: number;
  canStart: boolean;
  you: { id: string; isHost: boolean };
};

export type SessionIssued = { token: string; playerId: string };

export type ErrorCode =
  | "ROOM_NOT_FOUND"
  | "ROOM_FULL"
  | "NAME_REQUIRED"
  | "NAME_LOCKED"
  | "NOT_IN_ROOM"
  | "RATE_LIMITED";

export type ProtocolError = { code: ErrorCode; messageHe: string };

export const CLIENT_EVENTS = {
  createRoom: "create-room", // { name: string }
  joinRoom: "join-room", // { roomCode: string, name: string }
  rejoin: "rejoin", // {}  — token comes from the handshake, never the payload
  rename: "rename", // { name: string }   (added in plan 01-02)
  requestResync: "request-resync", // {}
} as const;

export const SERVER_EVENTS = {
  session: "session", // SessionIssued — sent once, to that socket only
  state: "state", // LobbySnapshot — full snapshot, never a diff
  error: "error", // ProtocolError
} as const;
