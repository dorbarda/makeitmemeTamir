import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  type LobbySnapshot,
  type SessionIssued,
} from "@shared/protocol.js";
import { startTestServer, connectClient, waitFor, type TestServer } from "./setup.js";

/**
 * Real transport, real timers (LIVE-03's own end-to-end proof) — a scripted
 * multi-client game played over real sockets, with a player who leaves
 * partway and never returns. Real sockets rather than fake timers here
 * because socket.io's own ping/pong timers would be faked along with the
 * room's if fake timers were mixed in, exactly as
 * ratingStep.integration.test.ts's own real-socket suite already notes.
 */
describe("a full scripted game over real sockets survives a mid-game disconnect (LIVE-03)", () => {
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

  // Rating-step submissions also broadcast an immediate snapshot with
  // `phase === "RATING"` for the SAME still-open step — a bare
  // `waitForPhase(socket, "RATING")` right after submitting a rating would
  // resolve on that same-step echo instead of the next step actually
  // opening. Waiting for the specific step index is what makes this
  // unambiguous.
  function waitForRatingStep(
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

  it("four clients play a round to GAME_END while one disconnects after round 1 and never returns", async () => {
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

    const d = await connectClient(server.url);
    const sessionD = waitFor<SessionIssued>(d, SERVER_EVENTS.session);
    const stateD1 = waitFor<LobbySnapshot>(d, SERVER_EVENTS.state);
    const stateHost4 = waitFor<LobbySnapshot>(host, SERVER_EVENTS.state);
    const stateB3 = waitFor<LobbySnapshot>(b, SERVER_EVENTS.state);
    const stateC2 = waitFor<LobbySnapshot>(c, SERVER_EVENTS.state);
    d.emit(CLIENT_EVENTS.joinRoom, { roomCode, name: "די" });
    const [dSession] = await Promise.all([sessionD, stateD1, stateHost4, stateB3, stateC2]);
    const dPlayerId = dSession.playerId;

    // Test-only internal seeding so the whole game fits inside the suite's
    // 10-second testTimeout — the protocol path that rejects a non-preset
    // value is already proven in plan 02-02. `rounds` is reduced from the
    // default 3 to 1: D-11's fixed pacing beats (BETWEEN_PHASES_MS /
    // BETWEEN_MEMES_MS) are NOT host-configurable and alone already account
    // for 8s of a round with two rating steps, so a single round is what
    // fits the budget — per this plan's own instruction to reduce the round
    // count rather than raise the timeout.
    const room = server.roomManager.findRoom(roomCode);
    if (!room) throw new Error("room not found for internal seeding");
    room.settings.rounds = 1;
    room.settings.writingSeconds = 0.2;
    room.settings.ratingSeconds = 0.15;

    const hostOnStart = waitFor<LobbySnapshot>(host, SERVER_EVENTS.state);
    const bOnStart = waitFor<LobbySnapshot>(b, SERVER_EVENTS.state);
    const cOnStart = waitFor<LobbySnapshot>(c, SERVER_EVENTS.state);
    const dOnStart = waitFor<LobbySnapshot>(d, SERVER_EVENTS.state);
    host.emit(CLIENT_EVENTS.startGame, {});
    const [hostAfterStart] = await Promise.all([hostOnStart, bOnStart, cOnStart, dOnStart]);
    expect(hostAfterStart.phase).toBe("WRITING");

    // Two clients submit captions — enough to clear MIN_SUBMISSIONS_TO_RATE
    // (a two-step rotation); c and d deliberately never submit (D-08 —
    // skipped from the rotation, still eligible to rate every step).
    const bOnHostSubmit = waitFor<LobbySnapshot>(b, SERVER_EVENTS.state);
    host.emit(CLIENT_EVENTS.submitCaption, { text: "כיתוב של המנחה" });
    await bOnHostSubmit;

    const hostOnBSubmit = waitFor<LobbySnapshot>(host, SERVER_EVENTS.state);
    b.emit(CLIENT_EVENTS.submitCaption, { text: "כיתוב של בי" });
    await hostOnBSubmit;

    const step0 = await waitForRatingStep(host, 0);
    expect(step0.ratingStep?.total).toBe(2);
    // The author of step 0 is whichever of host/b submitted first (rotation
    // is submission-arrival order); the other one rates it — "two clients
    // submit captions ... and rate each other's memes".
    const step0Author = step0.ratingStep?.youAreAuthor ? host : b;
    const step0Rater = step0Author === host ? b : host;

    const step1Waiter = waitForRatingStep(host, 1);
    step0Rater.emit(CLIENT_EVENTS.submitRating, { stepIndex: 0, value: 3 });
    const step1 = await step1Waiter;

    const step1Author = step1.ratingStep?.youAreAuthor ? host : b;
    const step1Rater = step1Author === host ? b : host;
    step1Rater.emit(CLIENT_EVENTS.submitRating, { stepIndex: 1, value: 2 });

    // d disconnects after round 1's rating and never returns — the game
    // must reach GAME_END without it, and without d ever emitting anything
    // again.
    const roundEndOnHost = waitForPhase(host, "ROUND_END");
    const roundEndOnB = waitForPhase(b, "ROUND_END");
    const roundEndOnC = waitForPhase(c, "ROUND_END");
    await Promise.all([roundEndOnHost, roundEndOnB, roundEndOnC]);
    d.close();

    const gameEndOnHost = waitForPhase(host, "GAME_END");
    const gameEndOnB = waitForPhase(b, "GAME_END");
    const gameEndOnC = waitForPhase(c, "GAME_END");
    const [gameEndSnapshot] = await Promise.all([gameEndOnHost, gameEndOnB, gameEndOnC]);

    expect(gameEndSnapshot.phase).toBe("GAME_END");
    expect(gameEndSnapshot.deadlineAt).toBeNull();

    // Phase 1 D-17 — the departed player keeps their roster entry, shown as
    // disconnected, never removed.
    const dEntry = gameEndSnapshot.players.find((p) => p.id === dPlayerId);
    expect(dEntry).toBeDefined();
    expect(dEntry?.connected).toBe(false);

    host.close();
    b.close();
    c.close();
  });
});
