import { MAX_NAME_GRAPHEMES } from "../config.js";

export { MAX_NAME_GRAPHEMES };

// Constructed once at module load — Intl.Segmenter instantiation is the
// expensive part, not each segment() call. Verified working in this
// project's Node 22 runtime (see 01-RESEARCH.md, "Grapheme-aware name
// validation").
const segmenter = new Intl.Segmenter("he", { granularity: "grapheme" });

/**
 * Strips Unicode category Cc (control) and Cf (format) characters. Cf alone
 * already covers every bidi-override and zero-width character named in the
 * threat model (U+200E/U+200F, U+202A-U+202E, U+2066-U+2069, U+200B-U+200D,
 * U+FEFF all classify as Cf) — a category-based strip, not an enumerated
 * list, so no future bidi/format character needs a manual update here.
 */
function stripControlAndFormat(value: string): string {
  return value.replace(/[\p{Cc}\p{Cf}]/gu, "");
}

/**
 * Server-side enforcement point for every name that reaches storage — every
 * create, join and rename intent funnels through here before the Room ever
 * sees the candidate name (T-01-07). This is a sanitizer, not a whitelist
 * (D-06): ordinary Hebrew, Latin, digits, punctuation and emoji pass through
 * untouched, only control/format characters and excess whitespace are
 * removed.
 */
export function sanitizeName(raw: string): string {
  const stripped = stripControlAndFormat(raw);
  return stripped.trim().replace(/\s+/g, " ");
}

/**
 * User-perceived character count. Never `.length` or `[...str].length` —
 * both split multi-code-point emoji (ZWJ sequences, skin-tone modifiers)
 * into multiple units (T-01-08).
 */
export function graphemeLength(name: string): number {
  return [...segmenter.segment(name)].length;
}

/**
 * Truncates at a grapheme boundary — never mid-emoji, never leaves a
 * U+FFFD replacement character or a half-surrogate behind.
 */
export function truncateToGraphemes(name: string, max: number): string {
  const graphemes = [...segmenter.segment(name)].map((s) => s.segment);
  return graphemes.slice(0, max).join("");
}

/**
 * Sanitized + locale-lowercased comparison key used by Room.resolveDisplayName
 * for de-duplication. "Dor", "dor" and "  Dor  " all normalize identically;
 * Hebrew itself has no case distinction, so this chiefly protects a Latin or
 * mixed-script name from being duplicated with different casing.
 */
export function normalizeForCompare(name: string): string {
  return sanitizeName(name).toLocaleLowerCase("he");
}
