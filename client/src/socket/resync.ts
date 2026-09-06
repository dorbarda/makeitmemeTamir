import type { Socket } from "socket.io-client";
import { CLIENT_EVENTS } from "@shared/protocol.js";

/**
 * Asks the server for a full state snapshot. The server is the sole
 * authority on what is true — the client only ever asks, never assumes.
 * Safe to call at any time; a socket with nothing bound to it yet is a
 * silent no-op on the server side.
 */
export function requestResync(socket: Socket): void {
  socket.emit(CLIENT_EVENTS.requestResync);
}

/**
 * Registers the three sources that converge on asking the server for the
 * truth after a phone comes back:
 *
 * 1. The socket's own `connect` event (first connect and every automatic
 *    reconnect alike) — emits `rejoin` unconditionally, whatever
 *    `socket.recovered` reports. Connection-state recovery can come back
 *    `false` across a genuine network-interface change (WiFi -> LTE), so it
 *    is never trusted as the sole reconnect mechanism (RESEARCH.md
 *    Pitfall 5).
 * 2. `document`'s `visibilitychange` firing with `visibilityState ===
 *    "visible"` — a foreground return, which requests a fresh resync even
 *    when the socket still reports itself connected, because iOS can leave
 *    a dead socket reporting `connected: true`.
 * 3. `window`'s `pageshow` firing with `event.persisted === true` — a
 *    bfcache restore, which the `connect`/`visibilitychange` pair alone does
 *    not always cover.
 *
 * Deliberately does NOT register a `pagehide`/`freeze` handler to proactively
 * close the socket. That is a general bfcache best practice, but on iOS
 * Safari it is not reliably fired when the browser app itself is closed or
 * the OS reclaims memory, so building the reconnect path on it would make
 * the phase's core requirement depend on an event that may never arrive. The
 * dependable signal is the foreground return, not the backgrounding.
 *
 * Returns a teardown function that removes every listener this call added.
 * Callers must tear down an existing installation before installing again —
 * `connection.ts` calls this exactly once, at module setup, for the whole
 * lifetime of the app's single socket.
 */
export function installResyncTriggers(socket: Socket): () => void {
  const onConnect = () => {
    socket.emit(CLIENT_EVENTS.rejoin);
  };
  socket.on("connect", onConnect);

  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      requestResync(socket);
    }
  };
  document.addEventListener("visibilitychange", onVisibilityChange);

  const onPageShow = (event: PageTransitionEvent) => {
    if (event.persisted) {
      requestResync(socket);
    }
  };
  window.addEventListener("pageshow", onPageShow);

  return () => {
    socket.off("connect", onConnect);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("pageshow", onPageShow);
  };
}
