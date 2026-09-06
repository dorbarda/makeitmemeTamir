import { describe, it, expect, vi, afterEach } from "vitest";
import type { Socket } from "socket.io-client";
import { CLIENT_EVENTS } from "@shared/protocol.js";
import { installResyncTriggers, requestResync } from "./resync";

type MockSocket = {
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  emit: ReturnType<typeof vi.fn>;
  trigger: (event: string, ...args: unknown[]) => void;
};

/** A minimal fake Socket.IO client socket — just enough of an EventEmitter
 * to drive `connect`, plus a spy `emit` to assert against. Cast to `Socket`
 * at each call site rather than typed as one directly; matching
 * socket.io-client's real overloaded `on`/`off` signatures exactly would add
 * nothing here but noise. */
function createMockSocket(): MockSocket {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  return {
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(cb);
    }),
    off: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      listeners.get(event)?.delete(cb);
    }),
    emit: vi.fn(),
    trigger(event: string, ...args: unknown[]) {
      for (const cb of listeners.get(event) ?? []) cb(...args);
    },
  };
}

function firePageShow(persisted: boolean): void {
  const event = new Event("pageshow") as PageTransitionEvent;
  Object.defineProperty(event, "persisted", { value: persisted, configurable: true });
  window.dispatchEvent(event);
}

function fireVisibilityChange(state: DocumentVisibilityState): void {
  vi.spyOn(document, "visibilityState", "get").mockReturnValue(state);
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("requestResync", () => {
  it("emits request-resync on the given socket", () => {
    const socket = createMockSocket();
    requestResync(socket as unknown as Socket);
    expect(socket.emit).toHaveBeenCalledWith(CLIENT_EVENTS.requestResync);
  });
});

describe("installResyncTriggers", () => {
  let teardown: (() => void) | undefined;

  afterEach(() => {
    teardown?.();
    teardown = undefined;
    vi.restoreAllMocks();
  });

  it("emits rejoin unconditionally on the socket's own connect event", () => {
    const socket = createMockSocket();
    teardown = installResyncTriggers(socket as unknown as Socket);

    socket.trigger("connect");

    expect(socket.emit).toHaveBeenCalledWith(CLIENT_EVENTS.rejoin);
  });

  it("requests a resync on a foreground return (visibilitychange -> visible)", () => {
    const socket = createMockSocket();
    teardown = installResyncTriggers(socket as unknown as Socket);

    fireVisibilityChange("visible");

    expect(socket.emit).toHaveBeenCalledWith(CLIENT_EVENTS.requestResync);
  });

  it("does not request a resync when visibility changes to hidden", () => {
    const socket = createMockSocket();
    teardown = installResyncTriggers(socket as unknown as Socket);

    fireVisibilityChange("hidden");

    expect(socket.emit).not.toHaveBeenCalled();
  });

  it("requests a resync on a bfcache pageshow with persisted true", () => {
    const socket = createMockSocket();
    teardown = installResyncTriggers(socket as unknown as Socket);

    firePageShow(true);

    expect(socket.emit).toHaveBeenCalledWith(CLIENT_EVENTS.requestResync);
  });

  it("does not request a resync on a pageshow with persisted false", () => {
    const socket = createMockSocket();
    teardown = installResyncTriggers(socket as unknown as Socket);

    firePageShow(false);

    expect(socket.emit).not.toHaveBeenCalled();
  });

  it("returns a teardown that removes every listener — calling it stops all three triggers", () => {
    const socket = createMockSocket();
    teardown = installResyncTriggers(socket as unknown as Socket);
    teardown();
    teardown = undefined;

    socket.trigger("connect");
    fireVisibilityChange("visible");
    firePageShow(true);

    expect(socket.emit).not.toHaveBeenCalled();
  });
});
