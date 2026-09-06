import { describe, it, expect } from "vitest";
import { COUNTDOWN_URGENT_MS, skewOffsetMs, remainingMs, remainingSeconds, isUrgent } from "./countdown";

describe("skewOffsetMs", () => {
  it("returns serverNow - clientNow; a client whose clock is 30s fast yields -30000", () => {
    const serverNow = 1_000_000;
    const clientNow = 1_030_000; // 30s ahead of the server
    expect(skewOffsetMs(serverNow, clientNow)).toBe(-30_000);
  });

  it("is 0 when both clocks agree", () => {
    expect(skewOffsetMs(1_000_000, 1_000_000)).toBe(0);
  });
});

describe("remainingMs", () => {
  it("returns deadlineAt - (clientNow + offsetMs)", () => {
    const deadlineAt = 1_010_000;
    const clientNow = 1_000_000;
    const offsetMs = 0;
    expect(remainingMs(deadlineAt, clientNow, offsetMs)).toBe(10_000);
  });

  it("clamps at 0 — never negative, even long past the deadline", () => {
    const deadlineAt = 1_000_000;
    const clientNow = 1_005_000; // 5s past the deadline
    expect(remainingMs(deadlineAt, clientNow, 0)).toBe(0);
  });

  it("a client 30s behind the server computes the same remaining time as a perfect clock, once corrected by the offset", () => {
    const deadlineAt = 2_000_000;

    // Perfect clock: clientNow === serverNow, offset is 0.
    const perfectClientNow = 1_990_000;
    const perfectOffset = skewOffsetMs(1_990_000, perfectClientNow);
    const perfectRemaining = remainingMs(deadlineAt, perfectClientNow, perfectOffset);

    // A client 30s behind the server: its own clock reads 30s earlier than
    // the server's, but the offset it computed against the same serverNow
    // corrects for exactly that gap.
    const laggingClientNow = perfectClientNow - 30_000;
    const laggingOffset = skewOffsetMs(1_990_000, laggingClientNow);
    const laggingRemaining = remainingMs(deadlineAt, laggingClientNow, laggingOffset);

    expect(laggingRemaining).toBe(perfectRemaining);
  });
});

describe("remainingSeconds", () => {
  it("1 ms remaining reads as 1", () => {
    expect(remainingSeconds(1_000_001, 1_000_000, 0)).toBe(1);
  });

  it("exactly 1000 ms remaining reads as 1", () => {
    expect(remainingSeconds(1_001_000, 1_000_000, 0)).toBe(1);
  });

  it("1001 ms remaining reads as 2", () => {
    expect(remainingSeconds(1_001_001, 1_000_000, 0)).toBe(2);
  });

  it("0 ms remaining reads as 0", () => {
    expect(remainingSeconds(1_000_000, 1_000_000, 0)).toBe(0);
  });

  it("a client 30s behind the server computes the same remainingSeconds as a client with a perfect clock", () => {
    const deadlineAt = 2_000_000;
    const serverNow = 1_990_000;

    const perfectClientNow = serverNow;
    const perfectOffset = skewOffsetMs(serverNow, perfectClientNow);

    const laggingClientNow = serverNow - 30_000;
    const laggingOffset = skewOffsetMs(serverNow, laggingClientNow);

    expect(remainingSeconds(deadlineAt, laggingClientNow, laggingOffset)).toBe(
      remainingSeconds(deadlineAt, perfectClientNow, perfectOffset),
    );
  });
});

describe("isUrgent", () => {
  it("is true at exactly COUNTDOWN_URGENT_MS", () => {
    expect(isUrgent(COUNTDOWN_URGENT_MS)).toBe(true);
  });

  it("is false one ms above COUNTDOWN_URGENT_MS", () => {
    expect(isUrgent(COUNTDOWN_URGENT_MS + 1)).toBe(false);
  });

  it("is false at exactly 0", () => {
    expect(isUrgent(0)).toBe(false);
  });

  it("is true for any positive value under the threshold", () => {
    expect(isUrgent(1)).toBe(true);
  });
});
