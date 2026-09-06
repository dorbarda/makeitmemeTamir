import { describe, it, expect } from "vitest";
import {
  sanitizeName,
  graphemeLength,
  truncateToGraphemes,
  normalizeForCompare,
  MAX_NAME_GRAPHEMES,
} from "../src/names/nameValidation.js";

describe("MAX_NAME_GRAPHEMES", () => {
  it("is 15, the upper bound of D-08's 12-15 range", () => {
    expect(MAX_NAME_GRAPHEMES).toBe(15);
  });
});

describe("graphemeLength", () => {
  it("counts plain Hebrew letters", () => {
    expect(graphemeLength("דור")).toBe(3);
  });

  it("counts a trailing single-code-point emoji as one grapheme", () => {
    expect(graphemeLength("דור🎉")).toBe(4);
  });

  it("counts a ZWJ family-emoji sequence as one grapheme, not its component code points", () => {
    const family = "\u{1F468}‍\u{1F469}‍\u{1F467}‍\u{1F466}"; // 👨‍👩‍👧‍👦
    expect(graphemeLength(family)).toBe(1);
  });
});

describe("truncateToGraphemes", () => {
  it("truncates a 20-emoji string to exactly 15 intact emoji", () => {
    const twentyEmoji = "🎉".repeat(20);
    const truncated = truncateToGraphemes(twentyEmoji, 15);
    expect(graphemeLength(truncated)).toBe(15);
    expect(truncated).toBe("🎉".repeat(15));
  });

  it("never produces a half-surrogate replacement character", () => {
    const truncated = truncateToGraphemes("🎉".repeat(20), 15);
    expect(truncated).not.toMatch(/�/);
  });
});

describe("sanitizeName", () => {
  it("trims leading and trailing whitespace", () => {
    expect(sanitizeName("  דור  ")).toBe("דור");
  });

  it("collapses runs of internal whitespace to a single space", () => {
    expect(sanitizeName("דור   כהן")).toBe("דור כהן");
  });

  it("strips bidi override and embedding characters", () => {
    expect(sanitizeName("abc‮def")).toBe("abcdef");
    expect(sanitizeName("‎abc‏")).toBe("abc");
    expect(sanitizeName("a⁦b⁩c")).toBe("abc");
  });

  it("strips zero-width characters", () => {
    expect(sanitizeName("a​b‌c‍d﻿e")).toBe("abcde");
  });

  it("leaves Hebrew, Latin, digits, punctuation and emoji untouched", () => {
    expect(sanitizeName("דור2 O'Brien! 🎉")).toBe("דור2 O'Brien! 🎉");
  });

  it("returns empty string for an empty input", () => {
    expect(sanitizeName("")).toBe("");
  });

  it("returns empty string for a spaces-only input", () => {
    expect(sanitizeName("   ")).toBe("");
  });

  it("returns empty string for input made only of zero-width spaces", () => {
    expect(sanitizeName("​​​")).toBe("");
  });
});

describe("normalizeForCompare", () => {
  it("treats case-only Latin variants as identical", () => {
    expect(normalizeForCompare("Dor")).toBe(normalizeForCompare("dor"));
    expect(normalizeForCompare("Dor")).toBe(normalizeForCompare("  Dor  "));
  });

  it("treats a name and its numbered variant as distinct", () => {
    expect(normalizeForCompare("דור")).not.toBe(normalizeForCompare("דור 2"));
  });
});
