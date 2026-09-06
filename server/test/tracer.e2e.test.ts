import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { Socket as ClientSocket } from "socket.io-client";
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  type LobbySnapshot,
  type SessionIssued,
} from "@shared/protocol.js";
import { startTestServer, connectClient, waitFor, type TestServer } from "./setup.js";

describe("tracer: create -> join -> roster -> disconnect -> reconnect", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it("takes a host and a joiner through the whole happy path", async () => {
    // Client A creates a room.
    const clientA = await connectClient(server.url);
    const sessionA = waitFor<SessionIssued>(clientA, SERVER_EVENTS.session);
    const stateA1 = waitFor<LobbySnapshot>(clientA, SERVER_EVENTS.state);
    clientA.emit(CLIENT_EVENTS.createRoom, { name: "Alice" });

    const [issuedA, snapshotA1] = await Promise.all([sessionA, stateA1]);
    expect(issuedA.token).toBeTruthy();
    expect(issuedA.playerId).toBeTruthy();
    expect(snapshotA1.roomCode).toMatch(/^\d{4}$/);
    expect(snapshotA1.players).toHaveLength(1);
    expect(snapshotA1.players[0].isHost).toBe(true);

    const roomCode = snapshotA1.roomCode;

    // Client B joins with the code.
    const clientB = await connectClient(server.url);
    const sessionB = waitFor<SessionIssued>(clientB, SERVER_EVENTS.session);
    const stateB1 = waitFor<LobbySnapshot>(clientB, SERVER_EVENTS.state);
    const stateA2 = waitFor<LobbySnapshot>(clientA, SERVER_EVENTS.state);
    clientB.emit(CLIENT_EVENTS.joinRoom, { roomCode, name: "Bob" });

    const [issuedB, snapshotB1, snapshotA2] = await Promise.all([sessionB, stateB1, stateA2]);
    expect(issuedB.token).not.toBe(issuedA.token);

    for (const snapshot of [snapshotB1, snapshotA2]) {
      expect(snapshot.players).toHaveLength(2);
      const hosts = snapshot.players.filter((p) => p.isHost);
      expect(hosts).toHaveLength(1);
      expect(hosts[0].id).toBe(issuedA.playerId);
    }

    const bobBeforeDrop = snapshotB1.players.find((p) => p.id === issuedB.playerId);
    expect(bobBeforeDrop?.score).toBe(0);

    // Client B disconnects.
    const stateAOnDrop = waitFor<LobbySnapshot>(clientA, SERVER_EVENTS.state);
    clientB.close();
    const snapshotAOnDrop = await stateAOnDrop;
    expect(snapshotAOnDrop.players).toHaveLength(2);
    const bobOnDrop = snapshotAOnDrop.players.find((p) => p.id === issuedB.playerId);
    expect(bobOnDrop?.connected).toBe(false);

    // Client B reconnects using the token it was issued.
    const clientB2 = await connectClient(server.url, issuedB.token);
    const stateB2 = waitFor<LobbySnapshot>(clientB2, SERVER_EVENTS.state);
    const stateAOnRejoin = waitFor<LobbySnapshot>(clientA, SERVER_EVENTS.state);
    clientB2.emit(CLIENT_EVENTS.rejoin);

    const [snapshotB2, snapshotAOnRejoin] = await Promise.all([stateB2, stateAOnRejoin]);

    for (const snapshot of [snapshotB2, snapshotAOnRejoin]) {
      expect(snapshot.players).toHaveLength(2);
      const bob = snapshot.players.find((p) => p.id === issuedB.playerId);
      expect(bob).toBeDefined();
      expect(bob?.name).toBe("Bob");
      expect(bob?.score).toBe(0);
      expect(bob?.connected).toBe(true);
    }

    expect(snapshotB2.you.id).toBe(issuedB.playerId);

    clientA.close();
    clientB2.close();
  });

  it("a token the server never issued gets a fresh session, never someone else's", async () => {
    const clientA = await connectClient(server.url);
    const sessionA = waitFor<SessionIssued>(clientA, SERVER_EVENTS.session);
    clientA.emit(CLIENT_EVENTS.createRoom, { name: "Carol" });
    const issuedA = await sessionA;

    const unknownToken = randomUUID();
    const strangerClient = await connectClient(server.url, unknownToken);
    const sessionStranger = waitFor<SessionIssued>(strangerClient, SERVER_EVENTS.session);
    strangerClient.emit(CLIENT_EVENTS.createRoom, { name: "Stranger" });
    const issuedStranger = await sessionStranger;

    expect(issuedStranger.token).not.toBe(unknownToken);
    expect(issuedStranger.token).not.toBe(issuedA.token);
    expect(issuedStranger.playerId).not.toBe(issuedA.playerId);

    clientA.close();
    strangerClient.close();
  });

  it("never returns the same room code twice, even a forced collision resolves distinctly", async () => {
    const { RoomManager: RealRoomManager } = await import("../src/rooms/RoomManager.js");
    const realManager = new RealRoomManager();
    const roomA = realManager.createRoom();
    const roomB = realManager.createRoom();
    expect(roomA.code).not.toBe(roomB.code);

    // Now force a genuine collision: stub the generator to repeat "1111" once,
    // proving the retry loop — not just statistical luck — is what keeps codes distinct.
    let calls = 0;
    vi.resetModules();
    vi.doMock("nanoid", () => ({
      customAlphabet: () => () => {
        calls++;
        return calls <= 2 ? "1111" : "2222";
      },
    }));

    const { RoomManager: StubbedRoomManager } = await import("../src/rooms/RoomManager.js");
    const stubbedManager = new StubbedRoomManager();
    const first = stubbedManager.createRoom(); // candidate "1111", accepted
    const second = stubbedManager.createRoom(); // candidate "1111" collides, retries to "2222"

    expect(first.code).toBe("1111");
    expect(second.code).toBe("2222");
    expect(first.code).not.toBe(second.code);

    vi.doUnmock("nanoid");
    vi.resetModules();
  });
});
