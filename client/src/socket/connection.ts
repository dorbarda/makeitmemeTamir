import { io, type Socket } from "socket.io-client";
import { CLIENT_EVENTS, SERVER_EVENTS, type SessionIssued } from "@shared/protocol.js";
import { readToken, writeToken } from "../state/sessionStore";

let socket: Socket | undefined;

export function getSocket(): Socket {
  if (socket) return socket;

  socket = io({
    // Callback form — a token issued mid-session is picked up on the *next*
    // reconnect, since this runs again on every reconnection attempt.
    //
    // socket.io calls this with a callback and IGNORES the return value. It
    // must be invoked, or the CONNECT packet is never sent: the transport
    // opens, the socket never finishes connecting, and every emit() queues
    // silently forever.
    auth: (cb) => cb({ token: readToken() ?? undefined }),
    // Deliberately NOT pinned to websocket-only. Players arrive on whatever
    // mobile network they happen to be on, and where a raw websocket upgrade
    // is blocked, websocket-only leaves them with a dead screen and no error.
    // The default starts on polling and upgrades when it can.
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
