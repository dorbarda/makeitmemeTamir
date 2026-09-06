/** A short Hebrew invitation shown alongside the link in the WhatsApp
 * fallback text — the WhatsApp group is the real distribution channel for
 * this party (D-02), so this is the actual target of the fallback, not an
 * afterthought. */
const WHATSAPP_INVITE_TEXT = "בואו לשחק במסיבת הממים של תמיר";

/** `https://wa.me/?text=<invitation + the percent-encoded join URL>`. */
export function buildWhatsAppUrl(joinUrl: string): string {
  const text = `${WHATSAPP_INVITE_TEXT} ${joinUrl}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export type ShareResult =
  | { outcome: "shared" }
  | { outcome: "dismissed" }
  | { outcome: "fallback"; whatsAppUrl: string };

/**
 * Three-branch share, never throwing to its caller:
 * 1. `navigator.share` exists and succeeds -> { outcome: "shared" }
 * 2. `navigator.share` exists but the user dismisses the native sheet
 *    (an AbortError) -> { outcome: "dismissed" }, not treated as a failure
 * 3. `navigator.share` doesn't exist, or fails for any other reason ->
 *    { outcome: "fallback", whatsAppUrl } naming the WhatsApp fallback link;
 *    the caller pairs this with a clipboard copy so a browser with neither
 *    share nor a WhatsApp handler can still paste the link.
 */
export async function shareJoinLink(joinUrl: string): Promise<ShareResult> {
  const whatsAppUrl = buildWhatsAppUrl(joinUrl);
  const nav = typeof navigator === "undefined" ? undefined : navigator;

  if (!nav || typeof nav.share !== "function") {
    return { outcome: "fallback", whatsAppUrl };
  }

  try {
    await nav.share({ url: joinUrl, text: WHATSAPP_INVITE_TEXT });
    return { outcome: "shared" };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { outcome: "dismissed" };
    }
    // Any other failure (permission denied, unsupported payload, etc.)
    // degrades to the same fallback rather than surfacing an error to the UI.
    return { outcome: "fallback", whatsAppUrl };
  }
}
