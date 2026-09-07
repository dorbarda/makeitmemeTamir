import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from "vitest";
import { Room } from "../src/rooms/Room.js";
import { BETWEEN_MEMES_MS, BETWEEN_PHASES_MS, RATING_COLLAPSE_MS } from "../src/config.js";
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  type LobbySnapshot,
  type ProtocolError,
} from "@shared/protocol.js";
import { startTestServer, connectClient, waitFor, type TestServer } from "./setup.js";
import { fakeMeme } from "./fixtures/meme.js";

// Bare-Room + vi.useFakeTimers(), following the rosterFade/writingPhase
// harness style: construct in beforeEach, room.dispose() + real timers in
// afterEach. Proves the per-step clock properties this plan hangs on: every
// step closes on its own deadline whether or not anyone rated it (VOTE-04),
// a collapse can only ever move a deadline earlier (D-07), the rotation
// never re-derives mid-round, and a step advances exactly once even at the
// exact adjacency boundary.
describe("rating step clock — closes on time, collapses only earlier, advances exactly once (VOTE-04, D-07, D-10)", () => {
  let room: Room;

  beforeEach(() => {
    vi.useFakeTimers();
    room = new Room("1234", "http://x/join/1234", "data:image/png;base64,");
  });

  afterEach(() => {
    room.dispose();
    vi.useRealTimers();
  });

  function startWithPlayers(count: number) {
    const players = Array.from({ length: count }, (_, i) => room.addPlayer(`P${i}`, `t-${i}`));
    const result = room.startGame(players[0].id);
    expect(result.ok).toBe(true);
    return players;
  }

  /**
   * Five players, three submissions (players[0..2]) — players[3] and
   * players[4] never submit, so they are skipped from the rotation (D-08)
   * but remain eligible raters for every step. Advances through the writing
   * deadline and the first REVEAL_BREAK to land exactly on rating step 0.
   */
  function reachStep0() {
    const players = startWithPlayers(5);
    room.submitCaption(players[0].id, fakeMeme("p0"));
    room.submitCaption(players[1].id, fakeMeme("p1"));
    room.submitCaption(players[2].id, fakeMeme("p2"));

    vi.advanceTimersByTime(room.settings.writingSeconds * 1000);
    expect(room.phase).toBe("REVEAL_BREAK");
    expect(room.stepIndex).toBe(0);

    vi.advanceTimersByTime(BETWEEN_PHASES_MS);
    expect(room.phase).toBe("RATING");
    expect(room.stepIndex).toBe(0);

    return players;
  }

  it("writing closes into REVEAL_BREAK for exactly BETWEEN_PHASES_MS, then RATING at step 0 of 3", () => {
    const players = startWithPlayers(5);
    room.submitCaption(players[0].id, fakeMeme("a"));
    room.submitCaption(players[1].id, fakeMeme("b"));
    room.submitCaption(players[2].id, fakeMeme("c"));

    vi.advanceTimersByTime(room.settings.writingSeconds * 1000);
    expect(room.phase).toBe("REVEAL_BREAK");

    vi.advanceTimersByTime(BETWEEN_PHASES_MS - 1);
    expect(room.phase).toBe("REVEAL_BREAK");

    vi.advanceTimersByTime(1);
    expect(room.phase).toBe("RATING");
    const snapshot = room.snapshotFor(players[0].id).ratingStep;
    expect(snapshot?.index).toBe(0);
    expect(snapshot?.total).toBe(3);
  });

  it("with nobody rating, step 0 still closes exactly at its deadline and the room spends exactly BETWEEN_MEMES_MS in REVEAL_BREAK before step 1", () => {
    reachStep0();
    const ratingDeadlineMs = room.settings.ratingSeconds * 1000;

    vi.advanceTimersByTime(ratingDeadlineMs - 1);
    expect(room.phase).toBe("RATING");
    expect(room.stepIndex).toBe(0);

    vi.advanceTimersByTime(1);
    expect(room.phase).toBe("REVEAL_BREAK");
    expect(room.stepIndex).toBe(1);

    vi.advanceTimersByTime(BETWEEN_MEMES_MS - 1);
    expect(room.phase).toBe("REVEAL_BREAK");
    vi.advanceTimersByTime(1);
    expect(room.phase).toBe("RATING");
    expect(room.stepIndex).toBe(1);
  });

  it("after the last step closes, the room enters ROUND_END", () => {
    reachStep0();
    const ratingDeadlineMs = room.settings.ratingSeconds * 1000;

    // Step 0 -> step 1
    vi.advanceTimersByTime(ratingDeadlineMs);
    vi.advanceTimersByTime(BETWEEN_MEMES_MS);
    expect(room.phase).toBe("RATING");
    expect(room.stepIndex).toBe(1);

    // Step 1 -> step 2 (last step, rotation length 3)
    vi.advanceTimersByTime(ratingDeadlineMs);
    vi.advanceTimersByTime(BETWEEN_MEMES_MS);
    expect(room.phase).toBe("RATING");
    expect(room.stepIndex).toBe(2);

    // Step 2 closes — no more steps remain.
    vi.advanceTimersByTime(ratingDeadlineMs);
    expect(room.phase).toBe("ROUND_END");
  });

  it("collapses the deadline to exactly now + RATING_COLLAPSE_MS when every eligible rater has rated with 6s left on step 0", () => {
    const players = reachStep0();
    const ratingDeadlineMs = room.settings.ratingSeconds * 1000;
    // Leave exactly 6s on the clock before the last eligible rating.
    vi.advanceTimersByTime(ratingDeadlineMs - 6_000);

    // Author is players[0] (rotation[0], the first submitter) — eligible
    // raters are every other connected player: players[1..4].
    room.submitRating(players[1].id, 0, 2);
    room.submitRating(players[2].id, 0, 3);
    room.submitRating(players[3].id, 0, 1);
    expect(room.phase).toBe("RATING");

    const now = Date.now();
    room.submitRating(players[4].id, 0, 2);
    expect(room.deadlineAt).toBe(now + RATING_COLLAPSE_MS);
    expect(room.phase).toBe("RATING");

    vi.advanceTimersByTime(RATING_COLLAPSE_MS - 1);
    expect(room.phase).toBe("RATING");
    vi.advanceTimersByTime(1);
    expect(room.phase).toBe("REVEAL_BREAK");
  });

  it("never extends: deadlineAt is exactly unchanged when every eligible rater has rated step 0 with only 800ms left", () => {
    const players = reachStep0();
    const ratingDeadlineMs = room.settings.ratingSeconds * 1000;
    vi.advanceTimersByTime(ratingDeadlineMs - 800);

    room.submitRating(players[1].id, 0, 2);
    room.submitRating(players[2].id, 0, 3);
    room.submitRating(players[3].id, 0, 1);

    const deadlineBefore = room.deadlineAt;
    room.submitRating(players[4].id, 0, 2);
    // An equality assertion, not an inequality — a one-millisecond extension
    // would fail this.
    expect(room.deadlineAt).toBe(deadlineBefore);

    vi.advanceTimersByTime(799);
    expect(room.phase).toBe("RATING");
    vi.advanceTimersByTime(1);
    expect(room.phase).toBe("REVEAL_BREAK");
  });

  it("advances exactly one step — never two, never re-opened — when the last eligible rating lands the same instant the deadline would fire", () => {
    const players = reachStep0();
    const ratingDeadlineMs = room.settings.ratingSeconds * 1000;

    // The closest a single-threaded engine can get to "the last rating
    // arrives at the same moment the deadline would fire": leave exactly
    // 1ms of the original deadline, have every eligible rater rate right
    // there (a collapse candidate of now + RATING_COLLAPSE_MS is nowhere
    // near earlier than the 1ms-away deadline, so collapseDeadline refuses
    // and changes nothing — the ORIGINAL timer is what fires next).
    vi.advanceTimersByTime(ratingDeadlineMs - 1);
    room.submitRating(players[1].id, 0, 2);
    room.submitRating(players[2].id, 0, 3);
    room.submitRating(players[3].id, 0, 1);
    room.submitRating(players[4].id, 0, 2);
    expect(room.phase).toBe("RATING");
    expect(room.stepIndex).toBe(0);

    vi.advanceTimersByTime(1);
    // closeRatingStep's own `phase === "RATING"` guard is what makes this
    // land on step 1 exactly once, never step 2 and never a re-opened step 0.
    expect(room.phase).toBe("REVEAL_BREAK");
    expect(room.stepIndex).toBe(1);
    expect(room.ratings.get(0)?.size).toBe(4);
    expect(room.eligibleAtClose.get(0)).toBe(4);
  });

  it("a step that closes with two of four eligible raters having rated stores exactly two rating values and an eligibleAtClose of 4 — no value is invented for the silent raters", () => {
    const players = reachStep0();
    room.submitRating(players[1].id, 0, 3);
    room.submitRating(players[2].id, 0, 1);
    // players[3] and players[4] never rate.

    vi.advanceTimersByTime(room.settings.ratingSeconds * 1000);
    expect(room.phase).toBe("REVEAL_BREAK");
    expect(room.ratings.get(0)?.size).toBe(2);
    expect(room.eligibleAtClose.get(0)).toBe(4);
  });

  it("submitRating refuses CANNOT_RATE_OWN for the current step's author", () => {
    const players = reachStep0();
    const authorId = room.rotation[room.stepIndex];
    expect(room.submitRating(authorId, room.stepIndex, 3)).toEqual({
      ok: false,
      error: "CANNOT_RATE_OWN",
    });
  });

  it("submitRating refuses RATING_OUT_OF_RANGE for 0, 4, and a non-integer value", () => {
    const players = reachStep0();
    const rater = players[1].id;
    expect(room.submitRating(rater, room.stepIndex, 0)).toEqual({
      ok: false,
      error: "RATING_OUT_OF_RANGE",
    });
    expect(room.submitRating(rater, room.stepIndex, 4)).toEqual({
      ok: false,
      error: "RATING_OUT_OF_RANGE",
    });
    expect(room.submitRating(rater, room.stepIndex, 1.5)).toEqual({
      ok: false,
      error: "RATING_OUT_OF_RANGE",
    });
  });

  it("submitRating refuses WRONG_PHASE for a stepIndex that is not the room's current step", () => {
    const players = reachStep0();
    const rater = players[1].id;
    expect(room.submitRating(rater, room.stepIndex - 1, 2)).toEqual({
      ok: false,
      error: "WRONG_PHASE",
    });
  });

  it("submitRating refuses ALREADY_RATED on a second attempt from the same rater and never changes the stored value", () => {
    const players = reachStep0();
    const rater = players[1].id;
    expect(room.submitRating(rater, room.stepIndex, 2).ok).toBe(true);
    expect(room.submitRating(rater, room.stepIndex, 3)).toEqual({
      ok: false,
      error: "ALREADY_RATED",
    });
    expect(room.ratings.get(room.stepIndex)?.get(rater)).toBe(2);
  });
});

// Real transport, real timers — socket.io's own ping timers would be faked
// along with the room's if fake timers were mixed in here. Proves the four
// refusal codes end to end over the real handler round-trip.
describe("submit-rating refusals over real sockets (T-02-05, T-02-06, T-02-16)", () => {
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

  it("reaches step 0 of RATING and refuses CANNOT_RATE_OWN, RATING_OUT_OF_RANGE, ALREADY_RATED and WRONG_PHASE", async () => {
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

    // Test-only internal seeding so the round reaches a rating step quickly —
    // the protocol path that rejects a non-preset value is already proven in
    // plan 02-02.
    const room = server.roomManager.findRoom(roomCode);
    if (!room) throw new Error("room not found for internal seeding");
    room.settings.writingSeconds = 1;
    // A little more headroom than the writing phase's 1s: this test drives
    // four sequential round-trips (three refusals plus one real rating)
    // inside a single rating step before it may collapse or expire.
    room.settings.ratingSeconds = 4;

    const hostOnStart = waitFor<LobbySnapshot>(host, SERVER_EVENTS.state);
    const bOnStart = waitFor<LobbySnapshot>(b, SERVER_EVENTS.state);
    const cOnStart = waitFor<LobbySnapshot>(c, SERVER_EVENTS.state);
    host.emit(CLIENT_EVENTS.startGame, {});
    const [hostAfterStart] = await Promise.all([hostOnStart, bOnStart, cOnStart]);
    expect(hostAfterStart.phase).toBe("WRITING");

    // Two submissions (host, b) is enough to clear MIN_SUBMISSIONS_TO_RATE;
    // c deliberately never submits (D-08 — skipped from the rotation, still
    // eligible to rate).
    const bOnHostSubmit = waitFor<LobbySnapshot>(b, SERVER_EVENTS.state);
    host.emit(CLIENT_EVENTS.submitCaption, { meme: fakeMeme("host") });
    await bOnHostSubmit;

    const hostOnBSubmit = waitFor<LobbySnapshot>(host, SERVER_EVENTS.state);
    b.emit(CLIENT_EVENTS.submitCaption, { meme: fakeMeme("b") });
    await hostOnBSubmit;

    const hostInRating = await waitForPhase(host, "RATING");
    expect(hostInRating.ratingStep?.total).toBe(2);
    const currentStepIndex = hostInRating.ratingStep?.index ?? 0;

    // The author of step 0 is whichever of host/b submitted first (rotation
    // is submission-arrival order); c never submitted and is never the
    // author of any step, so c can always rate step 0 to prove the ordinary
    // success/refusal paths, and the author's own client proves
    // CANNOT_RATE_OWN.
    const authorSocket = hostInRating.ratingStep?.youAreAuthor ? host : b;
    const raterSocket = c;

    const authorRefusal = waitFor<ProtocolError>(authorSocket, SERVER_EVENTS.error);
    authorSocket.emit(CLIENT_EVENTS.submitRating, { stepIndex: currentStepIndex, value: 2 });
    expect((await authorRefusal).code).toBe("CANNOT_RATE_OWN");

    const outOfRangeRefusal = waitFor<ProtocolError>(raterSocket, SERVER_EVENTS.error);
    raterSocket.emit(CLIENT_EVENTS.submitRating, { stepIndex: currentStepIndex, value: 0 });
    expect((await outOfRangeRefusal).code).toBe("RATING_OUT_OF_RANGE");

    const wrongPhaseRefusal = waitFor<ProtocolError>(raterSocket, SERVER_EVENTS.error);
    raterSocket.emit(CLIENT_EVENTS.submitRating, {
      stepIndex: currentStepIndex - 1,
      value: 2,
    });
    expect((await wrongPhaseRefusal).code).toBe("WRONG_PHASE");

    const stateOnRate = waitFor<LobbySnapshot>(raterSocket, SERVER_EVENTS.state);
    raterSocket.emit(CLIENT_EVENTS.submitRating, { stepIndex: currentStepIndex, value: 3 });
    await stateOnRate;

    const alreadyRatedRefusal = waitFor<ProtocolError>(raterSocket, SERVER_EVENTS.error);
    raterSocket.emit(CLIENT_EVENTS.submitRating, { stepIndex: currentStepIndex, value: 1 });
    expect((await alreadyRatedRefusal).code).toBe("ALREADY_RATED");

    host.close();
    b.close();
    c.close();
  });
});
