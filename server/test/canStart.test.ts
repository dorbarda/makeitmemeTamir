import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { CLIENT_EVENTS, SERVER_EVENTS, type LobbySnapshot } from "@shared/protocol.js";
import { startTestServer, connectClient, waitFor, type TestServer } from "./setup.js";

describe("canStart flips true only at MIN_PLAYERS_TO_START (D-11)", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it("is false at 1 and 2 players, true at 3", async () => {
    const clientA = await connectClient(server.url);
    const stateA1 = waitFor<LobbySnapshot>(clientA, SERVER_EVENTS.state);
    clientA.emit(CLIENT_EVENTS.createRoom, { name: "א" });
    const snapshotA1 = await stateA1;
    expect(snapshotA1.canStart).toBe(false);
    const roomCode = snapshotA1.roomCode;

    const clientB = await connectClient(server.url);
    const stateB1 = waitFor<LobbySnapshot>(clientB, SERVER_EVENTS.state);
    clientB.emit(CLIENT_EVENTS.joinRoom, { roomCode, name: "ב" });
    const snapshotB1 = await stateB1;
    expect(snapshotB1.canStart).toBe(false);

    const clientC = await connectClient(server.url);
    const stateC1 = waitFor<LobbySnapshot>(clientC, SERVER_EVENTS.state);
    clientC.emit(CLIENT_EVENTS.joinRoom, { roomCode, name: "ג" });
    const snapshotC1 = await stateC1;
    expect(snapshotC1.canStart).toBe(true);

    clientA.close();
    clientB.close();
    clientC.close();
  });

  it("keeps counting a temporarily disconnected player toward the minimum", async () => {
    const clientA = await connectClient(server.url);
    const stateA1 = waitFor<LobbySnapshot>(clientA, SERVER_EVENTS.state);
    clientA.emit(CLIENT_EVENTS.createRoom, { name: "דנה" });
    const snapshotA1 = await stateA1;
    const roomCode = snapshotA1.roomCode;

    const clientB = await connectClient(server.url);
    const stateB1 = waitFor<LobbySnapshot>(clientB, SERVER_EVENTS.state);
    clientB.emit(CLIENT_EVENTS.joinRoom, { roomCode, name: "עידו" });
    await stateB1;

    const clientC = await connectClient(server.url);
    const stateC1 = waitFor<LobbySnapshot>(clientC, SERVER_EVENTS.state);
    const stateAOnC = waitFor<LobbySnapshot>(clientA, SERVER_EVENTS.state);
    clientC.emit(CLIENT_EVENTS.joinRoom, { roomCode, name: "גיל" });
    await Promise.all([stateC1, stateAOnC]);

    const stateAOnDrop = waitFor<LobbySnapshot>(clientA, SERVER_EVENTS.state);
    clientC.close();
    const snapshotAOnDrop = await stateAOnDrop;
    expect(snapshotAOnDrop.players).toHaveLength(3);
    expect(snapshotAOnDrop.canStart).toBe(true);

    clientA.close();
    clientB.close();
  });
});
