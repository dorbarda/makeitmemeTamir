import { useSyncExternalStore } from "react";
import { io, type Socket } from "socket.io-client";
import { SERVER_EVENTS, type SessionIssued } from "@shared/protocol.js";
import { readToken, writeToken } from "../state/sessionStore";
import { installResyncTriggers } from "./resync";

let socket: Socket | undefined;

// Whether the socket is currently connected — drives the Hebrew reconnecting
// overlay in App.tsx. Starts `false` so a first-ever page load (before the
// initial `connect` fires) also shows the indicator rather than a blank or
// frozen screen, per this plan's explicit requirement.
let connected = false;
const connectedListeners = new Set<() => void>();

function setConnected(next: boolean): void {
  if (connected === next) return;
  connected = next;
  for (const listener of connectedListeners) listener();
}

function isConnected(): boolean {
  return connected;
}

function subscribeConnected(listener: () => void): () => void {
  // Ensures the socket exists (and its connect/disconnect listeners are
  // wired) regardless of whether some other code path has already called
  // getSocket() by the time a component first subscribes.
  getSocket();
  connectedListeners.add(listener);
  return () => connectedListeners.delete(listener);
}

/** React hook — true once the socket has completed its handshake, false
 * from the moment it drops until it reconnects and rejoins. */
export function useConnected(): boolean {
  return useSyncExternalStore(subscribeConnected, isConnected);
}

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

  socket.on("connect", () => setConnected(true));
  socket.on("disconnect", () => setConnected(false));

  socket.on(SERVER_EVENTS.session, (issued: SessionIssued) => {
    writeToken(issued.token);
  });

  // The three converging reconnect triggers (connect, foreground return,
  // bfcache restore) — installed exactly once, for the lifetime of this
  // single module-level socket. See resync.ts for why each one exists.
  installResyncTriggers(socket);

  return socket;
}
