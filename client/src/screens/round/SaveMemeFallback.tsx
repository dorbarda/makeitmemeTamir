import { useEffect, useState } from "react";
import { HEBREW_UI } from "@shared/messages.js";

type SaveMemeFallbackProps = { blob: Blob; onDone: () => void };

/**
 * The full-screen modal shown only when `saveOrShareMeme` degrades to its
 * "fallback" branch (no `navigator.share`/`canShare` support) — a
 * long-press-to-save image, per CLAUDE.md's locked iOS Safari fallback
 * chain. The object URL is revoked in this effect's own cleanup (T-05-07)
 * so it is never left reachable after the modal closes or unmounts.
 */
export function SaveMemeFallback({ blob, onDone }: SaveMemeFallbackProps) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);

  if (!url) return null;

  return (
    <div className="save-meme-fallback">
      <img src={url} alt={HEBREW_UI.photoAlt} />
      <p>{HEBREW_UI.longPressInstructions}</p>
      <button type="button" onClick={onDone}>
        {HEBREW_UI.doneButton}
      </button>
    </div>
  );
}
