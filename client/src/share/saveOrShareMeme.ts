function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

export type SaveShareResult =
  | { outcome: "shared" }
  | { outcome: "dismissed" }
  | { outcome: "fallback"; blob: Blob };

/**
 * Three-branch save/share, never throwing to its caller — mirrors
 * shareJoinLink.ts's own proven shape:
 * 1. navigator.canShare({ files }) is true and share() succeeds -> "shared"
 * 2. share() exists but the user dismisses the native sheet (AbortError) ->
 *    "dismissed", not treated as a failure
 * 3. canShare is absent/false, or share() fails for any other reason ->
 *    "fallback" with the decoded Blob, for a full-screen long-press-to-save UI
 */
export async function saveOrShareMeme(meme: string): Promise<SaveShareResult> {
  const blob = base64ToBlob(meme, "image/png");
  const file = new File([blob], "tamir-meme.png", { type: "image/png" });
  const nav = typeof navigator === "undefined" ? undefined : navigator;

  if (nav && typeof nav.canShare === "function" && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: "תמונה ממסיבת תמיר" });
      return { outcome: "shared" };
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return { outcome: "dismissed" };
      }
      return { outcome: "fallback", blob };
    }
  }

  return { outcome: "fallback", blob };
}
