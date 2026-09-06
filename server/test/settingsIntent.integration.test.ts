import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  type LobbySnapshot,
  type ProtocolError,
} from "@shared/protocol.js";
import { startTestServer, connectClient, waitFor, type TestServer } from "./setup.js";

// Real transport, real timers throughout — nothing here waits for a deadline
// to fire, it only inspects the deadline the server computed.
describe("settings intent — host-only, preset-validated, locked at start (LOBBY-06, LOBBY-07)", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  async function makeRoomWithThreePlayers() {
    const host = await connectClient(server.url);
    const stateHost1 = waitFor<LobbySnapshot>(host, SERVER_EVENTS.state);
    host.emit(CLIENT_EVENTS.createRoom, { name: "מנחה" });
    const hostSnapshot = await stateHost1;
    const roomCode = hostSnapshot.roomCode;

    const b = await connectClient(server.url);
    const stateB1 = waitFor<LobbySnapshot>(b, SERVER_EVENTS.state);
    const stateHost2 = waitFor<LobbySnapshot>(host, SERVER_EVENTS.state);
    b.emit(CLIENT_EVENTS.joinRoom, { roomCode, name: "בי" });
    await Promise.all([stateB1, stateHost2]);

    const c = await connectClient(server.url);
    const stateC1 = waitFor<LobbySnapshot>(c, SERVER_EVENTS.state);
    const stateHost3 = waitFor<LobbySnapshot>(host, SERVER_EVENTS.state);
    const stateB2 = waitFor<LobbySnapshot>(b, SERVER_EVENTS.state);
    c.emit(CLIENT_EVENTS.joinRoom, { roomCode, name: "גי" });
    await Promise.all([stateC1, stateHost3, stateB2]);

    return { host, b, c, roomCode };
  }

  it("a non-host change-settings produces NOT_HOST and never changes the value", async () => {
    const { host, b, c, roomCode } = await makeRoomWithThreePlayers();
    void roomCode;

    const errorOnB = waitFor<ProtocolError>(b, SERVER_EVENTS.error);
    b.emit(CLIENT_EVENTS.changeSettings, { key: "rounds", value: 5 });
    const error = await errorOnB;
    expect(error.code).toBe("NOT_HOST");

    // Confirm the value truly never changed — request a fresh resync rather
    // than trusting the absence of a state broadcast.
    const resync = waitFor<LobbySnapshot>(host, SERVER_EVENTS.state);
    host.emit(CLIENT_EVENTS.requestResync);
    const snapshot = await resync;
    expect(snapshot.settings.rounds).toBe(3);

    host.close();
    b.close();
    c.close();
  });

  it("a change-settings after the game has started produces SETTINGS_LOCKED", async () => {
    const { host, b, c } = await makeRoomWithThreePlayers();

    const stateHostOnStart = waitFor<LobbySnapshot>(host, SERVER_EVENTS.state);
    const stateBOnStart = waitFor<LobbySnapshot>(b, SERVER_EVENTS.state);
    const stateCOnStart = waitFor<LobbySnapshot>(c, SERVER_EVENTS.state);
    host.emit(CLIENT_EVENTS.startGame, {});
    await Promise.all([stateHostOnStart, stateBOnStart, stateCOnStart]);

    const errorOnHost = waitFor<ProtocolError>(host, SERVER_EVENTS.error);
    host.emit(CLIENT_EVENTS.changeSettings, { key: "rounds", value: 7 });
    const error = await errorOnHost;
    expect(error.code).toBe("SETTINGS_LOCKED");

    host.close();
    b.close();
    c.close();
  });

  it("start-game from a non-host produces NOT_HOST and the room stays in LOBBY", async () => {
    const { host, b, c } = await makeRoomWithThreePlayers();

    const errorOnB = waitFor<ProtocolError>(b, SERVER_EVENTS.error);
    b.emit(CLIENT_EVENTS.startGame, {});
    const error = await errorOnB;
    expect(error.code).toBe("NOT_HOST");

    const resync = waitFor<LobbySnapshot>(host, SERVER_EVENTS.state);
    host.emit(CLIENT_EVENTS.requestResync);
    const snapshot = await resync;
    expect(snapshot.phase).toBe("LOBBY");

    host.close();
    b.close();
    c.close();
  });

  it("start-game with only two players produces NOT_ENOUGH_PLAYERS; with three it moves every client to WRITING", async () => {
    const host = await connectClient(server.url);
    const stateHost1 = waitFor<LobbySnapshot>(host, SERVER_EVENTS.state);
    host.emit(CLIENT_EVENTS.createRoom, { name: "מנחה2" });
    const hostSnapshot = await stateHost1;
    const roomCode = hostSnapshot.roomCode;

    const b = await connectClient(server.url);
    const stateB1 = waitFor<LobbySnapshot>(b, SERVER_EVENTS.state);
    const stateHost2 = waitFor<LobbySnapshot>(host, SERVER_EVENTS.state);
    b.emit(CLIENT_EVENTS.joinRoom, { roomCode, name: "בי2" });
    await Promise.all([stateB1, stateHost2]);

    const errorOnHost = waitFor<ProtocolError>(host, SERVER_EVENTS.error);
    host.emit(CLIENT_EVENTS.startGame, {});
    const error = await errorOnHost;
    expect(error.code).toBe("NOT_ENOUGH_PLAYERS");

    const c = await connectClient(server.url);
    const stateC1 = waitFor<LobbySnapshot>(c, SERVER_EVENTS.state);
    const stateHost3 = waitFor<LobbySnapshot>(host, SERVER_EVENTS.state);
    const stateB2 = waitFor<LobbySnapshot>(b, SERVER_EVENTS.state);
    c.emit(CLIENT_EVENTS.joinRoom, { roomCode, name: "גי2" });
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
    }

    host.close();
    b.close();
    c.close();
  });

  it("a host-changed writingSeconds of 90 drives the writing deadline, not the 60s default", async () => {
    const { host, b, c } = await makeRoomWithThreePlayers();

    const stateOnChange = waitFor<LobbySnapshot>(host, SERVER_EVENTS.state);
    host.emit(CLIENT_EVENTS.changeSettings, { key: "writingSeconds", value: 90 });
    const afterChange = await stateOnChange;
    expect(afterChange.settings.writingSeconds).toBe(90);

    const stateOnStart = waitFor<LobbySnapshot>(host, SERVER_EVENTS.state);
    host.emit(CLIENT_EVENTS.startGame, {});
    const afterStart = await stateOnStart;

    expect(afterStart.phase).toBe("WRITING");
    const remaining = (afterStart.deadlineAt as number) - afterStart.serverNow;
    // Small tolerance for real wall-clock scheduling jitter, but clearly on
    // the 90s side of the gap to the 60s default (30s apart).
    expect(remaining).toBeGreaterThan(85_000);
    expect(remaining).toBeLessThanOrEqual(90_000);

    host.close();
    b.close();
    c.close();
  });
});
