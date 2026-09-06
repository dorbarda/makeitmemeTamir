import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  type LobbySnapshot,
  type SessionIssued,
} from "@shared/protocol.js";
import { startTestServer, connectClient, waitFor, type TestServer } from "./setup.js";

describe("rejoin with a token the server never issued (T-01-17)", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it("gets a fresh session, not an error, and touches nobody else's identity", async () => {
    // An existing player, present before the stranger ever connects, so we
    // can prove afterward that nothing about them changed.
    const clientA = await connectClient(server.url);
    const sessionA = waitFor<SessionIssued>(clientA, SERVER_EVENTS.session);
    const stateA1 = waitFor<LobbySnapshot>(clientA, SERVER_EVENTS.state);
    clientA.emit(CLIENT_EVENTS.createRoom, { name: "Dana" });
    const [issuedA] = await Promise.all([sessionA, stateA1]);

    const unknownToken = randomUUID();
    const stranger = await connectClient(server.url, unknownToken);
    const sessionStranger = waitFor<SessionIssued>(stranger, SERVER_EVENTS.session);
    stranger.emit(CLIENT_EVENTS.rejoin);
    const issuedStranger = await sessionStranger;

    expect(issuedStranger.token).not.toBe(unknownToken);
    expect(issuedStranger.token).not.toBe(issuedA.token);

    // No existing player's record was touched: a fresh resync as A still
    // shows exactly the one untouched player.
    const stateA2 = waitFor<LobbySnapshot>(clientA, SERVER_EVENTS.state);
    clientA.emit(CLIENT_EVENTS.requestResync);
    const snapshotA2 = await stateA2;
    expect(snapshotA2.players).toHaveLength(1);
    expect(snapshotA2.players[0].id).toBe(issuedA.playerId);
    expect(snapshotA2.players[0].name).toBe("Dana");

    clientA.close();
    stranger.close();
  });

  it("does not crash the handler and never attaches the unknown token to an existing room", async () => {
    const clientA = await connectClient(server.url);
    const sessionA = waitFor<SessionIssued>(clientA, SERVER_EVENTS.session);
    const stateA1 = waitFor<LobbySnapshot>(clientA, SERVER_EVENTS.state);
    clientA.emit(CLIENT_EVENTS.createRoom, { name: "Erez" });
    await Promise.all([sessionA, stateA1]);

    const unknownToken = randomUUID();
    const stranger = await connectClient(server.url, unknownToken);

    // A second, unrelated intent right after the fresh-session reply must
    // still work normally — the handler is left in a sane state, not wedged.
    const strangerSession = waitFor<SessionIssued>(stranger, SERVER_EVENTS.session);
    stranger.emit(CLIENT_EVENTS.rejoin);
    await strangerSession;

    const strangerCreateSession = waitFor<SessionIssued>(stranger, SERVER_EVENTS.session);
    const strangerState = waitFor<LobbySnapshot>(stranger, SERVER_EVENTS.state);
    stranger.emit(CLIENT_EVENTS.createRoom, { name: "Stranger" });
    const [issuedStranger, snapshotStranger] = await Promise.all([
      strangerCreateSession,
      strangerState,
    ]);

    expect(snapshotStranger.players).toHaveLength(1);
    expect(snapshotStranger.players[0].id).toBe(issuedStranger.playerId);

    clientA.close();
    stranger.close();
  });
});
