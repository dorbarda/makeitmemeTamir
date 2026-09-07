import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Room } from "../src/rooms/Room.js";
import { WRITING_COLLAPSE_MS } from "../src/config.js";
import { fakeMeme } from "./fixtures/meme.js";

// Bare-Room + vi.useFakeTimers(), following the rosterFade/hostTransfer
// harness style: construct in beforeEach, room.dispose() + real timers in
// afterEach. Proves two properties the whole plan hangs on: the writing
// phase ends at its deadline no matter who stayed silent (ROUND-04), and an
// early finish can only ever pull that deadline earlier, never later (D-07).
describe("writing phase — deadline holds regardless of submissions, progress boundaries, collapse-only-shortens (ROUND-04, ROUND-05, D-07)", () => {
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

  it("ends the writing phase exactly at the deadline with one submission out of five — the four silent players change nothing", () => {
    const players = startWithPlayers(5);
    room.submitCaption(players[0].id, fakeMeme("p0"));

    const deadlineMs = room.settings.writingSeconds * 1000;
    vi.advanceTimersByTime(deadlineMs - 1);
    expect(room.phase).toBe("WRITING");

    vi.advanceTimersByTime(1);
    expect(room.phase).not.toBe("WRITING");
  });

  it("ends the writing phase exactly at the deadline with zero submissions", () => {
    startWithPlayers(5);

    const deadlineMs = room.settings.writingSeconds * 1000;
    vi.advanceTimersByTime(deadlineMs - 1);
    expect(room.phase).toBe("WRITING");

    vi.advanceTimersByTime(1);
    expect(room.phase).not.toBe("WRITING");
  });

  it("progress climbs 0/5 through 5/5 as distinct players submit and stays at 5/5 on a repeat attempt", () => {
    const players = startWithPlayers(5);
    const readProgress = () => room.snapshotFor(players[0].id).progress;

    expect(readProgress()).toEqual({ submitted: 0, total: 5, submittedPlayerIds: [] });

    players.forEach((p, i) => {
      const outcome = room.submitCaption(p.id, fakeMeme(`p${i}`));
      expect(outcome.ok).toBe(true);
      expect(readProgress()?.submitted).toBe(i + 1);
    });

    expect(readProgress()?.submitted).toBe(5);
    expect(readProgress()?.submittedPlayerIds).toHaveLength(5);
    for (const p of players) {
      expect(readProgress()?.submittedPlayerIds).toContain(p.id);
    }

    // A repeat submit from an already-submitted player must not double-count
    // or exceed the roster size, however many times it is retried.
    const repeat = room.submitCaption(players[0].id, fakeMeme("again"));
    expect(repeat).toEqual({ ok: false, error: "ALREADY_SUBMITTED" });
    expect(readProgress()?.submitted).toBe(5);
    const repeatAgain = room.submitCaption(players[0].id, fakeMeme("and-again"));
    expect(repeatAgain).toEqual({ ok: false, error: "ALREADY_SUBMITTED" });
    expect(readProgress()?.submitted).toBe(5);
  });

  it("collapses the deadline to exactly now + WRITING_COLLAPSE_MS when the last connected player submits with 30s left", () => {
    const players = startWithPlayers(5);
    const deadlineMs = room.settings.writingSeconds * 1000;
    // Leave exactly 30s on the clock before the last submission.
    vi.advanceTimersByTime(deadlineMs - 30_000);

    for (let i = 0; i < 4; i++) {
      room.submitCaption(players[i].id, fakeMeme(`p${i}`));
    }
    expect(room.phase).toBe("WRITING");

    const now = Date.now();
    room.submitCaption(players[4].id, fakeMeme("last-one"));
    expect(room.deadlineAt).toBe(now + WRITING_COLLAPSE_MS);
    expect(room.phase).toBe("WRITING");

    vi.advanceTimersByTime(WRITING_COLLAPSE_MS - 1);
    expect(room.phase).toBe("WRITING");
    vi.advanceTimersByTime(1);
    expect(room.phase).not.toBe("WRITING");
  });

  it("never extends: deadlineAt is exactly unchanged when the last connected player submits with only 1200ms left", () => {
    const players = startWithPlayers(5);
    const deadlineMs = room.settings.writingSeconds * 1000;
    vi.advanceTimersByTime(deadlineMs - 1200);

    for (let i = 0; i < 4; i++) {
      room.submitCaption(players[i].id, fakeMeme(`p${i}`));
    }

    const deadlineBefore = room.deadlineAt;
    room.submitCaption(players[4].id, fakeMeme("last-one"));
    // An equality assertion, not an inequality — a one-millisecond extension
    // would fail this.
    expect(room.deadlineAt).toBe(deadlineBefore);

    vi.advanceTimersByTime(1199);
    expect(room.phase).toBe("WRITING");
    vi.advanceTimersByTime(1);
    expect(room.phase).not.toBe("WRITING");
  });

  it("does not let a detached non-submitter block the early-finish collapse", () => {
    const players = startWithPlayers(5);
    // Never submits and never returns — must not hold up the other four.
    room.detach(players[4].id);

    room.submitCaption(players[0].id, fakeMeme("a"));
    room.submitCaption(players[1].id, fakeMeme("b"));
    room.submitCaption(players[2].id, fakeMeme("c"));
    expect(room.phase).toBe("WRITING");

    const now = Date.now();
    room.submitCaption(players[3].id, fakeMeme("d")); // the last CONNECTED player
    expect(room.deadlineAt).toBe(now + WRITING_COLLAPSE_MS);

    vi.advanceTimersByTime(WRITING_COLLAPSE_MS);
    expect(room.phase).not.toBe("WRITING");
  });

  it("refuses CAPTION_REQUIRED for an empty caption without changing progress", () => {
    const players = startWithPlayers(5);
    const outcome = room.submitCaption(players[0].id, "");
    expect(outcome).toEqual({ ok: false, error: "CAPTION_REQUIRED" });
    expect(room.snapshotFor(players[0].id).progress?.submitted).toBe(0);
  });

  it("refuses WRONG_PHASE for a submit-caption before the game has started", () => {
    const host = room.addPlayer("Host", "t-host");
    expect(room.submitCaption(host.id, fakeMeme("too-early"))).toEqual({
      ok: false,
      error: "WRONG_PHASE",
    });
  });

  it("refuses ALREADY_SUBMITTED on a second submit from the same player and never overwrites the stored caption", () => {
    const players = startWithPlayers(5);
    const firstMeme = fakeMeme("first");
    expect(room.submitCaption(players[0].id, firstMeme).ok).toBe(true);
    const repeat = room.submitCaption(players[0].id, fakeMeme("second"));
    expect(repeat).toEqual({ ok: false, error: "ALREADY_SUBMITTED" });
    expect(room.submissions.get(players[0].id)).toBe(firstMeme);
  });
});
