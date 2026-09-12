import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  type LobbySnapshot,
} from "@shared/protocol.js";
import { startTestServer, connectClient, waitFor, type TestServer } from "./setup.js";
import { PHOTO_FILENAMES } from "../src/rooms/photos.js";
import { fakeMeme } from "./fixtures/meme.js";

/**
 * The tracer's own real-socket proof for ROUND-01, ROUND-03, VOTE-01,
 * VOTE-02, SCORE-01: real, distinct photos land on the writing screen; the
 * SAME photo rides the rating step for the meme's author; and a rated meme's
 * score lands on the right player as a real server-computed sum, confirmed
 * identically from a second client's own snapshot. Real transport, real
 * timers — follows ratingStep.integration.test.ts's real-socket describe and
 * settingsIntent.integration.test.ts's test-only internal seeding style.
 */
describe("real content — real photos, real tier-name ratings, real scores (ROUND-01, ROUND-03, VOTE-01, VOTE-02, SCORE-01)", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

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

  function waitForRatingStepIndex(
    socket: Awaited<ReturnType<typeof connectClient>>,
    index: number,
  ): Promise<LobbySnapshot> {
    return new Promise((resolve) => {
      const onState = (snapshot: LobbySnapshot) => {
        if (snapshot.phase === "RATING" && snapshot.ratingStep?.index === index) {
          socket.off(SERVER_EVENTS.state, onState);
          resolve(snapshot);
        }
      };
      socket.on(SERVER_EVENTS.state, onState);
    });
  }

  it(
    "assigns distinct real photos, carries the correct one into the rating step, and lands a real server-computed score on the right player",
    async () => {
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

      // Test-only internal seeding so the round moves quickly — the protocol
      // path that rejects a non-preset value is already proven in plan 02-02.
      const room = server.roomManager.findRoom(roomCode);
      if (!room) throw new Error("room not found for internal seeding");
      room.settings.writingSeconds = 1;
      room.settings.ratingSeconds = 1;

      const hostOnStart = waitFor<LobbySnapshot>(host, SERVER_EVENTS.state);
      const bOnStart = waitFor<LobbySnapshot>(b, SERVER_EVENTS.state);
      const cOnStart = waitFor<LobbySnapshot>(c, SERVER_EVENTS.state);
      host.emit(CLIENT_EVENTS.startGame, {});
      const [hostAfterStart, bAfterStart] = await Promise.all([hostOnStart, bOnStart, cOnStart]);
      expect(hostAfterStart.phase).toBe("WRITING");

      const hostPlayerId = hostAfterStart.you.id;
      const bPlayerId = bAfterStart.you.id;

      // D-01 — every player carries their own real, distinct photo, never a
      // numbered placeholder.
      expect(hostAfterStart.yourPhotoUrl).not.toBeNull();
      expect(bAfterStart.yourPhotoUrl).not.toBeNull();
      expect(hostAfterStart.yourPhotoUrl).toMatch(/^\/tamir-photos\//);
      expect(bAfterStart.yourPhotoUrl).toMatch(/^\/tamir-photos\//);
      expect(hostAfterStart.yourPhotoUrl).not.toBe(bAfterStart.yourPhotoUrl);
      expect(PHOTO_FILENAMES).toContain(
        decodeURIComponent(hostAfterStart.yourPhotoUrl!.replace("/tamir-photos/", "")),
      );
      expect(PHOTO_FILENAMES).toContain(
        decodeURIComponent(bAfterStart.yourPhotoUrl!.replace("/tamir-photos/", "")),
      );

      // Host and b submit captions; c deliberately never submits (mirrors the
      // established two-of-three pattern that already clears
      // MIN_SUBMISSIONS_TO_RATE).
      const hostMeme = fakeMeme("host");
      const bMeme = fakeMeme("b");
      const memeByPlayerId = new Map([
        [hostPlayerId, hostMeme],
        [bPlayerId, bMeme],
      ]);

      const bOnHostSubmit = waitFor<LobbySnapshot>(b, SERVER_EVENTS.state);
      host.emit(CLIENT_EVENTS.submitCaption, { meme: hostMeme });
      await bOnHostSubmit;

      const hostOnBSubmit = waitFor<LobbySnapshot>(host, SERVER_EVENTS.state);
      b.emit(CLIENT_EVENTS.submitCaption, { meme: bMeme });
      await hostOnBSubmit;

      const hostInStep0 = await waitForRatingStepIndex(host, 0);
      expect(hostInStep0.ratingStep?.total).toBe(2);

      const authorId0 = hostInStep0.ratingStep?.youAreAuthor ? hostPlayerId : bPlayerId;
      expect(hostInStep0.ratingStep?.meme).toBe(memeByPlayerId.get(authorId0));

      // c (never an author) rates step 0 with value 3.
      const cOnRate0 = waitFor<LobbySnapshot>(c, SERVER_EVENTS.state);
      c.emit(CLIENT_EVENTS.submitRating, { stepIndex: 0, value: 3 });
      await cOnRate0;

      const hostInStep1 = await waitForRatingStepIndex(host, 1);
      const authorId1 = hostInStep1.ratingStep?.youAreAuthor ? hostPlayerId : bPlayerId;
      expect(hostInStep1.ratingStep?.meme).toBe(memeByPlayerId.get(authorId1));

      // c rates step 1 with value 1.
      const cOnRate1 = waitFor<LobbySnapshot>(c, SERVER_EVENTS.state);
      c.emit(CLIENT_EVENTS.submitRating, { stepIndex: 1, value: 1 });
      await cOnRate1;

      const hostAtRoundEnd = await waitForPhase(host, "ROUND_END");
      const bAtRoundEnd = await waitForPhase(b, "ROUND_END");

      // SCORE-01 — the exact single rating each meme received, proving the
      // sum is real math, not a placeholder.
      const scoreOf = (snapshot: LobbySnapshot, playerId: string) =>
        snapshot.players.find((p) => p.id === playerId)?.score;

      expect(scoreOf(hostAtRoundEnd, authorId0)).toBe(3);
      expect(scoreOf(hostAtRoundEnd, authorId1)).toBe(1);

      // A second client's own next snapshot reports the identical score for
      // both authors, proving the number is the server's own persisted
      // value, not something computed per-viewer.
      expect(scoreOf(bAtRoundEnd, authorId0)).toBe(3);
      expect(scoreOf(bAtRoundEnd, authorId1)).toBe(1);

      host.close();
      b.close();
      c.close();
    },
    15_000,
  );
});
