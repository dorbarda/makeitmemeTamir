import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  type LobbySnapshot,
  type ProtocolError,
} from "@shared/protocol.js";
import { startTestServer, connectClient, waitFor, type TestServer } from "./setup.js";

describe("duplicate display names are auto-numbered, never rejected (D-07)", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it("numbers a second identical name, then a third", async () => {
    const clientA = await connectClient(server.url);
    const stateA1 = waitFor<LobbySnapshot>(clientA, SERVER_EVENTS.state);
    clientA.emit(CLIENT_EVENTS.createRoom, { name: "דור" });
    const snapshotA1 = await stateA1;
    const roomCode = snapshotA1.roomCode;
    const aliceId = snapshotA1.players[0].id;

    const clientB = await connectClient(server.url);
    const stateB1 = waitFor<LobbySnapshot>(clientB, SERVER_EVENTS.state);
    clientB.emit(CLIENT_EVENTS.joinRoom, { roomCode, name: "דור" });
    const snapshotB1 = await stateB1;
    const bob = snapshotB1.players.find((p) => p.id !== aliceId);
    expect(bob?.name).toBe("דור 2");

    const clientC = await connectClient(server.url);
    const stateC1 = waitFor<LobbySnapshot>(clientC, SERVER_EVENTS.state);
    clientC.emit(CLIENT_EVENTS.joinRoom, { roomCode, name: "דור" });
    const snapshotC1 = await stateC1;
    const carol = snapshotC1.players.find((p) => p.id !== aliceId && p.id !== bob?.id);
    expect(carol?.name).toBe("דור 3");

    clientA.close();
    clientB.close();
    clientC.close();
  });

  it("fills the first free suffix, not the next after the highest", async () => {
    const clientA = await connectClient(server.url);
    const stateA1 = waitFor<LobbySnapshot>(clientA, SERVER_EVENTS.state);
    clientA.emit(CLIENT_EVENTS.createRoom, { name: "רון" });
    const snapshotA1 = await stateA1;
    const roomCode = snapshotA1.roomCode;

    const clientB = await connectClient(server.url);
    const stateB1 = waitFor<LobbySnapshot>(clientB, SERVER_EVENTS.state);
    clientB.emit(CLIENT_EVENTS.joinRoom, { roomCode, name: "רון 3" });
    await stateB1;

    const clientC = await connectClient(server.url);
    const stateC1 = waitFor<LobbySnapshot>(clientC, SERVER_EVENTS.state);
    clientC.emit(CLIENT_EVENTS.joinRoom, { roomCode, name: "רון" });
    const snapshotC1 = await stateC1;
    const carol = snapshotC1.players.find((p) => p.name === "רון 2");
    expect(carol).toBeDefined();

    clientA.close();
    clientB.close();
    clientC.close();
  });

  it("normalizes whitespace and case before comparing", async () => {
    const clientA = await connectClient(server.url);
    const stateA1 = waitFor<LobbySnapshot>(clientA, SERVER_EVENTS.state);
    clientA.emit(CLIENT_EVENTS.createRoom, { name: "Dor" });
    const snapshotA1 = await stateA1;
    const roomCode = snapshotA1.roomCode;
    const aliceId = snapshotA1.players[0].id;

    const clientB = await connectClient(server.url);
    const stateB1 = waitFor<LobbySnapshot>(clientB, SERVER_EVENTS.state);
    clientB.emit(CLIENT_EVENTS.joinRoom, { roomCode, name: "  DOR  " });
    const snapshotB1 = await stateB1;
    const bob = snapshotB1.players.find((p) => p.id !== aliceId);
    expect(bob?.name).toBe("DOR 2");

    clientA.close();
    clientB.close();
  });

  it("refuses an empty sanitized name with NAME_REQUIRED and adds no player", async () => {
    const clientA = await connectClient(server.url);
    const stateA1 = waitFor<LobbySnapshot>(clientA, SERVER_EVENTS.state);
    clientA.emit(CLIENT_EVENTS.createRoom, { name: "מארח" });
    const snapshotA1 = await stateA1;
    const roomCode = snapshotA1.roomCode;

    const clientB = await connectClient(server.url);
    const errorB = waitFor<ProtocolError>(clientB, SERVER_EVENTS.error);
    clientB.emit(CLIENT_EVENTS.joinRoom, { roomCode, name: "   " });
    const err = await errorB;
    expect(err.code).toBe("NAME_REQUIRED");

    const resyncState = waitFor<LobbySnapshot>(clientA, SERVER_EVENTS.state);
    clientA.emit(CLIENT_EVENTS.requestResync);
    const snapshot = await resyncState;
    expect(snapshot.players).toHaveLength(1);

    clientA.close();
    clientB.close();
  });
});
