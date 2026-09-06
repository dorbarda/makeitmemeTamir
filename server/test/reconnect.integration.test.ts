import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  type LobbySnapshot,
  type SessionIssued,
} from "@shared/protocol.js";
import { startTestServer, connectClient, waitFor, type TestServer } from "./setup.js";

/**
 * Plan 01-01's tracer already exercises this end to end. This file pins it
 * as its own standalone regression (LIVE-02) so a future change that breaks
 * reconnect-by-token fails loudly and specifically, rather than only as one
 * assertion buried inside a longer end-to-end scenario.
 */
describe("reconnect with a known token restores the same identity (LIVE-02)", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it("restores the same playerId, name, score, and leaves the player count unchanged", async () => {
    const clientA = await connectClient(server.url);
    const sessionA = waitFor<SessionIssued>(clientA, SERVER_EVENTS.session);
    const stateA1 = waitFor<LobbySnapshot>(clientA, SERVER_EVENTS.state);
    clientA.emit(CLIENT_EVENTS.createRoom, { name: "Host" });
    const [issuedA, snapshotA1] = await Promise.all([sessionA, stateA1]);
    const roomCode = snapshotA1.roomCode;

    const clientB = await connectClient(server.url);
    const sessionB = waitFor<SessionIssued>(clientB, SERVER_EVENTS.session);
    const stateB1 = waitFor<LobbySnapshot>(clientB, SERVER_EVENTS.state);
    const stateAOnJoin = waitFor<LobbySnapshot>(clientA, SERVER_EVENTS.state);
    clientB.emit(CLIENT_EVENTS.joinRoom, { roomCode, name: "Guest" });
    const [issuedB, snapshotB1] = await Promise.all([sessionB, stateB1, stateAOnJoin]);
    expect(snapshotB1.players).toHaveLength(2);
    const playerCountBefore = snapshotB1.players.length;

    // Disconnect client B.
    const stateAOnDrop = waitFor<LobbySnapshot>(clientA, SERVER_EVENTS.state);
    clientB.close();
    const snapshotAOnDrop = await stateAOnDrop;
    expect(snapshotAOnDrop.players).toHaveLength(playerCountBefore);
    const droppedView = snapshotAOnDrop.players.find((p) => p.id === issuedB.playerId);
    expect(droppedView?.connected).toBe(false);

    // Reconnect with the same token.
    const clientB2 = await connectClient(server.url, issuedB.token);
    const stateB2 = waitFor<LobbySnapshot>(clientB2, SERVER_EVENTS.state);
    const stateAOnRejoin = waitFor<LobbySnapshot>(clientA, SERVER_EVENTS.state);
    clientB2.emit(CLIENT_EVENTS.rejoin);
    const [snapshotB2, snapshotAOnRejoin] = await Promise.all([stateB2, stateAOnRejoin]);

    for (const snapshot of [snapshotB2, snapshotAOnRejoin]) {
      expect(snapshot.players).toHaveLength(playerCountBefore);
      const bob = snapshot.players.find((p) => p.id === issuedB.playerId);
      expect(bob).toBeDefined();
      expect(bob?.name).toBe("Guest");
      expect(bob?.score).toBe(0);
      expect(bob?.connected).toBe(true);
    }
    expect(snapshotB2.you.id).toBe(issuedB.playerId);
    expect(issuedA.playerId).not.toBe(issuedB.playerId);

    clientA.close();
    clientB2.close();
  });
});
