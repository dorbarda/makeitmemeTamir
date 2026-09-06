import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  type LobbySnapshot,
  type ProtocolError,
} from "@shared/protocol.js";
import { startTestServer, connectClient, waitFor, type TestServer } from "./setup.js";

// Real transport, real timers throughout — socket.io's own ping timers would
// be faked along with the room's if fake timers were mixed in here. Proves
// the single most important property of this plan: a caption submitted by
// one player never reaches another player's device before the round closes
// (D-14), not even as a substring buried in the JSON of an otherwise
// unrelated field.
describe("caption privacy — no caption text reaches another player's device during WRITING (ROUND-05, D-14)", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  async function makeRoomWithThreePlayers(suffix: string) {
    const host = await connectClient(server.url);
    const stateHost1 = waitFor<LobbySnapshot>(host, SERVER_EVENTS.state);
    host.emit(CLIENT_EVENTS.createRoom, { name: `מנחה${suffix}` });
    const hostSnapshot = await stateHost1;
    const roomCode = hostSnapshot.roomCode;

    const b = await connectClient(server.url);
    const stateB1 = waitFor<LobbySnapshot>(b, SERVER_EVENTS.state);
    const stateHost2 = waitFor<LobbySnapshot>(host, SERVER_EVENTS.state);
    b.emit(CLIENT_EVENTS.joinRoom, { roomCode, name: `בי${suffix}` });
    await Promise.all([stateB1, stateHost2]);

    const c = await connectClient(server.url);
    const stateC1 = waitFor<LobbySnapshot>(c, SERVER_EVENTS.state);
    const stateHost3 = waitFor<LobbySnapshot>(host, SERVER_EVENTS.state);
    const stateB2 = waitFor<LobbySnapshot>(b, SERVER_EVENTS.state);
    c.emit(CLIENT_EVENTS.joinRoom, { roomCode, name: `גי${suffix}` });
    await Promise.all([stateC1, stateHost3, stateB2]);

    return { host, b, c, roomCode };
  }

  it("keeps another player's caption entirely out of the WRITING snapshot while progress reflects the submission", async () => {
    const { host, b, c } = await makeRoomWithThreePlayers("1");

    const stateHostOnStart = waitFor<LobbySnapshot>(host, SERVER_EVENTS.state);
    const stateBOnStart = waitFor<LobbySnapshot>(b, SERVER_EVENTS.state);
    const stateCOnStart = waitFor<LobbySnapshot>(c, SERVER_EVENTS.state);
    host.emit(CLIENT_EVENTS.startGame, {});
    const [hostSnapshot] = await Promise.all([stateHostOnStart, stateBOnStart, stateCOnStart]);
    expect(hostSnapshot.phase).toBe("WRITING");

    // A distinctive Hebrew string that appears nowhere else in this test's
    // fixture data (names, error messages, etc).
    const distinctiveCaption = "ברווז ירוק רוקד טנגו על הגג בלילה סוער";

    const bOnHostSubmit = waitFor<LobbySnapshot>(b, SERVER_EVENTS.state);
    host.emit(CLIENT_EVENTS.submitCaption, { text: distinctiveCaption });
    const snapshotB = await bOnHostSubmit;

    expect(JSON.stringify(snapshotB)).not.toContain(distinctiveCaption);
    expect(snapshotB.progress?.submitted).toBe(1);
    expect(snapshotB.progress?.submittedPlayerIds).toContain(hostSnapshot.you.id);

    host.close();
    b.close();
    c.close();
  });

  it("refuses a submit-caption arriving after the writing phase has closed with WRONG_PHASE and never changes progress", async () => {
    const { host, b, c, roomCode } = await makeRoomWithThreePlayers("2");

    // Test-only internal seeding to make the writing phase close almost
    // immediately — the protocol path that rejects a non-preset
    // writingSeconds value is already proven in plan 02-02.
    const room = server.roomManager.findRoom(roomCode);
    if (!room) throw new Error("room not found for internal seeding");
    room.settings.writingSeconds = 1;

    const hostOnStart = waitFor<LobbySnapshot>(host, SERVER_EVENTS.state);
    const bOnStart = waitFor<LobbySnapshot>(b, SERVER_EVENTS.state);
    const cOnStart = waitFor<LobbySnapshot>(c, SERVER_EVENTS.state);
    host.emit(CLIENT_EVENTS.startGame, {});
    const [hostAfterStart] = await Promise.all([hostOnStart, bOnStart, cOnStart]);
    expect(hostAfterStart.phase).toBe("WRITING");

    // Wait for the phase to actually leave WRITING (writingSeconds = 1).
    await new Promise<void>((resolve) => {
      const onState = (snapshot: LobbySnapshot) => {
        if (snapshot.phase !== "WRITING") {
          host.off(SERVER_EVENTS.state, onState);
          resolve();
        }
      };
      host.on(SERVER_EVENTS.state, onState);
    });

    const errorOnHost = waitFor<ProtocolError>(host, SERVER_EVENTS.error);
    host.emit(CLIENT_EVENTS.submitCaption, { text: "מאוחר מדי" });
    const error = await errorOnHost;
    expect(error.code).toBe("WRONG_PHASE");

    host.close();
    b.close();
    c.close();
  });
});
