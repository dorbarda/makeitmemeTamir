import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { CLIENT_EVENTS, SERVER_EVENTS, type LobbySnapshot } from "@shared/protocol.js";
import { startTestServer, connectClient, waitFor, type TestServer } from "./setup.js";
import { Room } from "../src/rooms/Room.js";
import { BETWEEN_PHASES_MS } from "../src/config.js";

describe("the server runs the game clock by itself, over real sockets", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it("start-game reaches every connected client with WRITING, round 1 of 3, settings locked, and a deadline ahead of serverNow", async () => {
    const host = await connectClient(server.url);
    const stateHost1 = waitFor<LobbySnapshot>(host, SERVER_EVENTS.state);
    host.emit(CLIENT_EVENTS.createRoom, { name: "מארח" });
    const hostSnapshot = await stateHost1;
    const roomCode = hostSnapshot.roomCode;

    const b = await connectClient(server.url);
    const stateB1 = waitFor<LobbySnapshot>(b, SERVER_EVENTS.state);
    const stateHost2 = waitFor<LobbySnapshot>(host, SERVER_EVENTS.state);
    b.emit(CLIENT_EVENTS.joinRoom, { roomCode, name: "ב" });
    await Promise.all([stateB1, stateHost2]);

    const c = await connectClient(server.url);
    const stateC1 = waitFor<LobbySnapshot>(c, SERVER_EVENTS.state);
    const stateHost3 = waitFor<LobbySnapshot>(host, SERVER_EVENTS.state);
    const stateB2 = waitFor<LobbySnapshot>(b, SERVER_EVENTS.state);
    c.emit(CLIENT_EVENTS.joinRoom, { roomCode, name: "ג" });
    await Promise.all([stateC1, stateHost3, stateB2]);

    const stateHostOnStart = waitFor<LobbySnapshot>(host, SERVER_EVENTS.state);
    const stateBOnStart = waitFor<LobbySnapshot>(b, SERVER_EVENTS.state);
    const stateCOnStart = waitFor<LobbySnapshot>(c, SERVER_EVENTS.state);
    host.emit(CLIENT_EVENTS.startGame, {});
    const [hostAfterStart, bAfterStart, cAfterStart] = await Promise.all([
      stateHostOnStart,
      stateBOnStart,
      stateCOnStart,
    ]);

    for (const snapshot of [hostAfterStart, bAfterStart, cAfterStart]) {
      expect(snapshot.phase).toBe("WRITING");
      expect(snapshot.round).toEqual({ index: 1, total: 3 });
      expect(snapshot.settingsLocked).toBe(true);
      expect(snapshot.deadlineAt).not.toBeNull();
      expect(snapshot.deadlineAt as number).toBeGreaterThan(snapshot.serverNow);
    }

    host.close();
    b.close();
    c.close();
  });

  it("a passive non-host client reaches ROUND_END with no input of its own", async () => {
    const host = await connectClient(server.url);
    const stateHost1 = waitFor<LobbySnapshot>(host, SERVER_EVENTS.state);
    host.emit(CLIENT_EVENTS.createRoom, { name: "מארח2" });
    const hostSnapshot = await stateHost1;
    const roomCode = hostSnapshot.roomCode;

    const b = await connectClient(server.url);
    const stateB1 = waitFor<LobbySnapshot>(b, SERVER_EVENTS.state);
    const stateHost2 = waitFor<LobbySnapshot>(host, SERVER_EVENTS.state);
    b.emit(CLIENT_EVENTS.joinRoom, { roomCode, name: "ב2" });
    await Promise.all([stateB1, stateHost2]);

    // The third client is the one under test: it never emits anything after
    // this join, and must still reach ROUND_END on the server's own timer.
    const passive = await connectClient(server.url);
    const statePassive1 = waitFor<LobbySnapshot>(passive, SERVER_EVENTS.state);
    const stateHost3 = waitFor<LobbySnapshot>(host, SERVER_EVENTS.state);
    const stateB2 = waitFor<LobbySnapshot>(b, SERVER_EVENTS.state);
    passive.emit(CLIENT_EVENTS.joinRoom, { roomCode, name: "פסיבי" });
    await Promise.all([statePassive1, stateHost3, stateB2]);

    // Test-only internal seeding so the real-timer test doesn't take a full
    // writingSeconds to run — the protocol path that rejects non-preset
    // values is proven in plan 02-02, not here.
    const room = server.roomManager.findRoom(roomCode);
    expect(room).toBeDefined();
    room!.settings.writingSeconds = 1;

    const statePassiveOnStart = waitFor<LobbySnapshot>(passive, SERVER_EVENTS.state);
    host.emit(CLIENT_EVENTS.startGame, {});
    const passiveAfterStart = await statePassiveOnStart;
    expect(passiveAfterStart.phase).toBe("WRITING");

    const statePassiveOnRoundEnd = waitFor<LobbySnapshot>(passive, SERVER_EVENTS.state, 5000);
    const passiveAfterRoundEnd = await statePassiveOnRoundEnd;
    expect(passiveAfterRoundEnd.phase).toBe("ROUND_END");

    host.close();
    b.close();
    passive.close();
  }, 10000);
});

describe("the whole round chain runs on fake timers alone (bare Room)", () => {
  let room: Room;

  beforeEach(() => {
    vi.useFakeTimers();
    room = new Room("2222", "http://x/join/2222", "data:image/png;base64,");
  });

  afterEach(() => {
    room.dispose();
    vi.useRealTimers();
  });

  it("chains WRITING -> ROUND_END -> WRITING -> ROUND_END -> WRITING -> ROUND_END -> GAME_END with no method calls in between", () => {
    const host = room.addPlayer("Host", "t-host");
    room.addPlayer("B", "t-b");
    room.addPlayer("C", "t-c");

    const onStateChanged = vi.fn();
    room.onStateChanged = onStateChanged;

    const result = room.startGame(host.id);
    expect(result).toEqual({ ok: true });
    expect(room.phase).toBe("WRITING");

    const writingMs = room.settings.writingSeconds * 1000;

    // Round 1: WRITING -> ROUND_END
    vi.advanceTimersByTime(writingMs);
    expect(room.phase).toBe("ROUND_END");
    expect(onStateChanged).toHaveBeenCalledTimes(1);

    // ROUND_END -> WRITING (round 2)
    vi.advanceTimersByTime(BETWEEN_PHASES_MS);
    expect(room.phase).toBe("WRITING");
    expect(room.roundIndex).toBe(2);
    expect(onStateChanged).toHaveBeenCalledTimes(2);

    // Round 2: WRITING -> ROUND_END
    vi.advanceTimersByTime(writingMs);
    expect(room.phase).toBe("ROUND_END");
    expect(onStateChanged).toHaveBeenCalledTimes(3);

    // ROUND_END -> WRITING (round 3, the last round for the default 3-round preset)
    vi.advanceTimersByTime(BETWEEN_PHASES_MS);
    expect(room.phase).toBe("WRITING");
    expect(room.roundIndex).toBe(3);
    expect(onStateChanged).toHaveBeenCalledTimes(4);

    // Round 3: WRITING -> ROUND_END
    vi.advanceTimersByTime(writingMs);
    expect(room.phase).toBe("ROUND_END");
    expect(onStateChanged).toHaveBeenCalledTimes(5);

    // ROUND_END -> GAME_END (no more rounds)
    vi.advanceTimersByTime(BETWEEN_PHASES_MS);
    expect(room.phase).toBe("GAME_END");
    expect(room.deadlineAt).toBeNull();
    expect(onStateChanged).toHaveBeenCalledTimes(6);
  });
});
