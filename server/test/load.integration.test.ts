import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  type LobbySnapshot,
  type RatingValue,
} from "@shared/protocol.js";
import { startTestServer, connectClient, waitFor, type TestServer } from "./setup.js";
import { fakeMeme } from "./fixtures/meme.js";
import { MIN_PLAYERS_TO_START, DEFAULT_ROUND_COUNT } from "../src/config.js";

// D-03's literal "12+" floor for LIVE-01 — the real capacity proof (Task 2)
// simulates exactly this many concurrently-connected scripted players.
const LOAD_TEST_PLAYER_COUNT = 12;
// Every rater casts the same value so the final score is fully
// deterministic — a single assertion can then prove zero ratings were lost
// or double-counted (score === roundCount * (playerCount - 1) * this value).
const LOAD_TEST_RATING_VALUE: RatingValue = 2;
// A generous ceiling for a same-process, loopback, ephemeral-port round trip
// (client emit -> that same client's own confirming state broadcast).
// WRITING_COLLAPSE_MS/RATING_COLLAPSE_MS/BETWEEN_PHASES_MS/BETWEEN_MEMES_MS
// are the product's own intentional pacing beats and are never counted
// toward this per-submission figure.
const LOAD_TEST_MAX_LATENCY_MS = 500;

// Copied verbatim from fullLoop.integration.test.ts — this codebase's
// established convention is every integration test file defining its own
// local copy rather than importing a shared one.
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
// resolve on that same-step echo instead of the next step actually opening.
// Waiting for the specific step index is what makes this unambiguous.
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

// Genuinely new territory (08-PATTERNS.md's own "No Analog Found" note) — no
// existing test measures a specific client's own confirmation under
// concurrent load. A bare `waitFor` is unsafe here: during a 12-way
// concurrent submission burst, several `state` broadcasts (from OTHER
// players' submissions) can arrive at a given socket before that socket's
// OWN confirming one.
function waitForOwnState(
  socket: Awaited<ReturnType<typeof connectClient>>,
  predicate: (snapshot: LobbySnapshot) => boolean,
): Promise<LobbySnapshot> {
  return new Promise((resolve) => {
    const onState = (snapshot: LobbySnapshot) => {
      if (predicate(snapshot)) {
        socket.off(SERVER_EVENTS.state, onState);
        resolve(snapshot);
      }
    };
    socket.on(SERVER_EVENTS.state, onState);
  });
}

/**
 * Tracer (D-01/D-02) — a minimal MIN_PLAYERS_TO_START-player, 1-round game
 * proving the load test's harness and event sequencing are wired correctly
 * before scaling to the full 12-player scenario. This describe block owns
 * its own dedicated in-process server, never shared with the load-scenario
 * describe block below.
 */
describe("a minimal MIN_PLAYERS_TO_START-player, 1-round game completes end-to-end over real sockets (tracer)", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it(
    "MIN_PLAYERS_TO_START scripted players join, write, rate meme-by-meme, and reach GAME_END",
    async () => {
      const host = await connectClient(server.url);
      const hostState = waitFor<LobbySnapshot>(host, SERVER_EVENTS.state);
      host.emit(CLIENT_EVENTS.createRoom, { name: "מארח" });
      const hostSnapshot = await hostState;
      const roomCode = hostSnapshot.roomCode;

      // Every join broadcasts an updated roster to EVERYONE already in the
      // room, not just the joiner — awaiting only the joiner's own state
      // event leaves a stray LOBBY-phase broadcast un-awaited on the other
      // sockets, which a later `.once()` registration (e.g. before
      // start-game) can then wrongly pick up instead of the real next
      // event. Mirrors fullLoop.integration.test.ts's own join pattern:
      // await every already-connected client's state broadcast alongside
      // the joiner's.
      const playerB = await connectClient(server.url);
      const stateB1 = waitFor<LobbySnapshot>(playerB, SERVER_EVENTS.state);
      const stateHostOnB = waitFor<LobbySnapshot>(host, SERVER_EVENTS.state);
      playerB.emit(CLIENT_EVENTS.joinRoom, { roomCode, name: "שחקן1" });
      await Promise.all([stateB1, stateHostOnB]);

      const playerC = await connectClient(server.url);
      const stateC1 = waitFor<LobbySnapshot>(playerC, SERVER_EVENTS.state);
      const stateHostOnC = waitFor<LobbySnapshot>(host, SERVER_EVENTS.state);
      const stateBOnC = waitFor<LobbySnapshot>(playerB, SERVER_EVENTS.state);
      playerC.emit(CLIENT_EVENTS.joinRoom, { roomCode, name: "שחקן2" });
      await Promise.all([stateC1, stateHostOnC, stateBOnC]);

      const allClients = [host, playerB, playerC];
      expect(allClients).toHaveLength(MIN_PLAYERS_TO_START);

      // Test-only internal seeding of a non-preset value (1 is not in
      // ROUND_COUNT_PRESETS), matching the established technique in
      // fullLoop.integration.test.ts/hostActions.integration.test.ts, used
      // here ONLY to keep this tracer's single round fast.
      // writingSeconds/ratingSeconds are left at their true defaults —
      // every player here submits/rates promptly so the natural collapse
      // always wins well before either real deadline.
      const room = server.roomManager.findRoom(roomCode);
      if (!room) throw new Error("room not found for internal seeding");
      room.settings.rounds = 1;

      const onStartWaiters = allClients.map((c) => waitFor<LobbySnapshot>(c, SERVER_EVENTS.state));
      host.emit(CLIENT_EVENTS.startGame, {});
      const startSnapshots = await Promise.all(onStartWaiters);
      for (const snapshot of startSnapshots) {
        expect(snapshot.phase).toBe("WRITING");
      }

      // All three clients submit a caption sequentially, each followed by
      // an await on the other two clients' next state event — this is the
      // tracer, not the concurrency proof (Task 2 covers concurrency).
      const bAndCOnHostSubmit = [
        waitFor<LobbySnapshot>(playerB, SERVER_EVENTS.state),
        waitFor<LobbySnapshot>(playerC, SERVER_EVENTS.state),
      ];
      host.emit(CLIENT_EVENTS.submitCaption, { meme: fakeMeme("host") });
      await Promise.all(bAndCOnHostSubmit);

      const hostAndCOnBSubmit = [
        waitFor<LobbySnapshot>(host, SERVER_EVENTS.state),
        waitFor<LobbySnapshot>(playerC, SERVER_EVENTS.state),
      ];
      playerB.emit(CLIENT_EVENTS.submitCaption, { meme: fakeMeme("playerB") });
      await Promise.all(hostAndCOnBSubmit);

      const hostAndBOnCSubmit = [
        waitFor<LobbySnapshot>(host, SERVER_EVENTS.state),
        waitFor<LobbySnapshot>(playerB, SERVER_EVENTS.state),
      ];
      playerC.emit(CLIENT_EVENTS.submitCaption, { meme: fakeMeme("playerC") });
      await Promise.all(hostAndBOnCSubmit);

      // Three submitted captions => three rating steps (indices 0-2). For
      // each step, find the author by checking which client's resolved
      // ratingStep payload has youAreAuthor === true, then have the other
      // two (the eligible raters) submit a rating. `currentStepSnapshots`
      // is only ever fetched fresh for step 0 (its own reveal-break
      // broadcast, awaited via waitForRatingStep below); every subsequent
      // step's snapshots come from the PREVIOUS iteration's own
      // `nextStepWaiters` resolution — re-registering a fresh
      // `waitForRatingStep` for a step whose opening broadcast already
      // fired would wait forever for an event that will never fire again.
      let currentStepSnapshots = await Promise.all(
        allClients.map((c) => waitForRatingStep(c, 0)),
      );
      for (let stepIndex = 0; stepIndex < 3; stepIndex++) {
        const authorIdx = currentStepSnapshots.findIndex((s) => s.ratingStep?.youAreAuthor);
        expect(authorIdx).toBeGreaterThanOrEqual(0);
        const raters = allClients.filter((_, idx) => idx !== authorIdx);

        if (stepIndex < 2) {
          const nextStepWaiters = allClients.map((c) => waitForRatingStep(c, stepIndex + 1));
          for (const rater of raters) {
            rater.emit(CLIENT_EVENTS.submitRating, { stepIndex, value: 2 });
          }
          currentStepSnapshots = await Promise.all(nextStepWaiters);
        } else {
          const roundEndWaiters = allClients.map((c) => waitForPhase(c, "ROUND_END"));
          for (const rater of raters) {
            rater.emit(CLIENT_EVENTS.submitRating, { stepIndex, value: 2 });
          }
          await Promise.all(roundEndWaiters);
        }
      }

      // settings.rounds === 1, so finishRound's own BETWEEN_PHASES_MS
      // continuation goes straight to enterGameEnd(), never back to
      // enterWriting.
      const gameEndWaiters = allClients.map((c) => waitForPhase(c, "GAME_END"));
      const gameEndSnapshots = await Promise.all(gameEndWaiters);
      for (const snapshot of gameEndSnapshots) {
        expect(snapshot.phase).toBe("GAME_END");
        expect(snapshot.deadlineAt).toBeNull();
      }

      allClients.forEach((s) => s.close());
    },
    30000,
  );
});

/**
 * The real capacity proof (DEPLOY-04, LIVE-01) — 12 concurrently-connected
 * scripted players complete a full DEFAULT_ROUND_COUNT-round game against
 * the server without crashing, hanging, losing a submission, or requiring a
 * restart. Runs the room's real, unmodified default settings (no
 * writingSeconds/ratingSeconds/rounds seeding anywhere in this task) — the
 * real capacity proof must run the exact game a real host would configure on
 * party night, not a synthetic shortcut. This describe block owns its own
 * dedicated in-process server, never shared with the tracer above.
 */
describe(
  "LOAD_TEST_PLAYER_COUNT concurrently-connected scripted players complete a full DEFAULT_ROUND_COUNT-round game against the server without crashing, hanging, losing a submission, or requiring a restart (DEPLOY-04, LIVE-01)",
  () => {
    let server: TestServer;

    beforeAll(async () => {
      server = await startTestServer();
    });

    afterAll(async () => {
      await server.close();
    });

    it(
      "12 concurrent players complete a full 3-round game with zero lost submissions, sub-500ms latency, and the server stays up for a brand-new room afterward",
      async () => {
        // Step 1: connect the host, create the room.
        const host = await connectClient(server.url);
        const hostState = waitFor<LobbySnapshot>(host, SERVER_EVENTS.state);
        host.emit(CLIENT_EVENTS.createRoom, { name: "מארח" });
        const hostSnapshot = await hostState;
        const roomCode = hostSnapshot.roomCode;

        // Step 2: connect the remaining 11 joiners CONCURRENTLY — the
        // genuine concurrency stress LIVE-01 calls for.
        const joinerSockets = await Promise.all(
          Array.from({ length: LOAD_TEST_PLAYER_COUNT - 1 }, () => connectClient(server.url)),
        );

        // Step 3: all 11 joiners emit join-room CONCURRENTLY. Each
        // waitFor is registered before its emit — safe because it is that
        // fresh socket's FIRST-EVER state event.
        await Promise.all(
          joinerSockets.map((joiner, i) => {
            const state = waitFor<LobbySnapshot>(joiner, SERVER_EVENTS.state);
            joiner.emit(CLIENT_EVENTS.joinRoom, { roomCode, name: `שחקן${i}` });
            return state;
          }),
        );

        const allClients = [host, ...joinerSockets];
        expect(allClients).toHaveLength(LOAD_TEST_PLAYER_COUNT);

        // Step 4: start the game against the room's real, unmodified
        // default settings — no seeding of room.settings anywhere in this
        // task.
        const onStartWaiters = allClients.map((c) =>
          waitFor<LobbySnapshot>(c, SERVER_EVENTS.state),
        );
        host.emit(CLIENT_EVENTS.startGame, {});
        const startSnapshots = await Promise.all(onStartWaiters);
        for (const snapshot of startSnapshots) {
          expect(snapshot.phase).toBe("WRITING");
        }

        const latencies: number[] = [];

        for (let roundIndex = 1; roundIndex <= DEFAULT_ROUND_COUNT; roundIndex++) {
          // 5a: all 12 clients submit a caption CONCURRENTLY, each
          // confirmed via its OWN youSubmitted echo, latency measured.
          await Promise.all(
            allClients.map((client, i) => {
              const t0 = Date.now();
              const confirmed = waitForOwnState(client, (s) => s.youSubmitted === true);
              client.emit(CLIENT_EVENTS.submitCaption, { meme: fakeMeme(`p${i}`) });
              return confirmed.then((snapshot) => {
                latencies.push(Date.now() - t0);
                return snapshot;
              });
            }),
          );

          // 5b: first of three independent no-loss checks for this round —
          // the host's own progress view shows all 12 submitted.
          const resyncWaiter = waitFor<LobbySnapshot>(host, SERVER_EVENTS.state);
          host.emit(CLIENT_EVENTS.requestResync);
          const resyncSnapshot = await resyncWaiter;
          expect(resyncSnapshot.progress?.submitted).toBe(LOAD_TEST_PLAYER_COUNT);
          expect(resyncSnapshot.progress?.total).toBe(LOAD_TEST_PLAYER_COUNT);

          // 5c: 12 submitted captions => 12 rating steps (indices 0-11).
          // For each step, find the author, have the 11 non-author eligible
          // raters submit CONCURRENTLY, latency measured.
          for (let stepIndex = 0; stepIndex < LOAD_TEST_PLAYER_COUNT; stepIndex++) {
            const stepSnapshots = await Promise.all(
              allClients.map((c) => waitForRatingStep(c, stepIndex)),
            );
            const authorIdx = stepSnapshots.findIndex((s) => s.ratingStep?.youAreAuthor);
            expect(authorIdx).toBeGreaterThanOrEqual(0);
            const raters = allClients.filter((_, idx) => idx !== authorIdx);
            expect(raters).toHaveLength(LOAD_TEST_PLAYER_COUNT - 1);

            if (stepIndex < LOAD_TEST_PLAYER_COUNT - 1) {
              const nextStepWaiters = raters.map((rater) => {
                const t0 = Date.now();
                const confirmed = waitForOwnState(
                  rater,
                  (s) => s.ratingStep?.index === stepIndex && s.ratingStep?.youHaveRated === true,
                );
                return confirmed.then((snapshot) => {
                  latencies.push(Date.now() - t0);
                  return snapshot;
                });
              });
              raters.forEach((rater) => {
                rater.emit(CLIENT_EVENTS.submitRating, {
                  stepIndex,
                  value: LOAD_TEST_RATING_VALUE,
                });
              });
              await Promise.all(nextStepWaiters);
            } else {
              // 5d: last of the 12 steps — instead of the next
              // waitForRatingStep, await ROUND_END. Second and third
              // independent no-loss checks for this round.
              const roundEndWaiters = allClients.map((c) => waitForPhase(c, "ROUND_END"));
              const ratingLatencyWaiters = raters.map((rater) => {
                const t0 = Date.now();
                const confirmed = waitForOwnState(
                  rater,
                  (s) => s.ratingStep?.index === stepIndex && s.ratingStep?.youHaveRated === true,
                );
                return confirmed.then((snapshot) => {
                  latencies.push(Date.now() - t0);
                  return snapshot;
                });
              });
              raters.forEach((rater) => {
                rater.emit(CLIENT_EVENTS.submitRating, {
                  stepIndex,
                  value: LOAD_TEST_RATING_VALUE,
                });
              });
              await Promise.all(ratingLatencyWaiters);
              const [roundEndSnapshot] = await Promise.all(roundEndWaiters);

              expect(roundEndSnapshot.roundEnd?.entries.length).toBe(LOAD_TEST_PLAYER_COUNT);
              for (const entry of roundEndSnapshot.roundEnd?.entries ?? []) {
                expect(entry.ratings.length).toBe(LOAD_TEST_PLAYER_COUNT - 1);
                expect(entry.eligibleAtClose).toBe(LOAD_TEST_PLAYER_COUNT - 1);
                expect(entry.score).toBe((LOAD_TEST_PLAYER_COUNT - 1) * LOAD_TEST_RATING_VALUE);
              }
            }
          }

          // 5e: not the last round — wait for the next round's WRITING to
          // open (the BETWEEN_PHASES_MS continuation finishRound already
          // schedules) before the loop's next iteration.
          if (roundIndex < DEFAULT_ROUND_COUNT) {
            const nextWritingWaiters = allClients.map((c) => waitForPhase(c, "WRITING"));
            await Promise.all(nextWritingWaiters);
          }
        }

        // Step 6: after the loop, every client reaches GAME_END.
        const gameEndWaiters = allClients.map((c) => waitForPhase(c, "GAME_END"));
        const gameEndSnapshots = await Promise.all(gameEndWaiters);
        for (const snapshot of gameEndSnapshots) {
          expect(snapshot.deadlineAt).toBeNull();
        }
        const gameEndSnapshot = gameEndSnapshots[0]!;
        expect(gameEndSnapshot.gameEnd?.winners.length).toBe(LOAD_TEST_PLAYER_COUNT);

        // Derived from the same three constants so a future config change
        // cannot silently desync the assertion.
        const expectedScorePerPlayer =
          DEFAULT_ROUND_COUNT * (LOAD_TEST_PLAYER_COUNT - 1) * LOAD_TEST_RATING_VALUE;
        for (const player of gameEndSnapshot.players) {
          expect(player.score).toBe(expectedScorePerPlayer);
        }

        // Step 7: single latency-threshold assertion covering all
        // caption-submission and rating-submission round trips collected
        // across the whole round loop.
        expect(Math.max(...latencies)).toBeLessThan(LOAD_TEST_MAX_LATENCY_MS);

        // Step 8: close all 12 sockets, then prove the exact same server
        // process is still fully responsive — a brand-new room, no restart
        // needed.
        allClients.forEach((s) => s.close());

        const sanityClient = await connectClient(server.url);
        const sanityState = waitFor<LobbySnapshot>(sanityClient, SERVER_EVENTS.state);
        sanityClient.emit(CLIENT_EVENTS.createRoom, { name: "בדיקת שפיות" });
        const sanitySnapshot = await sanityState;
        expect(sanitySnapshot.phase).toBe("LOBBY");
        expect(sanitySnapshot.roomCode).not.toBe(roomCode);

        sanityClient.close();
      },
      300000,
    );
  },
);
