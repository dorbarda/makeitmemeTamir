import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Room } from "../src/rooms/Room.js";
import { HOST_TRANSFER_GRACE_MS, ROSTER_FADE_GRACE_MS } from "../src/config.js";

describe("automatic host transfer on a dead host (D-16)", () => {
  let room: Room;

  beforeEach(() => {
    vi.useFakeTimers();
    room = new Room("5678", "http://x/join/5678", "data:image/png;base64,");
    // Host transfer is not LOBBY-gated — a dead host is a problem whether or
    // not the game has started. Most cases below run with phase IN_GAME
    // specifically to isolate host-transfer behavior from Task 1's
    // LOBBY-only roster fade, which would otherwise delete the host's own
    // player record at 30s and confound a "does the host come back cleanly"
    // assertion with an unrelated timer. The one test that deliberately
    // exercises the LOBBY fade-then-transfer ordering says so explicitly.
    room.phase = "WRITING";
  });

  afterEach(() => {
    room.dispose();
    vi.useRealTimers();
  });

  it("leaves hostId unchanged and the roster still showing the same host until the grace elapses", () => {
    const host = room.addPlayer("Host", "t-host");
    const other = room.addPlayer("Other", "t-other");

    room.detach(host.id);
    vi.advanceTimersByTime(HOST_TRANSFER_GRACE_MS - 1);

    expect(room.hostId).toBe(host.id);
    expect(room.snapshotFor(other.id).players.find((p) => p.id === host.id)?.isHost).toBe(true);
  });

  it("moves hostId to the earliest-joined connected player once the grace elapses, leaving exactly one host", () => {
    const host = room.addPlayer("Host", "t-host");
    const second = room.addPlayer("Second", "t-second");
    const third = room.addPlayer("Third", "t-third");

    room.detach(host.id);
    vi.advanceTimersByTime(HOST_TRANSFER_GRACE_MS);

    expect(room.hostId).toBe(second.id);
    const hosts = room.snapshotFor(third.id).players.filter((p) => p.isHost);
    expect(hosts).toHaveLength(1);
    expect(hosts[0].id).toBe(second.id);
  });

  it("does not throw and leaves hostId untouched when no other connected player exists", () => {
    const host = room.addPlayer("Host", "t-host");

    room.detach(host.id);
    expect(() => vi.advanceTimersByTime(HOST_TRANSFER_GRACE_MS)).not.toThrow();

    expect(room.hostId).toBe(host.id);
  });

  it("cancels the transfer when the original host reconnects before the grace elapses, and keeps host", () => {
    const host = room.addPlayer("Host", "t-host");
    const other = room.addPlayer("Other", "t-other");

    room.detach(host.id);
    vi.advanceTimersByTime(HOST_TRANSFER_GRACE_MS - 1000);
    room.attach(host.id);

    vi.advanceTimersByTime(HOST_TRANSFER_GRACE_MS);

    expect(room.hostId).toBe(host.id);
    const hosts = room.snapshotFor(other.id).players.filter((p) => p.isHost);
    expect(hosts).toHaveLength(1);
    expect(hosts[0].id).toBe(host.id);
  });

  it("the original host reconnecting after the transfer becomes an ordinary player, never a second host", () => {
    const host = room.addPlayer("Host", "t-host");
    const successor = room.addPlayer("Successor", "t-successor");

    room.detach(host.id);
    vi.advanceTimersByTime(HOST_TRANSFER_GRACE_MS);
    expect(room.hostId).toBe(successor.id);

    room.attach(host.id);

    const snapshot = room.snapshotFor(successor.id);
    const hosts = snapshot.players.filter((p) => p.isHost);
    expect(hosts).toHaveLength(1);
    expect(hosts[0].id).toBe(successor.id);
    expect(room.players.get(host.id)?.connected).toBe(true);
  });

  it("no code path sets hostId from a client-supplied value — transferHost only ever reads room.players", () => {
    const host = room.addPlayer("Host", "t-host");
    const other = room.addPlayer("Other", "t-other");
    room.detach(host.id);

    // transferHost() takes no arguments at all — there is no parameter a
    // caller (client-controlled or otherwise) could use to name a successor.
    expect(room.transferHost.length).toBe(0);

    vi.advanceTimersByTime(HOST_TRANSFER_GRACE_MS);
    expect(room.hostId).toBe(other.id);
  });

  describe("interaction with the LOBBY roster fade (Task 1)", () => {
    it("tolerates the fade removing the host from players before the transfer fires, and still promotes exactly one host", () => {
      const lobbyRoom = new Room("9999", "http://x/join/9999", "data:image/png;base64,");
      const host = lobbyRoom.addPlayer("Host", "t-host");
      const successor = lobbyRoom.addPlayer("Successor", "t-successor");

      lobbyRoom.detach(host.id); // schedules both the 30s fade and the 60s transfer

      vi.advanceTimersByTime(ROSTER_FADE_GRACE_MS);
      // The lobby fade grace is shorter than the host-transfer grace, so the
      // host is already gone from the roster well before the transfer fires.
      expect(lobbyRoom.players.has(host.id)).toBe(false);
      expect(lobbyRoom.hostId).toBe(host.id); // transfer hasn't fired yet

      vi.advanceTimersByTime(HOST_TRANSFER_GRACE_MS - ROSTER_FADE_GRACE_MS);

      expect(lobbyRoom.hostId).toBe(successor.id);
      const hosts = lobbyRoom.snapshotFor(successor.id).players.filter((p) => p.isHost);
      expect(hosts).toHaveLength(1);

      lobbyRoom.dispose();
    });
  });

  it("broadcasts via onStateChanged when the transfer actually happens", () => {
    const host = room.addPlayer("Host", "t-host");
    room.addPlayer("Other", "t-other");
    const onStateChanged = vi.fn();
    room.onStateChanged = onStateChanged;

    room.detach(host.id);
    expect(onStateChanged).not.toHaveBeenCalled();

    vi.advanceTimersByTime(HOST_TRANSFER_GRACE_MS);

    expect(onStateChanged).toHaveBeenCalled();
    expect(room.hostId).not.toBe(host.id);
  });
});
