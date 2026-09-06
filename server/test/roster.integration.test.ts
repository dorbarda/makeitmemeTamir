import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  type LobbySnapshot,
  type SessionIssued,
} from "@shared/protocol.js";
import { startTestServer, connectClient, waitFor, type TestServer } from "./setup.js";

describe("roster broadcast on join and leave (LOBBY-05)", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it("three concurrent clients each see all three players, exactly one host, and a leave updates the remaining two", async () => {
    const clientA = await connectClient(server.url);
    const sessionA = waitFor<SessionIssued>(clientA, SERVER_EVENTS.session);
    const stateA1 = waitFor<LobbySnapshot>(clientA, SERVER_EVENTS.state);
    clientA.emit(CLIENT_EVENTS.createRoom, { name: "אחת" });
    const [issuedA, snapshotA1] = await Promise.all([sessionA, stateA1]);
    const roomCode = snapshotA1.roomCode;

    const clientB = await connectClient(server.url);
    const stateB1 = waitFor<LobbySnapshot>(clientB, SERVER_EVENTS.state);
    const stateA2 = waitFor<LobbySnapshot>(clientA, SERVER_EVENTS.state);
    clientB.emit(CLIENT_EVENTS.joinRoom, { roomCode, name: "שתיים" });
    const [snapshotB1, snapshotA2] = await Promise.all([stateB1, stateA2]);
    void snapshotA2;

    const clientC = await connectClient(server.url);
    const stateC1 = waitFor<LobbySnapshot>(clientC, SERVER_EVENTS.state);
    const stateA3 = waitFor<LobbySnapshot>(clientA, SERVER_EVENTS.state);
    const stateB2 = waitFor<LobbySnapshot>(clientB, SERVER_EVENTS.state);
    clientC.emit(CLIENT_EVENTS.joinRoom, { roomCode, name: "שלוש" });
    const [snapshotC1, snapshotA3, snapshotB2] = await Promise.all([stateC1, stateA3, stateB2]);

    for (const snapshot of [snapshotC1, snapshotA3, snapshotB2]) {
      expect(snapshot.players).toHaveLength(3);
      const hosts = snapshot.players.filter((p) => p.isHost);
      expect(hosts).toHaveLength(1);
      expect(hosts[0].id).toBe(issuedA.playerId);
    }

    // The joining player (C) must see everyone already present, not only itself.
    const namesSeenByC = snapshotC1.players.map((p) => p.name).sort();
    expect(namesSeenByC).toEqual(["אחת", "שלוש", "שתיים"].sort());
    void snapshotB1;

    // One disconnects; the remaining two each receive a fresh snapshot.
    const stateAOnDrop = waitFor<LobbySnapshot>(clientA, SERVER_EVENTS.state);
    const stateBOnDrop = waitFor<LobbySnapshot>(clientB, SERVER_EVENTS.state);
    clientC.close();
    const [snapshotAOnDrop, snapshotBOnDrop] = await Promise.all([stateAOnDrop, stateBOnDrop]);

    for (const snapshot of [snapshotAOnDrop, snapshotBOnDrop]) {
      expect(snapshot.players).toHaveLength(3);
      const dropped = snapshot.players.find((p) => p.name === "שלוש");
      expect(dropped?.connected).toBe(false);
    }

    clientA.close();
    clientB.close();
  });
});
