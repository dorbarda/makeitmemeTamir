import type { Socket } from "socket.io";
import type { SessionRegistry } from "../players/SessionRegistry.js";

/**
 * Shape stored on `socket.data`. Never populated from anything the client
 * claims other than the opaque token — every field here is either resolved
 * server-side via SessionRegistry or left undefined.
 */
export type SocketData = {
  playerId?: string;
  roomCode?: string;
  token?: string;
  isNewSession?: boolean;
  /** Sliding-window timestamps for the create-room/join-room rate guard. */
  roomIntentTimestamps?: number[];
};

/**
 * io.use() handshake resolver. This — and SessionRegistry.resolve() which it
 * calls — is the only place `socket.handshake.auth.token` is ever read.
 * An unrecognised token produces a brand-new session, never an error and
 * never a match against someone else's record. The token itself is never
 * written to a log line.
 */
export function createAuthMiddleware(sessions: SessionRegistry) {
  return (socket: Socket, next: (err?: Error) => void) => {
    const token = socket.handshake.auth?.token as string | undefined;
    const binding = token ? sessions.resolve(token) : undefined;

    const data = socket.data as SocketData;
    if (binding) {
      data.playerId = binding.playerId;
      data.roomCode = binding.roomCode;
      data.token = token;
    } else {
      data.isNewSession = true;
    }

    next();
  };
}
