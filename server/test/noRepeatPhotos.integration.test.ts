import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Room } from "../src/rooms/Room.js";
import { BETWEEN_PHASES_MS } from "../src/config.js";
import { PHOTO_FILENAMES } from "../src/rooms/photos.js";
import { fakeMeme } from "./fixtures/meme.js";

/**
 * Hardening for ROUND-02/ROUND-06 outside the common case: a single player
 * run through more rounds than there are real photos, and the photo swap's
 * own edge cases. Bare-`Room` + `vi.useFakeTimers()`, the established
 * harness from rosterFade/hostTransfer/ratingStep/neverStalls/scoring —
 * construct in `beforeEach`, `room.dispose()` + real timers in `afterEach`.
 * Submits fewer than the full roster whenever a test needs the full writing
 * window to elapse (neverStalls.integration.test.ts's own documented
 * pitfall: submitting from every connected player in the same tick triggers
 * the writing-phase early-finish collapse).
 */
describe("no-repeat photos across more rounds than photos, and photo swap edge cases (ROUND-02, ROUND-06, D-01, D-02)", () => {
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

  it("a single player run through more rounds than PHOTO_FILENAMES.length never repeats a photo until every real photo has been shown once, then gracefully allows a repeat", () => {
    const totalRounds = PHOTO_FILENAMES.length + 2;
    // Large enough that the game never reaches GAME_END before this test's
    // own loop finishes walking every round it needs.
    room.settings.rounds = totalRounds;

    // MIN_PLAYERS_TO_START is 3 — three real players, but only ONE of them
    // (`target`) ever submits a caption each round (never the full
    // connected roster, per the documented pitfall), which is also below
    // MIN_SUBMISSIONS_TO_RATE (2) — every round skips rating (D-09) and goes
    // straight from WRITING to ROUND_END to the next round's WRITING.
    const players = startWithPlayers(3);
    const target = players[0];

    // The seen-set snapshot as it stood at the true start of round 0 — the
    // room has drawn no photo for anyone yet at this exact instant, since
    // `startGame`'s own `enterWriting()` call is what performs round 0's
    // draw (already synchronously done by the time `startWithPlayers`
    // returns) — so round 0's own check below compares against an empty
    // snapshot, correctly expecting no repeat.
    let seenSnapshotAtStart = new Set<string>();
    let sawRepeatAfterExhaustion = false;

    for (let round = 0; round < totalRounds; round++) {
      expect(room.phase).toBe("WRITING");

      const wasFullyExhausted = seenSnapshotAtStart.size >= PHOTO_FILENAMES.length;
      const assignedFilename = room.photoAssignments.get(target.id)!;

      if (!wasFullyExhausted) {
        expect(seenSnapshotAtStart.has(assignedFilename)).toBe(false);
      } else if (seenSnapshotAtStart.has(assignedFilename)) {
        sawRepeatAfterExhaustion = true;
      }

      room.submitCaption(target.id, fakeMeme(`round-${round}`));

      // Directly off the room's own public field (ROUND-02) — the snapshot
      // used by the NEXT iteration's "start of round" check.
      seenSnapshotAtStart = new Set(room.photosSeenByPlayer.get(target.id) ?? []);

      vi.advanceTimersByTime(room.settings.writingSeconds * 1000);
      expect(room.phase).toBe("ROUND_END");

      if (round < totalRounds - 1) {
        vi.advanceTimersByTime(BETWEEN_PHASES_MS);
        expect(room.phase).toBe("WRITING");
      }
    }

    // The graceful reset (CONTEXT.md's Claude's Discretion) actually fired
    // at least once across these totalRounds — proving repeats are allowed
    // again once the whole pool has been shown, rather than the room
    // stalling or throwing once photos ran out.
    expect(sawRepeatAfterExhaustion).toBe(true);
  });

  it("swapPhoto draws its replacement from the player's own not-yet-seen pool, excluding photos already recorded in their photosSeenByPlayer set wherever the pool allows it", () => {
    const players = startWithPlayers(3);
    const target = players[0];

    const seenBeforeSwap = new Set(room.photosSeenByPlayer.get(target.id) ?? []);
    const result = room.swapPhoto(target.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const swappedFilename = decodeURIComponent(result.photoUrl.replace("/tamir-photos/", ""));
    // Excludes both the player's current photo and, wherever the real pool
    // allows it (it does here — only one photo has been seen so far, and
    // the real pool has more than one), every other previously-seen photo.
    if (PHOTO_FILENAMES.length > seenBeforeSwap.size) {
      expect(seenBeforeSwap.has(swappedFilename)).toBe(false);
    }
  });

  it("swapPhoto refuses SWAP_ALREADY_USED on a second attempt in the same round, and photoAssignments is unchanged by the refused attempt", () => {
    const players = startWithPlayers(3);
    const target = players[0];

    const first = room.swapPhoto(target.id);
    expect(first.ok).toBe(true);
    const assignedAfterFirst = room.photoAssignments.get(target.id);

    const second = room.swapPhoto(target.id);
    expect(second).toEqual({ ok: false, error: "SWAP_ALREADY_USED" });
    expect(room.photoAssignments.get(target.id)).toBe(assignedAfterFirst);
  });

  it("swapPhoto refuses ALREADY_SUBMITTED once submitCaption has succeeded for that player, even if their one swap was never used", () => {
    const players = startWithPlayers(3);
    const target = players[0];

    expect(room.submitCaption(target.id, fakeMeme("caption")).ok).toBe(true);
    expect(room.swapPhoto(target.id)).toEqual({ ok: false, error: "ALREADY_SUBMITTED" });
  });
});
