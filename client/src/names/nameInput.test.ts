import { describe, it, expect } from "vitest";
import { graphemesRemaining, clampForInput, MAX_NAME_GRAPHEMES } from "./nameInput";

describe("graphemesRemaining", () => {
  it("returns the full budget for an empty name", () => {
    expect(graphemesRemaining("")).toBe(MAX_NAME_GRAPHEMES);
  });

  it("counts a single-code-point emoji as one character, not by UTF-16 length", () => {
    const emoji = "🎉"; // string.length === 2 (surrogate pair)
    expect(emoji.length).toBe(2);
    expect(graphemesRemaining(emoji)).toBe(MAX_NAME_GRAPHEMES - 1);
  });

  it("decrements once per Hebrew letter", () => {
    expect(graphemesRemaining("דור")).toBe(MAX_NAME_GRAPHEMES - 3);
  });
});

describe("clampForInput", () => {
  it("leaves a name under the cap untouched", () => {
    expect(clampForInput("דור")).toBe("דור");
  });

  it("truncates a name over the cap at a grapheme boundary", () => {
    const long = "🎉".repeat(20);
    const clamped = clampForInput(long);
    expect(clamped).toBe("🎉".repeat(MAX_NAME_GRAPHEMES));
  });
});
