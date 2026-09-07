import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { CLIENT_EVENTS, SERVER_EVENTS, type LobbySnapshot } from "@shared/protocol.js";
import { startTestServer, connectClient, waitFor, type TestServer } from "./setup.js";
import { fakeMeme } from "./fixtures/meme.js";

// Real transport, real timers throughout — socket.io's own ping timers would
// be faked along with the room's if fake timers were mixed in here (the same
// reasoning captionPrivacy.integration.test.ts documents for its own
// describe block). Proves VOTE-05's hidden-until-close guarantee
// structurally (no individual rating value or per-rater identity ever
// reaches the wire while a step is open, and the real total is revealed only
// once it closes) and confirms VOTE-03's existing author-exclusion behavior
// is unbroken by this plan's changes.
describe("rating privacy — individual ratings hidden until close (VOTE-05), author still excluded (VOTE-03)", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

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

  // The exact nine-key whitelist RatingStepView has always carried — no
  // per-rater map, no individual rating value, ever.
  const RATING_STEP_KEYS = [
    "eligibleCount",
    "index",
    "meme",
    "ratedCount",
    "total",
    "youAreAuthor",
    "youHaveRated",
    "youMayRate",
  ].sort();

  it(
    "carries only the nine documented ratingStep keys throughout, hides roundEnd until close, and reveals the exact real score once closed",
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

      // Test-only internal seeding — the protocol path rejecting a
      // non-preset value is already proven in plan 02-02.
      const room = server.roomManager.findRoom(roomCode);
      if (!room) throw new Error("room not found for internal seeding");
      room.settings.writingSeconds = 3;
      room.settings.ratingSeconds = 3;

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

      // Host and b submit distinct captions; c never submits.
      const bOnHostSubmit = waitFor<LobbySnapshot>(b, SERVER_EVENTS.state);
      host.emit(CLIENT_EVENTS.submitCaption, { meme: fakeMeme("host") });
      await bOnHostSubmit;

      const hostOnBSubmit = waitFor<LobbySnapshot>(host, SERVER_EVENTS.state);
      b.emit(CLIENT_EVENTS.submitCaption, { meme: fakeMeme("b") });
      await hostOnBSubmit;

      // Reach step 0 — capture every player's own snapshot at the exact
      // moment it opens.
      const hostInStep0 = waitForRatingStepIndex(host, 0);
      const bInStep0 = waitForRatingStepIndex(b, 0);
      const cInStep0 = waitForRatingStepIndex(c, 0);
      const [hostSnapshotAtOpen, bSnapshotAtOpen, cSnapshotAtOpen] = await Promise.all([
        hostInStep0,
        bInStep0,
        cInStep0,
      ]);

      // VOTE-05 structural proof, part 1: from every player's own snapshot
      // at open — author's and non-authors' alike — ratingStep carries
      // exactly the nine documented keys, nothing more.
      for (const snapshot of [hostSnapshotAtOpen, bSnapshotAtOpen, cSnapshotAtOpen]) {
        expect(Object.keys(snapshot.ratingStep!).sort()).toEqual(RATING_STEP_KEYS);
      }

      // room.rotation is built synchronously the instant writing closes —
      // read it directly to identify step 0's author deterministically.
      const authorId = room.rotation[0];
      const nonAuthorIds = [hostPlayerId, bPlayerId, cPlayerId].filter((id) => id !== authorId);
      const [raterId, neutralId] = nonAuthorIds;

      // VOTE-03 regression smoke-check (do not rebuild — CANNOT_RATE_OWN is
      // already fully proven in ratingStep.integration.test.ts): the
      // author's own snapshot still shows the existing waiting-state
      // contract.
      const authorSnapshotAtOpen = [hostSnapshotAtOpen, bSnapshotAtOpen, cSnapshotAtOpen].find(
        (snapshot) => snapshot.you.id === authorId,
      )!;
      expect(authorSnapshotAtOpen.ratingStep?.youAreAuthor).toBe(true);
      expect(authorSnapshotAtOpen.ratingStep?.youMayRate).toBe(false);

      // Only ONE of the two eligible raters casts a rating (a known value,
      // 2) — deliberately not the other, so the step does not collapse
      // early and stays open for the "while still open" check below.
      const neutralSocket = socketByPlayerId[neutralId];
      const neutralOnRate = waitFor<LobbySnapshot>(neutralSocket, SERVER_EVENTS.state);
      socketByPlayerId[raterId].emit(CLIENT_EVENTS.submitRating, { stepIndex: 0, value: 2 });
      const neutralSnapshotAfterRate = await neutralOnRate;

      // VOTE-05 structural proof, part 2: a snapshot taken from a player who
      // is NEITHER the author NOR the one who just rated, while the step is
      // still open — roundEnd stays null and ratingStep's shape is still
      // exactly the same nine keys (no new field appeared once a rating was
      // cast).
      expect(neutralSnapshotAfterRate.roundEnd).toBeNull();
      expect(Object.keys(neutralSnapshotAfterRate.ratingStep!).sort()).toEqual(RATING_STEP_KEYS);

      // Let step 0's own deadline expire naturally (never collapses since
      // the neutral player never rated) and walk through the rest of the
      // round to ROUND_END.
      const hostAtRoundEnd = await waitForPhase(host, "ROUND_END");

      // VOTE-05, "revealed only once closed" half: the real score for step
      // 0's meme equals exactly the one known value that was cast — not a
      // placeholder, not a count.
      expect(hostAtRoundEnd.roundEnd?.entries[0]?.score).toBe(2);

      host.close();
      b.close();
      c.close();
    },
    25_000,
  );
});
