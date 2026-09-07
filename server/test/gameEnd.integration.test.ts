import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { CLIENT_EVENTS, SERVER_EVENTS, type LobbySnapshot } from "@shared/protocol.js";
import { startTestServer, connectClient, waitFor, type TestServer } from "./setup.js";
import { fakeMeme } from "./fixtures/meme.js";

/**
 * Real transport, real timers — the end-to-end proof (SCORE-04/D-03,
 * MEME-02/D-04) that a real played-out game's winner(s) and best-of-the-night
 * both reach the client with real content, not a shape check. Mirrors
 * fullLoop.integration.test.ts's own harness and its single-rater-per-step
 * pattern: a step closes on its own deadline rather than an early collapse
 * whenever fewer than every eligible rater actually votes, which is exactly
 * what makes each step's real score land on a known, specific value (3 and 1
 * respectively) instead of the sum of every eligible rater's vote.
 */
describe("a real game's winner(s) and best-of-the-night reach the client at GAME_END (SCORE-04, MEME-02)", () => {
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
  // unambiguous (matches fullLoop.integration.test.ts's own helper).
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

  it("winners lists the sole highest scorer and bestOfNight carries both this game's real memes, ranked by real score", async () => {
    const host = await connectClient(server.url);
    const stateHost1 = waitFor<LobbySnapshot>(host, SERVER_EVENTS.state);
    host.emit(CLIENT_EVENTS.createRoom, { name: "מנחה" });
    const hostSnapshot = await stateHost1;
    const roomCode = hostSnapshot.roomCode;
    const hostPlayerId = hostSnapshot.you.id;

    const b = await connectClient(server.url);
    const stateB1 = waitFor<LobbySnapshot>(b, SERVER_EVENTS.state);
    const stateHost2 = waitFor<LobbySnapshot>(host, SERVER_EVENTS.state);
    b.emit(CLIENT_EVENTS.joinRoom, { roomCode, name: "בי" });
    const [bSnapshot] = await Promise.all([stateB1, stateHost2]);
    const bPlayerId = bSnapshot.you.id;

    const c = await connectClient(server.url);
    const stateC1 = waitFor<LobbySnapshot>(c, SERVER_EVENTS.state);
    const stateHost3 = waitFor<LobbySnapshot>(host, SERVER_EVENTS.state);
    const stateB2 = waitFor<LobbySnapshot>(b, SERVER_EVENTS.state);
    c.emit(CLIENT_EVENTS.joinRoom, { roomCode, name: "גי" });
    await Promise.all([stateC1, stateHost3, stateB2]);

    // Test-only internal seeding, matching fullLoop.integration.test.ts's own
    // budget reasoning — a single round with two rating steps already
    // accounts for several seconds of D-11's fixed pacing beats, so `rounds`
    // is reduced to 1 and both durations kept small but real.
    const room = server.roomManager.findRoom(roomCode);
    if (!room) throw new Error("room not found for internal seeding");
    room.settings.rounds = 1;
    room.settings.writingSeconds = 0.2;
    room.settings.ratingSeconds = 0.15;

    const hostOnStart = waitFor<LobbySnapshot>(host, SERVER_EVENTS.state);
    const bOnStart = waitFor<LobbySnapshot>(b, SERVER_EVENTS.state);
    const cOnStart = waitFor<LobbySnapshot>(c, SERVER_EVENTS.state);
    host.emit(CLIENT_EVENTS.startGame, {});
    const [hostAfterStart] = await Promise.all([hostOnStart, bOnStart, cOnStart]);
    expect(hostAfterStart.phase).toBe("WRITING");

    // Host and b submit distinct memes; c never submits — clears
    // MIN_SUBMISSIONS_TO_RATE (2) with exactly 2 submitters (D-08).
    const hostMeme = fakeMeme("host");
    const bMeme = fakeMeme("b");
    const memeByPlayerId = new Map<string, string>([
      [hostPlayerId, hostMeme],
      [bPlayerId, bMeme],
    ]);

    const bOnHostSubmit = waitFor<LobbySnapshot>(b, SERVER_EVENTS.state);
    host.emit(CLIENT_EVENTS.submitCaption, { meme: hostMeme });
    await bOnHostSubmit;

    const hostOnBSubmit = waitFor<LobbySnapshot>(host, SERVER_EVENTS.state);
    b.emit(CLIENT_EVENTS.submitCaption, { meme: bMeme });
    await hostOnBSubmit;

    // Step 0: identify its real author id from host's own `youAreAuthor`
    // flag (host or b is definitely the author, since only they submitted).
    // `meme` in ratingStep is the same for every viewer (the current meme is
    // shown to everyone), so host's own snapshot already carries the real
    // value with no need to query b's own perspective.
    const step0 = await waitForRatingStep(host, 0);
    expect(step0.ratingStep?.total).toBe(2);
    const step0AuthorId = step0.ratingStep?.youAreAuthor ? hostPlayerId : bPlayerId;
    const step0Rater = step0.ratingStep?.youAreAuthor ? b : host;
    const step0Meme = memeByPlayerId.get(step0AuthorId);

    // Only ONE eligible rater actually votes for each step (the other
    // eligible rater, c, never votes) — exactly like fullLoop's own pattern
    // — so each step's real score lands on this single cast value, and the
    // step closes on its own deadline rather than an early collapse.
    const step1Waiter = waitForRatingStep(host, 1);
    step0Rater.emit(CLIENT_EVENTS.submitRating, { stepIndex: 0, value: 3 });
    const step1 = await step1Waiter;

    const step1AuthorId = step1.ratingStep?.youAreAuthor ? hostPlayerId : bPlayerId;
    const step1Rater = step1.ratingStep?.youAreAuthor ? b : host;
    const step1Meme = memeByPlayerId.get(step1AuthorId);

    step1Rater.emit(CLIENT_EVENTS.submitRating, { stepIndex: 1, value: 1 });

    const gameEndOnHost = waitForPhase(host, "GAME_END");
    const gameEndOnB = waitForPhase(b, "GAME_END");
    const gameEndOnC = waitForPhase(c, "GAME_END");
    const [gameEndSnapshot] = await Promise.all([gameEndOnHost, gameEndOnB, gameEndOnC]);

    expect(gameEndSnapshot.phase).toBe("GAME_END");
    const gameEnd = gameEndSnapshot.gameEnd;
    expect(gameEnd).not.toBeNull();

    // step0's author scored exactly 3 (a single rating of value 3);
    // step1's author scored exactly 1 (a single rating of value 1); c never
    // submitted a caption, never entered the rotation, and scores 0 — so
    // exactly one winner (D-03), never a tiebreaker.
    expect(gameEnd!.winners).toHaveLength(1);
    expect(gameEnd!.winners[0].id).toBe(step0AuthorId);
    expect(gameEnd!.winners[0].score).toBe(3);

    const step0AuthorName = gameEndSnapshot.players.find((p) => p.id === step0AuthorId)?.name;
    const step1AuthorName = gameEndSnapshot.players.find((p) => p.id === step1AuthorId)?.name;

    // bestOfNight has exactly the 2 memes played this one-round game, sorted
    // with the score-3 meme first, with real photo/caption/author/score
    // content matching what was actually submitted and rated above.
    expect(gameEnd!.bestOfNight).toHaveLength(2);
    expect(gameEnd!.bestOfNight[0]).toMatchObject({
      authorId: step0AuthorId,
      authorName: step0AuthorName,
      meme: step0Meme,
      score: 3,
    });
    expect(gameEnd!.bestOfNight[1]).toMatchObject({
      authorId: step1AuthorId,
      authorName: step1AuthorName,
      meme: step1Meme,
      score: 1,
    });

    host.close();
    b.close();
    c.close();
  });
});
