import { useSyncExternalStore } from "react";
import { SERVER_EVENTS, type LobbySnapshot } from "@shared/protocol.js";
import { getSocket } from "../socket/connection";

let snapshot: LobbySnapshot | undefined;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

let wired = false;
function ensureWired(): void {
  if (wired) return;
  wired = true;
  getSocket().on(SERVER_EVENTS.state, (next: LobbySnapshot) => {
    // Full snapshot replacement only — never merged with the previous one.
    snapshot = next;
    notify();
  });
}

function subscribe(listener: () => void): () => void {
  ensureWired();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): LobbySnapshot | undefined {
  return snapshot;
}

export function useSnapshot(): LobbySnapshot | undefined {
  return useSyncExternalStore(subscribe, getSnapshot);
}

/** Test-only escape hatch — never call from application code. */
export function applySnapshot(next: LobbySnapshot): void {
  snapshot = next;
  notify();
}
