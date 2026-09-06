import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Room } from "../src/rooms/Room.js";
import { BETWEEN_PHASES_MS } from "../src/config.js";

describe("round clock invariants (LIVE-03) — every live phase has a deadline, and a disposed room has none", () => {
  let room: Room;

  beforeEach(() => {
    vi.useFakeTimers();
    room = new Room("3333", "http://x/join/3333", "data:image/png;base64,");
  });

  afterEach(() => {
    room.dispose();
    vi.useRealTimers();
  });

  function addThreePlayers(): { host: ReturnType<Room["addPlayer"]>; b: ReturnType<Room["addPlayer"]> } {
    const host = room.addPlayer("Host", "t-host");
    const b = room.addPlayer("B", "t-b");
    room.addPlayer("C", "t-c");
    return { host, b };
  }

  it("in LOBBY, the snapshot's deadlineAt is null", () => {
    const { host } = addThreePlayers();
    expect(room.snapshotFor(host.id).deadlineAt).toBeNull();
  });

  it("in WRITING and ROUND_END, deadlineAt is non-null and strictly greater than the same snapshot's serverNow", () => {
    const { host } = addThreePlayers();
    room.startGame(host.id);

    const writingSnapshot = room.snapshotFor(host.id);
    expect(writingSnapshot.phase).toBe("WRITING");
    expect(writingSnapshot.deadlineAt).not.toBeNull();
    expect(writingSnapshot.deadlineAt as number).toBeGreaterThan(writingSnapshot.serverNow);

    vi.advanceTimersByTime(room.settings.writingSeconds * 1000);

    const roundEndSnapshot = room.snapshotFor(host.id);
    expect(roundEndSnapshot.phase).toBe("ROUND_END");
    expect(roundEndSnapshot.deadlineAt).not.toBeNull();
    expect(roundEndSnapshot.deadlineAt as number).toBeGreaterThan(roundEndSnapshot.serverNow);
  });

  it("in GAME_END, the snapshot's deadlineAt is null", () => {
    const { host } = addThreePlayers();
    room.startGame(host.id);
    const writingMs = room.settings.writingSeconds * 1000;

    for (let round = 0; round < room.settings.rounds; round++) {
      vi.advanceTimersByTime(writingMs);
      vi.advanceTimersByTime(BETWEEN_PHASES_MS);
    }

    expect(room.phase).toBe("GAME_END");
    expect(room.snapshotFor(host.id).deadlineAt).toBeNull();
  });

  it("walks the whole chain and asserts deadlineAt is non-null for WRITING/ROUND_END and null at GAME_END, at every step", () => {
    const { host } = addThreePlayers();
    room.startGame(host.id);
    const writingMs = room.settings.writingSeconds * 1000;

    for (let round = 1; round <= room.settings.rounds; round++) {
      expect(room.phase).toBe("WRITING");
      expect(room.snapshotFor(host.id).deadlineAt).not.toBeNull();
      vi.advanceTimersByTime(writingMs);

      expect(room.phase).toBe("ROUND_END");
      expect(room.snapshotFor(host.id).deadlineAt).not.toBeNull();
      vi.advanceTimersByTime(BETWEEN_PHASES_MS);
    }

    expect(room.phase).toBe("GAME_END");
    expect(room.snapshotFor(host.id).deadlineAt).toBeNull();
  });

  it("holds the writing-deadline boundary exactly: still WRITING one ms before the deadline, not WRITING one ms after", () => {
    const { host } = addThreePlayers();
    room.startGame(host.id);
    const writingMs = room.settings.writingSeconds * 1000;

    vi.advanceTimersByTime(writingMs - 1);
    expect(room.phase).toBe("WRITING");

    vi.advanceTimersByTime(1);
    expect(room.phase).not.toBe("WRITING");
  });

  it("holds the round-end pacing-beat boundary exactly", () => {
    const { host } = addThreePlayers();
    room.startGame(host.id);
    vi.advanceTimersByTime(room.settings.writingSeconds * 1000);
    expect(room.phase).toBe("ROUND_END");

    vi.advanceTimersByTime(BETWEEN_PHASES_MS - 1);
    expect(room.phase).toBe("ROUND_END");

    vi.advanceTimersByTime(1);
    expect(room.phase).not.toBe("ROUND_END");
  });

  it("dispose() during WRITING prevents the writing deadline from ever changing the phase, however far timers are advanced afterwards", () => {
    const { host } = addThreePlayers();
    const onStateChanged = vi.fn();
    room.onStateChanged = onStateChanged;

    room.startGame(host.id);
    expect(room.phase).toBe("WRITING");

    room.dispose();
    vi.advanceTimersByTime(room.settings.writingSeconds * 1000 * 10);

    expect(room.phase).toBe("WRITING");
    // startGame's own transition never calls onStateChanged (handlers.ts
    // broadcasts on success instead) — only the timer firing would have,
    // and dispose() is exactly what prevented that.
    expect(onStateChanged).not.toHaveBeenCalled();
  });

  it("a second startGame call on a room already past LOBBY returns WRONG_PHASE and schedules no second timer", () => {
    const { host } = addThreePlayers();
    const first = room.startGame(host.id);
    expect(first).toEqual({ ok: true });

    const second = room.startGame(host.id);
    expect(second).toEqual({ ok: false, error: "WRONG_PHASE" });

    // If the second call had scheduled a competing timer, advancing exactly
    // one writing duration would not land cleanly on a single ROUND_END.
    const onStateChanged = vi.fn();
    room.onStateChanged = onStateChanged;
    vi.advanceTimersByTime(room.settings.writingSeconds * 1000);
    expect(room.phase).toBe("ROUND_END");
    expect(onStateChanged).toHaveBeenCalledTimes(1);
  });

  it("startGame from a non-host player returns NOT_HOST and leaves the phase LOBBY", () => {
    const { b } = addThreePlayers();
    const result = room.startGame(b.id);
    expect(result).toEqual({ ok: false, error: "NOT_HOST" });
    expect(room.phase).toBe("LOBBY");
  });

  it("startGame with two players returns NOT_ENOUGH_PLAYERS; with three it succeeds", () => {
    const host = room.addPlayer("Host", "t-host");
    room.addPlayer("B", "t-b");

    const withTwo = room.startGame(host.id);
    expect(withTwo).toEqual({ ok: false, error: "NOT_ENOUGH_PLAYERS" });
    expect(room.phase).toBe("LOBBY");

    room.addPlayer("C", "t-c");
    const withThree = room.startGame(host.id);
    expect(withThree).toEqual({ ok: true });
    expect(room.phase).toBe("WRITING");
  });
});
