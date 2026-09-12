import { useState } from "react";
import { HEBREW_UI } from "@shared/messages.js";
import { saveOrShareMeme } from "../../share/saveOrShareMeme.js";
import { SaveMemeFallback } from "./SaveMemeFallback";

type SaveShareButtonProps = { meme: string };

/**
 * The one reusable save/share entry point both render surfaces mount
 * (MEME-03, D-03): `RatingPanel`'s `youAreAuthor` waiting state, and every
 * `GameEndPanel` best-of-night entry. "shared"/"dismissed" both resolve
 * with nothing further to render — only "fallback" surfaces the full-screen
 * long-press modal.
 */
export function SaveShareButton({ meme }: SaveShareButtonProps) {
  const [fallbackBlob, setFallbackBlob] = useState<Blob | null>(null);

  async function handleClick() {
    const result = await saveOrShareMeme(meme);
    if (result.outcome === "fallback") {
      setFallbackBlob(result.blob);
    }
  }

  return (
    <>
      <button type="button" className="save-share-button" onClick={handleClick}>
        {HEBREW_UI.saveMemeButton}
      </button>
      {fallbackBlob && (
        <SaveMemeFallback blob={fallbackBlob} onDone={() => setFallbackBlob(null)} />
      )}
    </>
  );
}
