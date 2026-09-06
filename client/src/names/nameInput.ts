// Mirrors server/src/config.ts's MAX_NAME_GRAPHEMES (D-08). Client and
// server are separate npm packages with no shared runtime module for plain
// constants beyond shared/*.ts's types, so this value is duplicated
// deliberately — change both together if D-08's range is ever revisited.
// This module is a typing-time UX convenience only; the server remains the
// sole enforcement point (its own nameValidation.ts re-runs the real cap).
export const MAX_NAME_GRAPHEMES = 15;

const segmenter = new Intl.Segmenter("he", { granularity: "grapheme" });

function toGraphemes(value: string): string[] {
  return [...segmenter.segment(value)].map((s) => s.segment);
}

/** Characters left before the cap — never derived from `.length`. */
export function graphemesRemaining(value: string): number {
  return MAX_NAME_GRAPHEMES - toGraphemes(value).length;
}

/** Truncates at a grapheme boundary as the player types past the cap. */
export function clampForInput(value: string): string {
  const graphemes = toGraphemes(value);
  if (graphemes.length <= MAX_NAME_GRAPHEMES) return value;
  return graphemes.slice(0, MAX_NAME_GRAPHEMES).join("");
}
