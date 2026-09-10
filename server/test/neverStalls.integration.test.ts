import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Room } from "../src/rooms/Room.js";
import {
  BETWEEN_MEMES_MS,
  BETWEEN_PHASES_MS,
  DISCONNECT_QUORUM_GRACE_MS,
  HOST_TRANSFER_GRACE_MS,
  RATING_COLLAPSE_MS,
  ROSTER_FADE_GRACE_MS,
  WRITING_COLLAPSE_MS,
} from "../src/config.js";
import type { RoomPhase } from "@shared/protocol.js";
import { fakeMeme } from "./fixtures/meme.js";

/**
 * LIVE-03, the phase's own reason for existing: every non-terminal phase
 * (WRITING, REVEAL_BREAK, RATING, ROUND_END) holds a live server timer, and
 * no transition condition anywhere is satisfiable only by a specific
 * player. A departed, disconnected or silent player may only ever make a
 * phase end SOONER (D-07's collapse) — never hold it open, and never
 * prevent it from closing on schedule.
 *
 * Bare-`Room` + `vi.useFakeTimers()`, the established harness from
 * rosterFade/hostTransfer/ratingStep — construct in `beforeEach`,
 * `room.dispose()` + real timers in `afterEach`.
 */
describe("LIVE-03 — no phase can be held open by a player who left, disconnected or stayed silent", () => {
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
   * Exactly two submitters (players[0], players[1]) — enough to clear
   * MIN_SUBMISSIONS_TO_RATE (a two-step rotation) without every connected
   * player having submitted, so the writing phase's own early-finish
   * collapse (D-07) never fires here. If it did, the single large
   * `vi.advanceTimersByTime` below would cascade straight through this
   * round's own rating steps (and possibly into the next round) rather than
   * landing cleanly on REVEAL_BREAK — the same pitfall
   * ratingStep.integration.test.ts's own `reachStep0()` avoids by never
   * having every connected player submit. Any player beyond the first two
   * remains a non-submitter (D-08) but stays a fully eligible rater for
   * every step.
   */
  function reachRatingStep0(count: number) {
    const players = startWithPlayers(count);
    room.submitCaption(players[0].id, fakeMeme("p0"));
    room.submitCaption(players[1].id, fakeMeme("p1"));

    vi.advanceTimersByTime(room.settings.writingSeconds * 1000);
    expect(room.phase).toBe("REVEAL_BREAK");
    vi.advanceTimersByTime(BETWEEN_PHASES_MS);
    expect(room.phase).toBe("RATING");
    return players;
  }

  it("closes WRITING exactly at its own deadline when every player but one has detached", () => {
    const players = startWithPlayers(4);
    room.detach(players[1].id);
    room.detach(players[2].id);
    room.detach(players[3].id);

    vi.advanceTimersByTime(room.settings.writingSeconds * 1000 - 1);
    expect(room.phase).toBe("WRITING");
    vi.advanceTimersByTime(1);
    expect(room.phase).not.toBe("WRITING");
  });

  it("a player detached long enough ago to be past their quorum grace is excluded from the early-finish expectation — the remaining connected players submitting still collapses the deadline", () => {
    const players = startWithPlayers(4);
    room.detach(players[3].id); // departs before ever submitting
    // Bug fix (writing-phase-ends-early): a fresh disconnect no longer
    // drops a player out of the quorum instantly — a real phone locking its
    // screen looks identical to this at t=0. Aging the disconnect past
    // DISCONNECT_QUORUM_GRACE_MS is what tells "genuinely left" apart from
    // "briefly backgrounded" here.
    vi.advanceTimersByTime(DISCONNECT_QUORUM_GRACE_MS);

    room.submitCaption(players[0].id, fakeMeme("a"));
    room.submitCaption(players[1].id, fakeMeme("b"));
    expect(room.phase).toBe("WRITING"); // players[2] (connected) hasn't submitted yet

    const now = Date.now();
    room.submitCaption(players[2].id, fakeMeme("c"));
    // Every CONNECTED player (0,1,2) has now submitted — players[3] having
    // left long enough ago is never counted among those the room is waiting on.
    expect(room.deadlineAt).toBe(now + WRITING_COLLAPSE_MS);
  });

  it("a player detaching during WRITING moments ago (a phone lock/backgrounding blip) still blocks the early-finish collapse — the remaining connected players submitting must not cut the round short (bug: writing-phase-ends-early)", () => {
    const players = startWithPlayers(4);
    room.detach(players[3].id); // could be gone for good, or could just be a locked screen

    room.submitCaption(players[0].id, fakeMeme("a"));
    room.submitCaption(players[1].id, fakeMeme("b"));
    room.submitCaption(players[2].id, fakeMeme("c")); // every actively-connected player

    // No collapse yet — players[3]'s disconnect is still within their grace
    // window, so the round runs its full course instead of assuming they
    // have left.
    expect(room.phase).toBe("WRITING");
    const fullDeadlineMs = room.settings.writingSeconds * 1000;
    vi.advanceTimersByTime(fullDeadlineMs - 1);
    expect(room.phase).toBe("WRITING");
    vi.advanceTimersByTime(1);
    expect(room.phase).not.toBe("WRITING");
  });

  it("a rater detached long enough ago (back during an earlier phase) to be past their quorum grace does not block the remaining eligible raters from collapsing the step early", () => {
    // DISCONNECT_QUORUM_GRACE_MS (18s) outlasts every ratingSeconds preset
    // (8/10/15s) — a rater who detaches only after the current RATING step
    // has already opened can therefore never age past grace before the step
    // itself naturally closes (see the "moments ago... still blocks" test
    // below). To exercise the past-grace side at all, the detach has to
    // happen earlier, back during WRITING, so enough real time elapses
    // (writingSeconds default 60s + BETWEEN_PHASES_MS getting to RATING)
    // for the grace window to have already expired by the time this step
    // is reached — a rater genuinely gone by then, not a mid-step blip.
    const players = startWithPlayers(4);
    room.detach(players[3].id);

    room.submitCaption(players[0].id, fakeMeme("p0"));
    room.submitCaption(players[1].id, fakeMeme("p1"));
    // players[2] deliberately never submits, so WRITING's own early-finish
    // collapse never fires here (mirrors reachRatingStep0's own shape).

    vi.advanceTimersByTime(room.settings.writingSeconds * 1000);
    expect(room.phase).toBe("REVEAL_BREAK");
    vi.advanceTimersByTime(BETWEEN_PHASES_MS);
    expect(room.phase).toBe("RATING");

    const authorId = room.rotation[room.stepIndex]; // players[0], the first submitter
    const remaining = players.filter((p) => p.id !== authorId && p.id !== players[3].id);

    for (const p of remaining.slice(0, -1)) {
      room.submitRating(p.id, room.stepIndex, 2);
    }
    expect(room.phase).toBe("RATING");

    const now = Date.now();
    room.submitRating(remaining[remaining.length - 1].id, room.stepIndex, 3);
    // players[3], gone long enough ago, was never counted among the raters
    // this step waits on — the remaining ones finishing is enough to
    // collapse it.
    expect(room.deadlineAt).toBe(now + RATING_COLLAPSE_MS);
  });

  it("a rater detaching during RATING moments ago (a phone lock/backgrounding blip) still blocks the early-finish collapse within their quorum grace window (bug: rating-phase-collapses-early)", () => {
    const players = reachRatingStep0(4);
    const authorId = room.rotation[room.stepIndex];
    const eligible = players.filter((p) => p.id !== authorId);
    const [departing, ...remaining] = eligible;

    // Simulates a real-phone screen lock during RATING: the socket transport
    // closes and `detach()` fires immediately, well before this rater has
    // actually left. The remaining raters submitting right away must not
    // collapse the step out from under them, especially with only 8-15s to
    // begin with.
    room.detach(departing.id);

    for (const p of remaining) {
      room.submitRating(p.id, room.stepIndex, 2);
    }

    // No collapse yet — the departing rater's disconnect is still within
    // their grace window, so the step runs its full original duration
    // instead of assuming they have left.
    expect(room.phase).toBe("RATING");
    const fullDeadlineMs = room.settings.ratingSeconds * 1000;
    vi.advanceTimersByTime(fullDeadlineMs - 1);
    expect(room.phase).toBe("RATING");
    vi.advanceTimersByTime(1);
    expect(room.phase).not.toBe("RATING");
  });

  it("a backgrounded rater who reconnects and rates within their quorum grace window still collapses the step once everyone is truly done", () => {
    const players = reachRatingStep0(4);
    const authorId = room.rotation[room.stepIndex];
    const eligible = players.filter((p) => p.id !== authorId);
    const [departing, ...remaining] = eligible;

    room.detach(departing.id);
    for (const p of remaining) {
      room.submitRating(p.id, room.stepIndex, 2);
    }
    expect(room.phase).toBe("RATING"); // still waiting on the backgrounded rater

    // The phone unlocks and resyncs well within the grace window, then
    // rates — now everyone still present has genuinely finished.
    vi.advanceTimersByTime(2_000);
    room.attach(departing.id);
    const now = Date.now();
    room.submitRating(departing.id, room.stepIndex, 3);
    expect(room.deadlineAt).toBe(now + RATING_COLLAPSE_MS);

    vi.advanceTimersByTime(RATING_COLLAPSE_MS);
    expect(room.phase).not.toBe("RATING");
  });

  it("every eligible rater for a step detaching leaves the step to close on its own deadline with an empty ratings array — no value is invented", () => {
    const players = reachRatingStep0(4);
    const authorId = room.rotation[room.stepIndex];
    const eligible = players.filter((p) => p.id !== authorId);
    for (const p of eligible) room.detach(p.id);

    vi.advanceTimersByTime(room.settings.ratingSeconds * 1000 - 1);
    expect(room.phase).toBe("RATING");
    vi.advanceTimersByTime(1);
    expect(room.phase).not.toBe("RATING");
    expect(room.ratings.get(0)?.size ?? 0).toBe(0);
    expect(room.eligibleAtClose.get(0)).toBe(0);
  });

  it("the host detaching mid-game does not disturb the round clock, and Phase 1's host transfer still fires on its own schedule", () => {
    const host = room.addPlayer("Host", "t-host");
    room.addPlayer("B", "t-b");
    room.addPlayer("C", "t-c");
    // Decoupled from the default 60s writingSeconds, which would otherwise
    // coincide exactly with HOST_TRANSFER_GRACE_MS and fire on the same
    // tick as the phase timer, confounding this test's own boundary checks.
    room.settings.writingSeconds = 45;
    room.startGame(host.id);

    room.detach(host.id);

    // Nobody submits — writing still closes on schedule regardless of the
    // host's absence, and D-09 sends the round straight to ROUND_END.
    vi.advanceTimersByTime(45_000 - 1);
    expect(room.phase).toBe("WRITING");
    vi.advanceTimersByTime(1);
    expect(room.phase).toBe("ROUND_END");
    expect(room.hostId).toBe(host.id); // the 60s host-transfer grace hasn't elapsed yet

    // The host-transfer countdown, running independently underneath the
    // round clock, still fires on its own schedule.
    vi.advanceTimersByTime(HOST_TRANSFER_GRACE_MS - 45_000);
    expect(room.hostId).not.toBe(host.id);

    // The round clock itself was never disturbed by the transfer: ROUND_END's
    // own BETWEEN_PHASES_MS beat already elapsed within that same advance,
    // and round 2's WRITING has already opened on schedule.
    expect(room.phase).toBe("WRITING");
    expect(room.roundIndex).toBe(2);
  });

  it("a mid-game detach schedules no roster fade (Phase 1 D-17) — the player is still in players after ROSTER_FADE_GRACE_MS * 3", () => {
    const players = startWithPlayers(3);
    room.detach(players[1].id);

    vi.advanceTimersByTime(ROSTER_FADE_GRACE_MS * 3);

    expect(room.players.has(players[1].id)).toBe(true);
    expect(room.players.get(players[1].id)?.connected).toBe(false);
  });

  it("a detached player who reconnects mid-round sees the current phase and the unchanged deadline, having missed nothing structural", () => {
    const players = reachRatingStep0(4);
    room.detach(players[2].id);
    const deadlineBeforeReturn = room.deadlineAt;
    const phaseBeforeReturn = room.phase;

    vi.advanceTimersByTime(200); // a brief blip, well inside the step's own deadline
    room.attach(players[2].id);

    const snapshot = room.snapshotFor(players[2].id);
    expect(snapshot.phase).toBe(phaseBeforeReturn);
    expect(snapshot.deadlineAt).toBe(deadlineBeforeReturn); // attach never touches the phase timer
    expect(room.players.get(players[2].id)?.connected).toBe(true);
  });

  it("a bare Room driven with fake timers from startGame with zero submissions never reports phase === RATING at any point in the round (D-09)", () => {
    const players = startWithPlayers(3);
    const seenPhases: RoomPhase[] = [room.phase];
    room.onStateChanged = () => seenPhases.push(room.phase);

    // Nobody submits a caption in any round. Advance well past the whole
    // game (every round's writing deadline plus its D-11 beat, generously
    // over-advanced) — RATING must never appear, all the way to GAME_END.
    vi.advanceTimersByTime(3_600_000);
    expect(room.phase).toBe("GAME_END");
    expect(seenPhases).not.toContain("RATING");
    // `roundEnd` is now ROUND_END-only (plan 04-02) — at GAME_END the
    // equivalent "nothing was ever rated" proof is bestOfNight staying
    // exactly empty (MEME-02/D-04), never padded or fabricated.
    expect(room.snapshotFor(players[0].id).roundEnd).toBeNull();
    expect(room.snapshotFor(players[0].id).gameEnd?.bestOfNight).toEqual([]);
  });

  it("a RoundEndEntry for a step rated by two of four eligible raters has a ratings array of length 2 and eligibleAtClose equal to 4", () => {
    // Five total players, only two of whom submit (players[0], players[1] —
    // reachRatingStep0's own shape): the step 0 author (players[0]) has
    // four eligible raters — every OTHER connected player, submitter or
    // not (players[1..4]) — matching this exact shape from
    // ratingStep.integration.test.ts's own "two of four eligible raters"
    // coverage of the underlying ratings/eligibleAtClose maps.
    const players = reachRatingStep0(5);
    room.submitRating(players[1].id, 0, 3);
    room.submitRating(players[2].id, 0, 1);
    // players[3] and players[4] (also eligible) never rate — the step still
    // closes on its own deadline rather than waiting for them.

    vi.advanceTimersByTime(room.settings.ratingSeconds * 1000);
    // Two submitters -> a two-step rotation; advance through step 1 to
    // reach ROUND_END, where roundEnd is populated.
    vi.advanceTimersByTime(BETWEEN_MEMES_MS);
    vi.advanceTimersByTime(room.settings.ratingSeconds * 1000);
    expect(room.phase).toBe("ROUND_END");

    const entry = room.snapshotFor(players[0].id).roundEnd?.entries[0];
    expect(entry?.ratings).toHaveLength(2);
    expect(entry?.eligibleAtClose).toBe(4);
  });

  it("visits WRITING, REVEAL_BREAK, RATING and ROUND_END in turn — detaching every player at each does not stop the phase from advancing on its own timer", () => {
    const players = startWithPlayers(4);
    // Two submissions clear MIN_SUBMISSIONS_TO_RATE, giving the round two
    // rating steps to walk through (so REVEAL_BREAK and RATING are each
    // visited twice — once per meme).
    room.submitCaption(players[0].id, fakeMeme("a"));
    room.submitCaption(players[1].id, fakeMeme("b"));

    const PHASE_ADVANCE_MS: Record<"WRITING" | "REVEAL_BREAK" | "RATING" | "ROUND_END", () => number> = {
      WRITING: () => room.settings.writingSeconds * 1000,
      REVEAL_BREAK: () => (room.stepIndex === 0 ? BETWEEN_PHASES_MS : BETWEEN_MEMES_MS),
      RATING: () => room.settings.ratingSeconds * 1000,
      ROUND_END: () => BETWEEN_PHASES_MS,
    };

    const phasesToWalk: Array<keyof typeof PHASE_ADVANCE_MS> = [
      "WRITING",
      "REVEAL_BREAK",
      "RATING",
      "REVEAL_BREAK",
      "RATING",
      "ROUND_END",
    ];

    for (const phase of phasesToWalk) {
      expect(room.phase).toBe(phase);
      for (const p of players) room.detach(p.id);
      vi.advanceTimersByTime(PHASE_ADVANCE_MS[phase]());
      expect(room.phase).not.toBe(phase);
    }
  });

  it("dispose() halts advancement from each of WRITING, REVEAL_BREAK, RATING and ROUND_END", () => {
    const phasesToTest: RoomPhase[] = ["WRITING", "REVEAL_BREAK", "RATING", "ROUND_END"];

    for (const targetPhase of phasesToTest) {
      const r = new Room(`code-${targetPhase}`, "http://x/join/x", "data:image/png;base64,");
      const ps = Array.from({ length: 4 }, (_, i) => r.addPlayer(`P${i}`, `t-${targetPhase}-${i}`));
      r.startGame(ps[0].id);
      r.submitCaption(ps[0].id, fakeMeme("a"));
      r.submitCaption(ps[1].id, fakeMeme("b"));

      if (targetPhase !== "WRITING") {
        vi.advanceTimersByTime(r.settings.writingSeconds * 1000); // -> REVEAL_BREAK (step 0)
      }
      if (targetPhase === "RATING" || targetPhase === "ROUND_END") {
        vi.advanceTimersByTime(BETWEEN_PHASES_MS); // -> RATING (step 0)
      }
      if (targetPhase === "ROUND_END") {
        vi.advanceTimersByTime(r.settings.ratingSeconds * 1000); // -> REVEAL_BREAK (step 1)
        vi.advanceTimersByTime(BETWEEN_MEMES_MS); // -> RATING (step 1)
        vi.advanceTimersByTime(r.settings.ratingSeconds * 1000); // -> ROUND_END (last step closed)
      }

      expect(r.phase).toBe(targetPhase);
      r.dispose();
      vi.advanceTimersByTime(60 * 60 * 1000); // an hour — nothing scheduled before teardown may ever fire
      expect(r.phase).toBe(targetPhase);
    }
  });
});
