import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  type LobbySnapshot,
  type ProtocolError,
} from "@shared/protocol.js";
import { startTestServer, connectClient, waitFor, type TestServer } from "./setup.js";
import { PHOTO_FILENAMES } from "../src/rooms/photos.js";

/**
 * The tracer's own real-socket proof for ROUND-06/D-01/D-02 (the one-time
 * instant photo swap, locked on submit) and VOTE-06 (round results ranked by
 * real point total). Real transport, real timers — follows
 * realContent.integration.test.ts's waitForPhase/waitForRatingStepIndex
 * helpers and test-only internal seeding style (reading `room.rotation`
 * directly to identify each step's author, the same discipline
 * realContent.integration.test.ts uses for `room.photoAssignments`).
 */
describe("photo swap end to end — instant, one-time, locks on submit, and real ranked round results (ROUND-06, D-01, D-02, VOTE-06)", () => {
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

  function waitForPhaseChange(
    socket: Awaited<ReturnType<typeof connectClient>>,
    notPhase: LobbySnapshot["phase"],
  ): Promise<LobbySnapshot> {
    return new Promise((resolve) => {
      const onState = (snapshot: LobbySnapshot) => {
        if (snapshot.phase !== notPhase) {
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
    "swaps instantly, locks after one use, refuses once WRITING closes, and ranks round results by real distinguishable scores",
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

      // Test-only internal seeding so writing stays open long enough for the
      // swap round trips below, without waiting on the default 60s preset —
      // the protocol path rejecting a non-preset value is already proven in
      // plan 02-02.
      const room = server.roomManager.findRoom(roomCode);
      if (!room) throw new Error("room not found for internal seeding");
      room.settings.writingSeconds = 3;

      const hostOnStart = waitFor<LobbySnapshot>(host, SERVER_EVENTS.state);
      const bOnStart = waitFor<LobbySnapshot>(b, SERVER_EVENTS.state);
      const cOnStart = waitFor<LobbySnapshot>(c, SERVER_EVENTS.state);
      host.emit(CLIENT_EVENTS.startGame, {});
      const [hostAfterStart, bAfterStart, cAfterStart] = await Promise.all([
        hostOnStart,
        bOnStart,
        cOnStart,
      ]);
      expect(hostAfterStart.phase).toBe("WRITING");
      const hostPlayerId = hostAfterStart.you.id;
      const bPlayerId = bAfterStart.you.id;
      const cPlayerId = cAfterStart.you.id;
      const socketByPlayerId: Record<string, Awaited<ReturnType<typeof connectClient>>> = {
        [hostPlayerId]: host,
        [bPlayerId]: b,
        [cPlayerId]: c,
      };
      const preSwapPhotoUrl = hostAfterStart.yourPhotoUrl;
      expect(preSwapPhotoUrl).not.toBeNull();

      // (1) + (2) — swap once: instant replacement, a real distinct pool
      // member, and youCanSwapPhoto flips false afterward.
      const hostOnSwap = waitFor<LobbySnapshot>(host, SERVER_EVENTS.state);
      host.emit(CLIENT_EVENTS.swapPhoto, {});
      const hostAfterSwap = await hostOnSwap;
      expect(hostAfterSwap.yourPhotoUrl).toMatch(/^\/tamir-photos\//);
      expect(PHOTO_FILENAMES).toContain(hostAfterSwap.yourPhotoUrl!.replace("/tamir-photos/", ""));
      expect(hostAfterSwap.yourPhotoUrl).not.toBe(preSwapPhotoUrl);
      expect(hostAfterSwap.youCanSwapPhoto).toBe(false);

      // (3) — a second swap in the same round is refused.
      const hostSwapAgainError = waitFor<ProtocolError>(host, SERVER_EVENTS.error);
      host.emit(CLIENT_EVENTS.swapPhoto, {});
      expect((await hostSwapAgainError).code).toBe("SWAP_ALREADY_USED");

      // (4) — host and b submit captions; c never submits (clears
      // MIN_SUBMISSIONS_TO_RATE with exactly two submitters).
      const bOnHostSubmit = waitFor<LobbySnapshot>(b, SERVER_EVENTS.state);
      host.emit(CLIENT_EVENTS.submitCaption, { text: "כיתוב של המנחה" });
      await bOnHostSubmit;

      const hostOnBSubmit = waitFor<LobbySnapshot>(host, SERVER_EVENTS.state);
      b.emit(CLIENT_EVENTS.submitCaption, { text: "כיתוב של בי" });
      await hostOnBSubmit;

      // Writing does not collapse early (c never submits) — wait for it to
      // close naturally on its own deadline.
      await waitForPhaseChange(host, "WRITING");

      // (8) — once WRITING has closed, c's swap attempt (c never submitted a
      // caption and has no photo left to swap) is refused with WRONG_PHASE,
      // proving the swap window is bounded to WRITING.
      const cSwapAfterWritingError = waitFor<ProtocolError>(c, SERVER_EVENTS.error);
      c.emit(CLIENT_EVENTS.swapPhoto, {});
      expect((await cSwapAfterWritingError).code).toBe("WRONG_PHASE");

      // room.rotation is built synchronously the instant writing closes —
      // read it directly to identify each step's author deterministically,
      // rather than branching on youAreAuthor for an unknown submission
      // order.
      const author0Id = room.rotation[0];
      const author1Id = room.rotation[1];
      const allPlayerIds = [hostPlayerId, bPlayerId, cPlayerId];

      // (5) — step 0 opens; every eligible non-author player rates it 3.
      await waitForRatingStepIndex(host, 0);
      const step1Opens = waitForRatingStepIndex(host, 1);
      for (const raterId of allPlayerIds.filter((id) => id !== author0Id)) {
        socketByPlayerId[raterId].emit(CLIENT_EVENTS.submitRating, { stepIndex: 0, value: 3 });
      }
      await step1Opens;

      // (6) — step 1 opens; every eligible non-author player rates it with a
      // DIFFERENT value, 1.
      const roundEndReached = waitForPhase(host, "ROUND_END");
      for (const raterId of allPlayerIds.filter((id) => id !== author1Id)) {
        socketByPlayerId[raterId].emit(CLIENT_EVENTS.submitRating, { stepIndex: 1, value: 1 });
      }

      // (7) — round results rank memes by real, distinguishable scores: the
      // step-0 author's meme (rated 3 by both eligible raters, total 6)
      // outranks the step-1 author's meme (rated 1 by both eligible raters,
      // total 2) — real math, not incidental array order.
      const hostAtRoundEnd = await roundEndReached;
      const entries = hostAtRoundEnd.roundEnd!.entries;
      const rankedEntries = [...entries].sort((entryA, entryB) => entryB.score - entryA.score);

      expect(rankedEntries).toHaveLength(2);
      expect(rankedEntries[0].authorId).toBe(author0Id);
      expect(rankedEntries[0].score).toBe(6);
      expect(rankedEntries[1].authorId).toBe(author1Id);
      expect(rankedEntries[1].score).toBe(2);
      expect(rankedEntries[0].score).toBeGreaterThan(rankedEntries[1].score);

      host.close();
      b.close();
      c.close();
    },
    20_000,
  );
});
