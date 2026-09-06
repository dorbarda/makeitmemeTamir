import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Room } from "../src/rooms/Room.js";
import { BETWEEN_MEMES_MS, BETWEEN_PHASES_MS } from "../src/config.js";

/**
 * Hardening for SCORE-01/SCORE-03/D-01 outside the common case: a late
 * joiner mid-WRITING, score accumulation across two rounds, and a round
 * skipped for too few captions (D-09) leaving every score untouched.
 * Bare-`Room` + `vi.useFakeTimers()`, the established harness from
 * rosterFade/hostTransfer/ratingStep/neverStalls — construct in
 * `beforeEach`, `room.dispose()` + real timers in `afterEach`. Submits fewer
 * than the full roster whenever a test needs the full window to elapse (see
 * neverStalls.integration.test.ts's own documented pitfall).
 */
describe("scoring and photo-assignment hardening (SCORE-01, SCORE-03, D-01, D-09)", () => {
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

  it("a player who joins a room after enterWriting() has already run still receives a non-null yourPhotoUrl on their next snapshot", () => {
    const players = startWithPlayers(3);
    expect(room.phase).toBe("WRITING");

    const lateJoiner = room.addPlayer("Late", "t-late");
    void players;

    const snapshot = room.snapshotFor(lateJoiner.id);
    expect(snapshot.yourPhotoUrl).not.toBeNull();
    expect(snapshot.yourPhotoUrl).toMatch(/^\/tamir-photos\//);
  });

  it("a player's score after two rounds equals the exact sum of both rounds' rating contributions to their own meme — never reset, never overwritten", () => {
    room.settings.rounds = 2;
    const players = startWithPlayers(3);
    const [p0, p1, p2] = players;

    // Round 1: p0 and p1 submit (two of three — never the full roster, per
    // the documented pitfall); rotation is [p0, p1]. Only step 0 (p0's meme)
    // is rated, by p2, with a known value — step 1 (p1's meme) closes
    // unrated, contributing 0 to p1 for this round.
    room.submitCaption(p0.id, "round1 p0");
    room.submitCaption(p1.id, "round1 p1");
    vi.advanceTimersByTime(room.settings.writingSeconds * 1000); // -> REVEAL_BREAK step 0
    vi.advanceTimersByTime(BETWEEN_PHASES_MS); // -> RATING step 0
    expect(room.phase).toBe("RATING");
    expect(room.rotation[room.stepIndex]).toBe(p0.id);

    room.submitRating(p2.id, 0, 2);
    // Step 0 has two eligible raters (p1, p2); only p2 rated, so it closes on
    // its own deadline rather than collapsing early.
    vi.advanceTimersByTime(room.settings.ratingSeconds * 1000); // -> REVEAL_BREAK step 1
    expect(room.phase).toBe("REVEAL_BREAK");
    vi.advanceTimersByTime(BETWEEN_MEMES_MS); // -> RATING step 1
    expect(room.phase).toBe("RATING");
    expect(room.rotation[room.stepIndex]).toBe(p1.id);

    // Step 1 (p1's meme) closes unrated — nobody rates it.
    vi.advanceTimersByTime(room.settings.ratingSeconds * 1000);
    expect(room.phase).toBe("ROUND_END");
    expect(room.players.get(p0.id)?.score).toBe(2);
    expect(room.players.get(p1.id)?.score).toBe(0);

    // Round 2 opens automatically after the ROUND_END beat.
    vi.advanceTimersByTime(BETWEEN_PHASES_MS);
    expect(room.phase).toBe("WRITING");
    expect(room.roundIndex).toBe(2);

    // Round 2: p0 and p2 submit; rotation is [p0, p2]. Rate step 0 (p0's
    // meme again) with a different known value from p1, confirming p0's
    // total becomes the SUM of both rounds' contributions.
    room.submitCaption(p0.id, "round2 p0");
    room.submitCaption(p2.id, "round2 p2");
    vi.advanceTimersByTime(room.settings.writingSeconds * 1000); // -> REVEAL_BREAK step 0
    vi.advanceTimersByTime(BETWEEN_PHASES_MS); // -> RATING step 0
    expect(room.rotation[room.stepIndex]).toBe(p0.id);

    room.submitRating(p1.id, 0, 1);
    vi.advanceTimersByTime(room.settings.ratingSeconds * 1000); // -> REVEAL_BREAK step 1
    expect(room.phase).toBe("REVEAL_BREAK");
    vi.advanceTimersByTime(BETWEEN_MEMES_MS); // -> RATING step 1
    // Step 1 (p2's meme) closes unrated.
    vi.advanceTimersByTime(room.settings.ratingSeconds * 1000);

    expect(room.phase).toBe("ROUND_END");
    // The round-1 contribution (2) plus the round-2 contribution (1) — never
    // reset, never overwritten by the second round's own scoring pass.
    expect(room.players.get(p0.id)?.score).toBe(3);
    expect(room.players.get(p1.id)?.score).toBe(0);
    expect(room.players.get(p2.id)?.score).toBe(0);
  });

  it("a round with fewer than MIN_SUBMISSIONS_TO_RATE submissions reaches ROUND_END with every player's score exactly unchanged", () => {
    const players = startWithPlayers(3);
    const [p0] = players;

    // Only one submission — below MIN_SUBMISSIONS_TO_RATE (2) — so the round
    // skips rating entirely (D-09).
    room.submitCaption(p0.id, "solo caption");

    vi.advanceTimersByTime(room.settings.writingSeconds * 1000);
    expect(room.phase).toBe("ROUND_END");

    for (const p of players) {
      expect(room.players.get(p.id)?.score).toBe(0);
    }
  });
});
