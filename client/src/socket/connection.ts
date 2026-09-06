import { io, type Socket } from "socket.io-client";
import { CLIENT_EVENTS, SERVER_EVENTS, type SessionIssued } from "@shared/protocol.js";
import { readToken, writeToken } from "../state/sessionStore";

let socket: Socket | undefined;

export function getSocket(): Socket {
  if (socket) return socket;

  socket = io({
    // Callback form — a token issued mid-session is picked up on the *next*
    // reconnect, since this runs again on every reconnection attempt.
    auth: () => ({ token: readToken() ?? undefined }),
    transports: ["websocket"],
  });

  socket.on("connect", () => {
    // Always rejoin, on the very first connect and on every automatic
    // reconnect alike — connection-state recovery can report `recovered:
    // false` across a genuine network-interface change (WiFi -> LTE), so it
    // is never trusted as the sole reconnect mechanism.
    socket!.emit(CLIENT_EVENTS.rejoin);
  });

  socket.on(SERVER_EVENTS.session, (issued: SessionIssued) => {
    writeToken(issued.token);
  });

  return socket;
}
