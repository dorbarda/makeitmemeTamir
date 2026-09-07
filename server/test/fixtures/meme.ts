/**
 * A tiny, validly base64-shaped stand-in for a real rasterized meme PNG.
 * Room.submitCaption never inspects PNG structure (RESEARCH.md's documented
 * trade-off) — only that the payload is non-empty, correctly base64-shaped,
 * and within MEME_MAX_BASE64_CHARS — so tests only need something that
 * clears those same checks. `marker` lets a test embed a distinctive,
 * greppable value (e.g. for a privacy-leak check) without needing a real
 * image.
 */
export function fakeMeme(marker = "x"): string {
  return Buffer.from(`FAKE_MEME:${marker}:${"p".repeat(32)}`).toString("base64");
}
