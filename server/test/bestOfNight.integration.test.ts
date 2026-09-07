import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Room } from "../src/rooms/Room.js";
import { BETWEEN_MEMES_MS, BETWEEN_PHASES_MS } from "../src/config.js";
import type { RatingValue } from "@shared/protocol.js";

/**
 * Hardening for the winner screen and the best-of-the-night list outside the
 * common case (SCORE-04/D-03, MEME-02/D-04): a tie for first, an all-zero
 * game (D-09), more than 3 candidate memes, and a tie at the eviction
 * boundary — against a bare `Room` with `vi.useFakeTimers()`, following
 * scoring.integration.test.ts's own harness style (construct in `beforeEach`,
 * `room.dispose()` + real timers in `afterEach`). Every scenario here
 * deliberately leaves at least one eligible rater silent on every step it
 * touches, so no step ever collapses early (D-07) — every advance in this
 * file is the step's own full, uncollapsed `ratingSeconds`/`writingSeconds`
 * deadline, kept uniform on purpose so the scripted rounds below stay easy
 * to follow.
 */
describe("best-of-the-night and game-end winners hardening (SCORE-04, MEME-02, D-03, D-04, D-09)", () => {
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
   * Drives exactly one round: `authorIds` submit captions in that exact
   * order (rotation === authorIds, per D-08); `ratersByStep[i]` is the list
   * of `[raterId, value]` pairs applied to rotation step `i` — an empty
   * array leaves that step entirely unrated, so it contributes nothing to
   * `bestOfNight`. Leaves the room in ROUND_END when it returns; the caller
   * advances `BETWEEN_PHASES_MS` to move on to the next round or GAME_END.
   */
  function playRound(authorIds: string[], ratersByStep: Array<Array<[string, RatingValue]>>) {
    for (const id of authorIds) {
      room.submitCaption(id, `caption-${id}`);
    }
    vi.advanceTimersByTime(room.settings.writingSeconds * 1000);
    expect(room.phase).toBe("REVEAL_BREAK");
    vi.advanceTimersByTime(BETWEEN_PHASES_MS);

    ratersByStep.forEach((raters, index) => {
      expect(room.phase).toBe("RATING");
      expect(room.stepIndex).toBe(index);
      for (const [raterId, value] of raters) {
        room.submitRating(raterId, index, value);
      }
      vi.advanceTimersByTime(room.settings.ratingSeconds * 1000);
      if (index < authorIds.length - 1) {
        expect(room.phase).toBe("REVEAL_BREAK");
        vi.advanceTimersByTime(BETWEEN_MEMES_MS);
      }
    });

    expect(room.phase).toBe("ROUND_END");
  }

  it("two players tied for the highest (non-zero) score both appear in gameEnd.winners; a lower-scoring third player does not", () => {
    room.settings.rounds = 2;
    const [p0, p1, p2] = startWithPlayers(3);

    // Round 1: p0's meme scores 2 (one vote from p2); p1's meme unrated.
    playRound([p0.id, p1.id], [[[p2.id, 2]], []]);
    vi.advanceTimersByTime(BETWEEN_PHASES_MS); // -> round 2's WRITING

    // Round 2: p1's meme scores 2 (one vote from p0); p2's meme unrated.
    // Final totals: p0=2, p1=2, p2=0 — a real tie for first.
    playRound([p1.id, p2.id], [[[p0.id, 2]], []]);
    vi.advanceTimersByTime(BETWEEN_PHASES_MS); // -> GAME_END
    expect(room.phase).toBe("GAME_END");

    expect(room.players.get(p0.id)?.score).toBe(2);
    expect(room.players.get(p1.id)?.score).toBe(2);
    expect(room.players.get(p2.id)?.score).toBe(0);

    const gameEnd = room.snapshotFor(p0.id).gameEnd;
    const winnerIds = gameEnd?.winners.map((w) => w.id).sort();
    expect(winnerIds).toEqual([p0.id, p1.id].sort());
  });

  it("a game where every round is skipped for too few captions (D-09) reaches GAME_END with every player as a winner, each scoring 0, and no crash", () => {
    room.settings.rounds = 2;
    const players = startWithPlayers(3);

    // Zero submissions each round — well below MIN_SUBMISSIONS_TO_RATE (2) —
    // so both rounds skip rating entirely and go straight to ROUND_END.
    vi.advanceTimersByTime(room.settings.writingSeconds * 1000);
    expect(room.phase).toBe("ROUND_END");
    vi.advanceTimersByTime(BETWEEN_PHASES_MS);
    expect(room.phase).toBe("WRITING");
    expect(room.roundIndex).toBe(2);

    vi.advanceTimersByTime(room.settings.writingSeconds * 1000);
    expect(room.phase).toBe("ROUND_END");
    vi.advanceTimersByTime(BETWEEN_PHASES_MS);
    expect(room.phase).toBe("GAME_END");

    const gameEnd = room.snapshotFor(players[0].id).gameEnd;
    expect(gameEnd?.winners).toHaveLength(3);
    for (const winner of gameEnd?.winners ?? []) {
      expect(winner.score).toBe(0);
    }
  });

  it("bestOfNight never exceeds length 3 and evicts the lowest-scoring entry as strictly higher-scoring memes arrive across more than 3 rounds", () => {
    room.settings.rounds = 4;
    const [p0, p1, p2, p3] = startWithPlayers(5);

    playRound([p0.id, p1.id], [[[p2.id, 1]], []]);
    expect(room.bestOfNight.map((e) => e.score)).toEqual([1]);
    vi.advanceTimersByTime(BETWEEN_PHASES_MS);

    playRound([p0.id, p1.id], [[[p2.id, 2]], []]);
    expect(room.bestOfNight.map((e) => e.score)).toEqual([2, 1]);
    vi.advanceTimersByTime(BETWEEN_PHASES_MS);

    playRound([p0.id, p1.id], [[[p2.id, 3]], []]);
    expect(room.bestOfNight.map((e) => e.score)).toEqual([3, 2, 1]);
    vi.advanceTimersByTime(BETWEEN_PHASES_MS);

    // A score of 4 needs two votes (a single vote maxes out at 3) — only 2
    // of the 4 eligible raters (p1, p2, p3, and the room's 5th player) rate
    // it, so this still never collapses early.
    playRound([p0.id, p1.id], [[[p2.id, 2], [p3.id, 2]], []]);
    expect(room.bestOfNight).toHaveLength(3);
    expect(room.bestOfNight.map((e) => e.score)).toEqual([4, 3, 2]);
  });

  it("when a new candidate's score exactly ties the current #3 survivor's score, the earlier-inserted entry keeps the slot and the new tied candidate is dropped", () => {
    room.settings.rounds = 4;
    const [p0, p1, p2, p3, p4] = startWithPlayers(5);

    // Round 1: p0's meme scores 5 (two votes: p2=2, p3=3).
    playRound([p0.id, p1.id], [[[p2.id, 2], [p3.id, 3]], []]);
    vi.advanceTimersByTime(BETWEEN_PHASES_MS);

    // Round 2: p1's meme scores 4 (two votes: p2=2, p3=2).
    playRound([p1.id, p0.id], [[[p2.id, 2], [p3.id, 2]], []]);
    vi.advanceTimersByTime(BETWEEN_PHASES_MS);

    // Round 3: p2's meme scores 3 (one vote: p4=3) — the ORIGINAL #3
    // survivor this test proves stays put.
    playRound([p2.id, p3.id], [[[p4.id, 3]], []]);
    vi.advanceTimersByTime(BETWEEN_PHASES_MS);

    expect(room.bestOfNight.map((e) => e.score)).toEqual([5, 4, 3]);
    const originalThirdPlaceAuthorId = room.bestOfNight[2].authorId;
    expect(originalThirdPlaceAuthorId).toBe(p2.id);

    // Round 4: p3's meme ALSO scores 3 (one vote: p2=3) — an exact tie with
    // the current #3 survivor.
    playRound([p3.id, p4.id], [[[p2.id, 3]], []]);

    expect(room.bestOfNight).toHaveLength(3);
    expect(room.bestOfNight.map((e) => e.score)).toEqual([5, 4, 3]);
    expect(room.bestOfNight[2].authorId).toBe(originalThirdPlaceAuthorId);
    expect(room.bestOfNight.some((e) => e.authorId === p3.id)).toBe(false);
  });

  it("a game with no rated memes at all reaches GAME_END with bestOfNight exactly empty, never padded or fabricated", () => {
    room.settings.rounds = 1;
    startWithPlayers(3);

    vi.advanceTimersByTime(room.settings.writingSeconds * 1000);
    expect(room.phase).toBe("ROUND_END");
    vi.advanceTimersByTime(BETWEEN_PHASES_MS);
    expect(room.phase).toBe("GAME_END");

    expect(room.bestOfNight).toEqual([]);
  });
});
