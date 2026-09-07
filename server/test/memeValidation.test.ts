import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Room } from "../src/rooms/Room.js";
import { MEME_MAX_BASE64_CHARS } from "../src/config.js";
import { fakeMeme } from "./fixtures/meme.js";

// Bare-Room + vi.useFakeTimers(), matching writingPhase.integration.test.ts's
// own harness: construct in beforeEach, room.dispose() + real timers in
// afterEach. Proves every validation branch Task 2 added to
// Room.submitCaption (T-05-01, T-05-02) — closing the Nyquist gap
// RESEARCH.md's own "Wave 0 Gaps" section flagged for this exact surface.
describe("submitCaption meme validation — empty, non-string, oversized, malformed-base64, valid round-trip (T-05-01, T-05-02)", () => {
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

  it("refuses CAPTION_REQUIRED for an empty string", () => {
    const players = startWithPlayers(3);
    expect(room.submitCaption(players[0].id, "")).toEqual({
      ok: false,
      error: "CAPTION_REQUIRED",
    });
  });

  it("refuses CAPTION_REQUIRED for a non-string value (a number)", () => {
    const players = startWithPlayers(3);
    expect(room.submitCaption(players[0].id, 123)).toEqual({
      ok: false,
      error: "CAPTION_REQUIRED",
    });
  });

  it("refuses CAPTION_REQUIRED for a non-string value (null)", () => {
    const players = startWithPlayers(3);
    expect(room.submitCaption(players[0].id, null)).toEqual({
      ok: false,
      error: "CAPTION_REQUIRED",
    });
  });

  it("refuses MEME_TOO_LARGE for a string longer than MEME_MAX_BASE64_CHARS", () => {
    const players = startWithPlayers(3);
    const oversized = "A".repeat(MEME_MAX_BASE64_CHARS + 1);
    expect(room.submitCaption(players[0].id, oversized)).toEqual({
      ok: false,
      error: "MEME_TOO_LARGE",
    });
  });

  it("refuses CAPTION_REQUIRED for a non-empty string containing Hebrew text (outside the base64 alphabet)", () => {
    const players = startWithPlayers(3);
    expect(room.submitCaption(players[0].id, "שלום")).toEqual({
      ok: false,
      error: "CAPTION_REQUIRED",
    });
  });

  it("refuses CAPTION_REQUIRED for a non-empty string with characters outside the base64 alphabet", () => {
    const players = startWithPlayers(3);
    expect(room.submitCaption(players[0].id, "not-base64!!")).toEqual({
      ok: false,
      error: "CAPTION_REQUIRED",
    });
  });

  it("accepts fakeMeme()'s own output and stores it verbatim in room.submissions", () => {
    const players = startWithPlayers(3);
    const meme = fakeMeme("round-trip");
    expect(room.submitCaption(players[0].id, meme)).toEqual({ ok: true });
    expect(room.submissions.get(players[0].id)).toBe(meme);
  });
});
