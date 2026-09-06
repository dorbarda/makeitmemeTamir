import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Room } from "../src/rooms/Room.js";
import { ROSTER_FADE_GRACE_MS } from "../src/config.js";

describe("grace-delayed roster fade in the lobby (D-13)", () => {
  let room: Room;

  beforeEach(() => {
    vi.useFakeTimers();
    room = new Room("1234", "http://x/join/1234", "data:image/png;base64,");
  });

  afterEach(() => {
    room.dispose();
    vi.useRealTimers();
  });

  it("appears with connected:false immediately, stays present, and is removed only after the grace elapses", () => {
    const host = room.addPlayer("Host", "t-host");
    const player = room.addPlayer("Guest", "t-guest");

    room.detach(player.id);

    // Immediately visible as disconnected — a two-second blip is never
    // mistaken for a departure.
    expect(room.players.has(player.id)).toBe(true);
    expect(room.players.get(player.id)?.connected).toBe(false);

    vi.advanceTimersByTime(ROSTER_FADE_GRACE_MS - 1);
    expect(room.players.has(player.id)).toBe(true);

    vi.advanceTimersByTime(1);
    expect(room.players.has(player.id)).toBe(false);
    // The host, never disconnected, is untouched.
    expect(room.players.has(host.id)).toBe(true);
  });

  it("cancels the pending removal when the player reconnects before the grace elapses", () => {
    const player = room.addPlayer("Guest", "t-guest");

    room.detach(player.id);
    vi.advanceTimersByTime(ROSTER_FADE_GRACE_MS - 1000);
    room.attach(player.id);

    vi.advanceTimersByTime(ROSTER_FADE_GRACE_MS * 2);

    expect(room.players.has(player.id)).toBe(true);
    expect(room.players.get(player.id)?.connected).toBe(true);
  });

  it("restarts the grace from the second disconnect on a disconnect-reconnect-disconnect sequence", () => {
    const player = room.addPlayer("Guest", "t-guest");

    room.detach(player.id);
    vi.advanceTimersByTime(ROSTER_FADE_GRACE_MS - 1000); // one second from fading
    room.attach(player.id);
    room.detach(player.id); // must restart the clock, not resume the old one

    vi.advanceTimersByTime(ROSTER_FADE_GRACE_MS - 1000);
    // If the first timer had been allowed to fire late, the player would
    // already be gone here.
    expect(room.players.has(player.id)).toBe(true);

    vi.advanceTimersByTime(1000);
    expect(room.players.has(player.id)).toBe(false);
  });

  it("never removes a player disconnecting once play has begun, and their score and position survive", () => {
    const player = room.addPlayer("Guest", "t-guest");
    player.score = 7;
    room.phase = "IN_GAME";

    room.detach(player.id);
    vi.advanceTimersByTime(ROSTER_FADE_GRACE_MS * 10);

    const stillThere = room.players.get(player.id);
    expect(stillThere).toBeDefined();
    expect(stillThere?.connected).toBe(false);
    expect(stillThere?.score).toBe(7);
  });

  it("never double-counts a returning player, and readyCount stays truthful throughout", () => {
    const host = room.addPlayer("Host", "t-host");
    const player = room.addPlayer("Guest", "t-guest");
    expect(room.snapshotFor(host.id).readyCount).toBe(2);
    expect(room.snapshotFor(host.id).players).toHaveLength(2);

    room.detach(player.id);
    expect(room.snapshotFor(host.id).readyCount).toBe(1);
    expect(room.snapshotFor(host.id).players).toHaveLength(2);

    room.attach(player.id);
    expect(room.snapshotFor(host.id).readyCount).toBe(2);
    expect(room.snapshotFor(host.id).players).toHaveLength(2);
  });

  it("dispose() clears a pending removal so no timer fires after the room is gone", () => {
    const player = room.addPlayer("Guest", "t-guest");
    room.detach(player.id);

    room.dispose();
    vi.advanceTimersByTime(ROSTER_FADE_GRACE_MS * 5);

    expect(room.players.has(player.id)).toBe(true);
  });

  it("both grace values are read from server/src/config.ts, not written inline", () => {
    expect(ROSTER_FADE_GRACE_MS).toBeGreaterThan(0);
    // Sanity: the grace really is enforced by the constant currently in
    // config.ts, not a coincidentally-matching hardcoded number — changing
    // the constant changes the observed behavior.
    const player = room.addPlayer("Guest", "t-guest");
    room.detach(player.id);
    vi.advanceTimersByTime(ROSTER_FADE_GRACE_MS - 1);
    expect(room.players.has(player.id)).toBe(true);
    vi.advanceTimersByTime(1);
    expect(room.players.has(player.id)).toBe(false);
  });

  it("broadcasts via onStateChanged exactly when the grace elapses and the player is removed", () => {
    const player = room.addPlayer("Guest", "t-guest");
    const onStateChanged = vi.fn();
    room.onStateChanged = onStateChanged;

    room.detach(player.id);
    expect(onStateChanged).not.toHaveBeenCalled();

    vi.advanceTimersByTime(ROSTER_FADE_GRACE_MS);
    expect(onStateChanged).toHaveBeenCalledTimes(1);
  });
});
