import { describe, it, expect } from "vitest";
import { RoomManager } from "../src/rooms/RoomManager.js";
import { ROOM_ABANDONED_TTL_MS, ROOM_GAME_END_TTL_MS } from "../src/config.js";

/**
 * debug/render-oom-memory-leak: RoomManager never removed a room once
 * created — every game ever played, finished or abandoned, stayed resident
 * in memory for the life of the process. These tests cover the fix:
 * `RoomManager.removeRoom` and `RoomManager.reapIdleRooms`.
 */
describe("RoomManager.removeRoom", () => {
  it("disposes and forgets a room", async () => {
    const manager = new RoomManager();
    const room = await manager.createRoom("http://localhost");
    expect(manager.findRoom(room.code)).toBe(room);

    manager.removeRoom(room.code);

    expect(manager.findRoom(room.code)).toBeUndefined();
  });

  it("is a no-op for a code that was never created", () => {
    const manager = new RoomManager();
    expect(() => manager.removeRoom("9999")).not.toThrow();
  });
});

describe("RoomManager.reapIdleRooms", () => {
  it("never reaps a room with recent activity", async () => {
    const manager = new RoomManager();
    const room = await manager.createRoom("http://localhost");

    expect(manager.reapIdleRooms(Date.now())).toEqual([]);
    expect(manager.findRoom(room.code)).toBe(room);
  });

  it("reaps a GAME_END room once idle past ROOM_GAME_END_TTL_MS, even with a player still marked connected", async () => {
    const manager = new RoomManager();
    const room = await manager.createRoom("http://localhost");
    const player = room.addPlayer("Guest", "t-guest");
    room.phase = "GAME_END";

    const almostThere = room.lastActivityAt + ROOM_GAME_END_TTL_MS - 1;
    expect(manager.reapIdleRooms(almostThere)).toEqual([]);
    expect(manager.findRoom(room.code)).toBe(room);

    const now = room.lastActivityAt + ROOM_GAME_END_TTL_MS;
    expect(manager.reapIdleRooms(now)).toEqual([room.code]);
    expect(manager.findRoom(room.code)).toBeUndefined();
    // Reaped as a safety net against a forgotten-open tab — the player's own
    // in-memory `connected` flag was never touched by this.
    expect(player.connected).toBe(true);
  });

  it("never reaps a non-GAME_END room while any player is connected, regardless of idle time", async () => {
    const manager = new RoomManager();
    const room = await manager.createRoom("http://localhost");
    room.addPlayer("Guest", "t-guest");

    const farFuture = room.lastActivityAt + ROOM_ABANDONED_TTL_MS * 10;
    expect(manager.reapIdleRooms(farFuture)).toEqual([]);
    expect(manager.findRoom(room.code)).toBe(room);
  });

  it("reaps an abandoned (never GAME_END) room once every player is disconnected and idle past ROOM_ABANDONED_TTL_MS", async () => {
    const manager = new RoomManager();
    const room = await manager.createRoom("http://localhost");
    const player = room.addPlayer("Guest", "t-guest");
    player.connected = false;

    const almostThere = room.lastActivityAt + ROOM_ABANDONED_TTL_MS - 1;
    expect(manager.reapIdleRooms(almostThere)).toEqual([]);
    expect(manager.findRoom(room.code)).toBe(room);

    const now = room.lastActivityAt + ROOM_ABANDONED_TTL_MS;
    expect(manager.reapIdleRooms(now)).toEqual([room.code]);
    expect(manager.findRoom(room.code)).toBeUndefined();
  });

  it("sweeps multiple rooms independently, reaping only the ones past their own TTL", async () => {
    const manager = new RoomManager();
    const stale = await manager.createRoom("http://localhost");
    stale.addPlayer("Guest", "t-guest").connected = false;
    const fresh = await manager.createRoom("http://localhost");
    fresh.addPlayer("Host", "t-host");

    const now = stale.lastActivityAt + ROOM_ABANDONED_TTL_MS;
    const reaped = manager.reapIdleRooms(now);

    expect(reaped).toEqual([stale.code]);
    expect(manager.findRoom(stale.code)).toBeUndefined();
    expect(manager.findRoom(fresh.code)).toBe(fresh);
  });
});
