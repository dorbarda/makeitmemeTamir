import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  type LobbySnapshot,
  type ProtocolError,
  type SessionIssued,
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

  /** Same as `makeRoomWithThreePlayers`, but also captures each player's
   * issued `{ token, playerId }` — needed for the remove-player rejoin test,
   * which must reconnect with `b`'s ORIGINAL session token. */
  async function makeRoomWithThreePlayersAndSessions() {
    const host = await connectClient(server.url);
    const sessionHost = waitFor<SessionIssued>(host, SERVER_EVENTS.session);
    const stateHost1 = waitFor<LobbySnapshot>(host, SERVER_EVENTS.state);
    host.emit(CLIENT_EVENTS.createRoom, { name: "מנחה" });
    const [issuedHost, hostSnapshot] = await Promise.all([sessionHost, stateHost1]);
    const roomCode = hostSnapshot.roomCode;

    const b = await connectClient(server.url);
    const sessionB = waitFor<SessionIssued>(b, SERVER_EVENTS.session);
    const stateB1 = waitFor<LobbySnapshot>(b, SERVER_EVENTS.state);
    const stateHost2 = waitFor<LobbySnapshot>(host, SERVER_EVENTS.state);
    b.emit(CLIENT_EVENTS.joinRoom, { roomCode, name: "בי" });
    const [issuedB] = await Promise.all([sessionB, stateB1, stateHost2]);

    const c = await connectClient(server.url);
    const sessionC = waitFor<SessionIssued>(c, SERVER_EVENTS.session);
    const stateC1 = waitFor<LobbySnapshot>(c, SERVER_EVENTS.state);
    const stateHost3 = waitFor<LobbySnapshot>(host, SERVER_EVENTS.state);
    const stateB2 = waitFor<LobbySnapshot>(b, SERVER_EVENTS.state);
    c.emit(CLIENT_EVENTS.joinRoom, { roomCode, name: "גי" });
    const [issuedC] = await Promise.all([sessionC, stateC1, stateHost3, stateB2]);

    return { host, b, c, roomCode, issuedHost, issuedB, issuedC };
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

  describe("remove-player (LIVE-05)", () => {
    it("a non-host remove-player produces NOT_HOST", async () => {
      const { host, b, c, roomCode } = await makeRoomWithThreePlayersAndSessions();
      void roomCode;

      const errorOnB = waitFor<ProtocolError>(b, SERVER_EVENTS.error);
      const cSessionOnB = await (async () => {
        // Need c's playerId — request-resync on c to read it back.
        const resync = waitFor<LobbySnapshot>(c, SERVER_EVENTS.state);
        c.emit(CLIENT_EVENTS.requestResync);
        return resync;
      })();
      const targetPlayerId = cSessionOnB.you.id;

      b.emit(CLIENT_EVENTS.removePlayer, { targetPlayerId });
      const error = await errorOnB;
      expect(error.code).toBe("NOT_HOST");

      const resync = waitFor<LobbySnapshot>(host, SERVER_EVENTS.state);
      host.emit(CLIENT_EVENTS.requestResync);
      const snapshot = await resync;
      const cView = snapshot.players.find((p) => p.id === targetPlayerId);
      expect(cView?.connected).toBe(true);

      host.close();
      b.close();
      c.close();
    });

    it("the host removes a connected player, force-closing their socket; they rejoin later with the same identity and score intact", async () => {
      const { host, b, c, issuedB } = await makeRoomWithThreePlayersAndSessions();

      const bDisconnected = new Promise<void>((resolve) => {
        b.once("disconnect", () => resolve());
      });
      const stateOnHost = waitFor<LobbySnapshot>(host, SERVER_EVENTS.state);
      const stateOnC = waitFor<LobbySnapshot>(c, SERVER_EVENTS.state);
      host.emit(CLIENT_EVENTS.removePlayer, { targetPlayerId: issuedB.playerId });

      await bDisconnected;
      const [hostSnapshot, cSnapshot] = await Promise.all([stateOnHost, stateOnC]);
      for (const snapshot of [hostSnapshot, cSnapshot]) {
        const bView = snapshot.players.find((p) => p.id === issuedB.playerId);
        expect(bView?.connected).toBe(false);
      }

      const b2 = await connectClient(server.url, issuedB.token);
      const stateB2 = waitFor<LobbySnapshot>(b2, SERVER_EVENTS.state);
      b2.emit(CLIENT_EVENTS.rejoin);
      const rejoinedSnapshot = await stateB2;

      expect(rejoinedSnapshot.you.id).toBe(issuedB.playerId);
      const rejoinedView = rejoinedSnapshot.players.find((p) => p.id === issuedB.playerId);
      expect(rejoinedView?.name).toBe("בי");
      expect(rejoinedView?.score).toBe(0);
      expect(rejoinedView?.connected).toBe(true);

      host.close();
      b2.close();
      c.close();
    });

    it("removing a nonexistent targetPlayerId, or the host's own id, is a safe no-op", async () => {
      const { host, b, c, issuedHost } = await makeRoomWithThreePlayersAndSessions();

      const errorOnFakeTarget = waitFor<ProtocolError>(host, SERVER_EVENTS.error, 500).then(
        () => "error" as const,
        () => "timeout" as const,
      );
      host.emit(CLIENT_EVENTS.removePlayer, { targetPlayerId: "not-a-real-id" });
      expect(await errorOnFakeTarget).toBe("timeout");

      const resync1 = waitFor<LobbySnapshot>(host, SERVER_EVENTS.state);
      host.emit(CLIENT_EVENTS.requestResync);
      const snapshot1 = await resync1;
      expect(snapshot1.players).toHaveLength(3);

      const errorOnSelfTarget = waitFor<ProtocolError>(host, SERVER_EVENTS.error, 500).then(
        () => "error" as const,
        () => "timeout" as const,
      );
      host.emit(CLIENT_EVENTS.removePlayer, { targetPlayerId: issuedHost.playerId });
      expect(await errorOnSelfTarget).toBe("timeout");

      const resync2 = waitFor<LobbySnapshot>(host, SERVER_EVENTS.state);
      host.emit(CLIENT_EVENTS.requestResync);
      const snapshot2 = await resync2;
      const hostView = snapshot2.players.find((p) => p.id === issuedHost.playerId);
      expect(hostView?.connected).toBe(true);
      expect(hostView?.isHost).toBe(true);

      host.close();
      b.close();
      c.close();
    });

    it("removing the same already-disconnected target twice never crashes", async () => {
      const { host, c, issuedB, b } = await makeRoomWithThreePlayersAndSessions();

      const bDisconnected = new Promise<void>((resolve) => {
        b.once("disconnect", () => resolve());
      });
      const stateOnHost1 = waitFor<LobbySnapshot>(host, SERVER_EVENTS.state);
      host.emit(CLIENT_EVENTS.removePlayer, { targetPlayerId: issuedB.playerId });
      await bDisconnected;
      await stateOnHost1;

      // Second removal of the same, now-already-disconnected target.
      const stateOnHost2 = waitFor<LobbySnapshot>(host, SERVER_EVENTS.state);
      host.emit(CLIENT_EVENTS.removePlayer, { targetPlayerId: issuedB.playerId });
      const secondSnapshot = await stateOnHost2;
      const bView = secondSnapshot.players.find((p) => p.id === issuedB.playerId);
      expect(bView?.connected).toBe(false);

      // Server still responds normally afterward — proof it never crashed.
      const resync = waitFor<LobbySnapshot>(host, SERVER_EVENTS.state);
      host.emit(CLIENT_EVENTS.requestResync);
      const resyncSnapshot = await resync;
      expect(resyncSnapshot.players).toHaveLength(3);

      host.close();
      c.close();
    });
  });
});
