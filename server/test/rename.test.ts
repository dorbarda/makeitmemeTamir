import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  type LobbySnapshot,
  type ProtocolError,
} from "@shared/protocol.js";
import { startTestServer, connectClient, waitFor, type TestServer } from "./setup.js";

describe("lobby-only rename with auto-numbered collisions (D-07, D-09)", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it("renames while in LOBBY and broadcasts the new name to everyone", async () => {
    const clientA = await connectClient(server.url);
    const stateA1 = waitFor<LobbySnapshot>(clientA, SERVER_EVENTS.state);
    clientA.emit(CLIENT_EVENTS.createRoom, { name: "דני" });
    const snapshotA1 = await stateA1;
    const roomCode = snapshotA1.roomCode;

    const clientB = await connectClient(server.url);
    const stateB1 = waitFor<LobbySnapshot>(clientB, SERVER_EVENTS.state);
    const stateA2 = waitFor<LobbySnapshot>(clientA, SERVER_EVENTS.state);
    clientB.emit(CLIENT_EVENTS.joinRoom, { roomCode, name: "רון" });
    await Promise.all([stateB1, stateA2]);

    const stateAOnRename = waitFor<LobbySnapshot>(clientA, SERVER_EVENTS.state);
    const stateBOnRename = waitFor<LobbySnapshot>(clientB, SERVER_EVENTS.state);
    clientB.emit(CLIENT_EVENTS.rename, { name: "רוני" });
    const [snapshotAOnRename, snapshotBOnRename] = await Promise.all([
      stateAOnRename,
      stateBOnRename,
    ]);

    for (const snapshot of [snapshotAOnRename, snapshotBOnRename]) {
      const renamed = snapshot.players.find((p) => p.name === "רוני");
      expect(renamed).toBeDefined();
    }

    clientA.close();
    clientB.close();
  });

  it("numbers a rename that collides with an existing name rather than refusing", async () => {
    const clientA = await connectClient(server.url);
    const stateA1 = waitFor<LobbySnapshot>(clientA, SERVER_EVENTS.state);
    clientA.emit(CLIENT_EVENTS.createRoom, { name: "משה" });
    const snapshotA1 = await stateA1;
    const roomCode = snapshotA1.roomCode;
    const aliceId = snapshotA1.players[0].id;

    const clientB = await connectClient(server.url);
    const stateB1 = waitFor<LobbySnapshot>(clientB, SERVER_EVENTS.state);
    clientB.emit(CLIENT_EVENTS.joinRoom, { roomCode, name: "אבי" });
    await stateB1;

    const stateBOnRename = waitFor<LobbySnapshot>(clientB, SERVER_EVENTS.state);
    clientB.emit(CLIENT_EVENTS.rename, { name: "משה" });
    const snapshotBOnRename = await stateBOnRename;
    const bob = snapshotBOnRename.players.find((p) => p.id !== aliceId);
    expect(bob?.name).toBe("משה 2");

    clientA.close();
    clientB.close();
  });

  it("is a no-op when renaming a player to their own current name", async () => {
    const clientA = await connectClient(server.url);
    const stateA1 = waitFor<LobbySnapshot>(clientA, SERVER_EVENTS.state);
    clientA.emit(CLIENT_EVENTS.createRoom, { name: "תמיר" });
    await stateA1;

    const stateAOnRename = waitFor<LobbySnapshot>(clientA, SERVER_EVENTS.state);
    clientA.emit(CLIENT_EVENTS.rename, { name: "תמיר" });
    const snapshotAOnRename = await stateAOnRename;
    expect(snapshotAOnRename.players[0].name).toBe("תמיר");

    clientA.close();
  });

  it("refuses a rename once the room has left LOBBY, with the stored name unchanged", async () => {
    const clientA = await connectClient(server.url);
    const stateA1 = waitFor<LobbySnapshot>(clientA, SERVER_EVENTS.state);
    clientA.emit(CLIENT_EVENTS.createRoom, { name: "שרה" });
    const snapshotA1 = await stateA1;
    const roomCode = snapshotA1.roomCode;
    const aliceId = snapshotA1.players[0].id;

    const room = server.roomManager.findRoom(roomCode);
    expect(room).toBeDefined();
    room!.phase = "WRITING";

    const errorA = waitFor<ProtocolError>(clientA, SERVER_EVENTS.error);
    clientA.emit(CLIENT_EVENTS.rename, { name: "שרה החדשה" });
    const err = await errorA;
    expect(err.code).toBe("NAME_LOCKED");
    expect(room!.players.get(aliceId)?.name).toBe("שרה");

    clientA.close();
  });

  it("refuses an empty rename with NAME_REQUIRED", async () => {
    const clientA = await connectClient(server.url);
    const stateA1 = waitFor<LobbySnapshot>(clientA, SERVER_EVENTS.state);
    clientA.emit(CLIENT_EVENTS.createRoom, { name: "יעל" });
    await stateA1;

    const errorA = waitFor<ProtocolError>(clientA, SERVER_EVENTS.error);
    clientA.emit(CLIENT_EVENTS.rename, { name: "   " });
    const err = await errorA;
    expect(err.code).toBe("NAME_REQUIRED");

    clientA.close();
  });
});
