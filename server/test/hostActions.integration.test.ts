import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  type LobbySnapshot,
  type ProtocolError,
} from "@shared/protocol.js";
import { startTestServer, connectClient, waitFor, type TestServer } from "./setup.js";
import { fakeMeme } from "./fixtures/meme.js";
import { Room } from "../src/rooms/Room.js";
import { BETWEEN_PHASES_MS } from "../src/config.js";

/**
 * Phase 6 (LIVE-04/05/06/07) — the four host-only "break-glass" recovery
 * actions: skip the current round, remove a player, end the game early, and
 * restart with the same group. Every method follows `Room.ts`'s existing
 * `changeSetting`/`startGame` validation order — identity first, then
 * phase/state, then the mutation.
 */
describe("host recovery actions — host-only, discard-not-partial-credit, never crash on a bad target", () => {
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

  function waitForPhase(
    socket: Awaited<ReturnType<typeof connectClient>>,
    phase: LobbySnapshot["phase"],
  ): Promise<LobbySnapshot> {
    return new Promise((resolve) => {
      const onState = (snapshot: LobbySnapshot) => {
        if (snapshot.phase === phase) {
          socket.off(SERVER_EVENTS.state, onState);
          resolve(snapshot);
        }
      };
      socket.on(SERVER_EVENTS.state, onState);
    });
  }

  describe("skip-round (LIVE-04)", () => {
    it("a non-host skip-round produces NOT_HOST and the room stays untouched", async () => {
      const { host, b, c, roomCode } = await makeRoomWithThreePlayers();
      void roomCode;

      const errorOnB = waitFor<ProtocolError>(b, SERVER_EVENTS.error);
      b.emit(CLIENT_EVENTS.skipRound);
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

    it("the host skipping mid-WRITING moves straight to ROUND_END with an empty, host-skipped view, then to the next round's WRITING", async () => {
      const { host, b, c, roomCode } = await makeRoomWithThreePlayers();

      const room = server.roomManager.findRoom(roomCode);
      if (!room) throw new Error("room not found for internal seeding");
      room.settings.rounds = 2;

      const hostOnStart = waitForPhase(host, "WRITING");
      host.emit(CLIENT_EVENTS.startGame, {});
      await hostOnStart;

      const roundEndOnHost = waitForPhase(host, "ROUND_END");
      host.emit(CLIENT_EVENTS.skipRound);
      const roundEndSnapshot = await roundEndOnHost;

      expect(roundEndSnapshot.phase).toBe("ROUND_END");
      expect(roundEndSnapshot.roundEnd?.entries).toEqual([]);
      expect(roundEndSnapshot.roundEnd?.skippedByHost).toBe(true);

      const nextWritingOnHost = waitForPhase(host, "WRITING");
      const nextSnapshot = await nextWritingOnHost;
      expect(nextSnapshot.phase).toBe("WRITING");
      expect(nextSnapshot.round?.index).toBe(2);

      host.close();
      b.close();
      c.close();
    });

    describe("skip-round discards an already-cast rating (bare Room, fake timers)", () => {
      let room: Room;

      beforeEach(() => {
        vi.useFakeTimers();
        room = new Room("5678", "http://x/join/5678", "data:image/png;base64,");
      });

      afterEach(() => {
        room.dispose();
        vi.useRealTimers();
      });

      it("skipping mid-RATING discards an already-cast rating so the author's score never increases", () => {
        room.settings.rounds = 2;
        const players = [
          room.addPlayer("Host", "t-host"),
          room.addPlayer("B", "t-b"),
          room.addPlayer("C", "t-c"),
        ];
        const [host, b, c] = players;
        room.startGame(host.id);

        room.submitCaption(host.id, fakeMeme("host"));
        room.submitCaption(b.id, fakeMeme("b"));

        vi.advanceTimersByTime(room.settings.writingSeconds * 1000);
        expect(room.phase).toBe("REVEAL_BREAK");
        vi.advanceTimersByTime(BETWEEN_PHASES_MS);
        expect(room.phase).toBe("RATING");

        const authorId = room.rotation[room.stepIndex];
        // c never submitted a caption but is still an eligible rater
        // (D-08) — c is guaranteed not to be the step's author.
        expect(authorId).not.toBe(c.id);
        room.submitRating(c.id, room.stepIndex, 3);

        room.skipRound(host.id);

        const snapshot = room.snapshotFor(host.id);
        expect(snapshot.roundEnd?.skippedByHost).toBe(true);
        expect(snapshot.roundEnd?.entries).toEqual([]);
        const author = [host, b, c].find((p) => p.id === authorId);
        expect(author?.score).toBe(0);

        vi.advanceTimersByTime(BETWEEN_PHASES_MS);
        expect(room.phase).toBe("WRITING");
        expect(room.roundIndex).toBe(2);
      });
    });
  });
});
