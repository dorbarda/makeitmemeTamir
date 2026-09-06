import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  type LobbySnapshot,
  type ProtocolError,
  type SessionIssued,
} from "@shared/protocol.js";
import { startTestServer, connectClient, waitFor, type TestServer } from "./setup.js";
import { ROOM_CAPACITY } from "../src/config.js";

describe("room capacity caps new joins at ROOM_CAPACITY (D-05)", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it("refuses the 21st joiner with ROOM_FULL and keeps the room at capacity", async () => {
    const host = await connectClient(server.url);
    const hostState = waitFor<LobbySnapshot>(host, SERVER_EVENTS.state);
    host.emit(CLIENT_EVENTS.createRoom, { name: "מארח" });
    const hostSnapshot = await hostState;
    const roomCode = hostSnapshot.roomCode;

    const joiners = [];
    for (let i = 1; i < ROOM_CAPACITY; i++) {
      const client = await connectClient(server.url);
      const state = waitFor<LobbySnapshot>(client, SERVER_EVENTS.state);
      client.emit(CLIENT_EVENTS.joinRoom, { roomCode, name: `שחקן${i}` });
      await state;
      joiners.push(client);
    }

    // Room now holds exactly ROOM_CAPACITY players (host + the loop above).
    const overflow = await connectClient(server.url);
    const errorOverflow = waitFor<ProtocolError>(overflow, SERVER_EVENTS.error);
    overflow.emit(CLIENT_EVENTS.joinRoom, { roomCode, name: "עודף" });
    const err = await errorOverflow;
    expect(err.code).toBe("ROOM_FULL");

    const resync = waitFor<LobbySnapshot>(host, SERVER_EVENTS.state);
    host.emit(CLIENT_EVENTS.requestResync);
    const snapshot = await resync;
    expect(snapshot.players).toHaveLength(ROOM_CAPACITY);

    host.close();
    overflow.close();
    for (const j of joiners) j.close();
  }, 20000);

  it("lets a returning player back into a full room", async () => {
    const host = await connectClient(server.url);
    const hostSession = waitFor<SessionIssued>(host, SERVER_EVENTS.session);
    const hostState = waitFor<LobbySnapshot>(host, SERVER_EVENTS.state);
    host.emit(CLIENT_EVENTS.createRoom, { name: "מארח2" });
    const [hostIssued, hostSnapshot] = await Promise.all([hostSession, hostState]);
    const roomCode = hostSnapshot.roomCode;

    const joiners = [];
    for (let i = 1; i < ROOM_CAPACITY; i++) {
      const client = await connectClient(server.url);
      const state = waitFor<LobbySnapshot>(client, SERVER_EVENTS.state);
      client.emit(CLIENT_EVENTS.joinRoom, { roomCode, name: `מלא${i}` });
      await state;
      joiners.push(client);
    }

    // Room is now at capacity. Host disconnects and reconnects with its token.
    host.close();
    await new Promise((r) => setTimeout(r, 50));

    const host2 = await connectClient(server.url, hostIssued.token);
    const state2 = waitFor<LobbySnapshot>(host2, SERVER_EVENTS.state);
    host2.emit(CLIENT_EVENTS.rejoin);
    const snapshot2 = await state2;
    expect(snapshot2.players).toHaveLength(ROOM_CAPACITY);
    expect(snapshot2.you.id).toBe(hostIssued.playerId);

    host2.close();
    for (const j of joiners) j.close();
  }, 20000);
});

describe("per-socket join/create rate limiting", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it("rate-limits after 10 create/join intents within the window", async () => {
    const client = await connectClient(server.url);
    for (let i = 0; i < 10; i++) {
      const state = waitFor<LobbySnapshot>(client, SERVER_EVENTS.state);
      client.emit(CLIENT_EVENTS.createRoom, { name: `ניסיון${i}` });
      await state;
    }

    const error = waitFor<ProtocolError>(client, SERVER_EVENTS.error);
    client.emit(CLIENT_EVENTS.createRoom, { name: "ניסיון נוסף" });
    const err = await error;
    expect(err.code).toBe("RATE_LIMITED");

    client.close();
  }, 15000);

  it("never rate-limits rejoin or request-resync", async () => {
    const client = await connectClient(server.url);
    const session = waitFor<SessionIssued>(client, SERVER_EVENTS.session);
    const state1 = waitFor<LobbySnapshot>(client, SERVER_EVENTS.state);
    client.emit(CLIENT_EVENTS.createRoom, { name: "רועי" });
    await Promise.all([session, state1]);

    for (let i = 0; i < 15; i++) {
      const state = waitFor<LobbySnapshot>(client, SERVER_EVENTS.state);
      client.emit(CLIENT_EVENTS.requestResync);
      await state;
    }

    for (let i = 0; i < 15; i++) {
      const state = waitFor<LobbySnapshot>(client, SERVER_EVENTS.state);
      client.emit(CLIENT_EVENTS.rejoin);
      await state;
    }

    client.close();
  }, 15000);
});
