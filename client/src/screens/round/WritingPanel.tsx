import { useState } from "react";
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  type LobbySnapshot,
  type ProtocolError,
} from "@shared/protocol.js";
import { HEBREW_ERRORS, HEBREW_UI } from "@shared/messages.js";
import { getSocket } from "../../socket/connection";

type WritingPanelProps = {
  snapshot: LobbySnapshot;
};

// Mirrors server/src/config.ts's MAX_CAPTION_GRAPHEMES — a typing-time UX
// convenience only, duplicated deliberately (client and server are separate
// npm packages with no shared runtime module for plain constants). The
// server's own prepareCaption remains the sole enforcement point, exactly as
// client/src/names/nameInput.ts documents for the name cap.
const MAX_CAPTION_GRAPHEMES = 120;
const segmenter = new Intl.Segmenter("he", { granularity: "grapheme" });

function toGraphemes(value: string): string[] {
  return [...segmenter.segment(value)].map((s) => s.segment);
}

/** Characters left before the cap — never derived from `.length`. */
function graphemesRemaining(value: string): number {
  return MAX_CAPTION_GRAPHEMES - toGraphemes(value).length;
}

/** Truncates at a grapheme boundary as the player types past the cap. */
function clampCaptionForInput(value: string): string {
  const graphemes = toGraphemes(value);
  if (graphemes.length <= MAX_CAPTION_GRAPHEMES) return value;
  return graphemes.slice(0, MAX_CAPTION_GRAPHEMES).join("");
}

/**
 * The writing phase's own screen: the player's own real assigned photo of
 * Tamir (D-01), a caption box and send button before submitting, and — once
 * the server confirms the submission — the submitted note plus the room's
 * fill progress (D-13). No optimistic state:
 * this panel only flips to the submitted view once the next snapshot says
 * `youSubmitted` — the server is the sole authority, exactly like
 * `Lobby.tsx`'s `handleRename` round-trip. Nothing here ever renders another
 * player's caption text, because the snapshot never carries one (D-14).
 */
export function WritingPanel({ snapshot }: WritingPanelProps) {
  const [caption, setCaption] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);

    const socket = getSocket();
    const onError = (err: ProtocolError) => {
      setError(HEBREW_ERRORS[err.code]);
      cleanup();
    };
    const onState = () => {
      // Success — the next snapshot (already on its way) flips youSubmitted;
      // this screen has no optimistic mutation of its own.
      cleanup();
    };
    function cleanup() {
      socket.off(SERVER_EVENTS.error, onError);
      socket.off(SERVER_EVENTS.state, onState);
    }

    socket.once(SERVER_EVENTS.error, onError);
    socket.once(SERVER_EVENTS.state, onState);
    socket.emit(CLIENT_EVENTS.submitCaption, { text: caption });
  }

  /** ROUND-06/D-01 — swaps the assigned photo instantly, no preview. Copies
   * handleSubmit's own once-listener/cleanup shape and reuses the same
   * error state — no optimistic mutation; the swap only becomes visible
   * once the next snapshot's yourPhotoUrl changes. */
  function handleSwap() {
    setError(undefined);

    const socket = getSocket();
    const onError = (err: ProtocolError) => {
      setError(HEBREW_ERRORS[err.code]);
      cleanup();
    };
    const onState = () => {
      cleanup();
    };
    function cleanup() {
      socket.off(SERVER_EVENTS.error, onError);
      socket.off(SERVER_EVENTS.state, onState);
    }

    socket.once(SERVER_EVENTS.error, onError);
    socket.once(SERVER_EVENTS.state, onState);
    socket.emit(CLIENT_EVENTS.swapPhoto, {});
  }

  const progress = snapshot.progress;

  return (
    <section className="writing-panel">
      {snapshot.yourPhotoUrl && (
        <img className="meme-photo" src={snapshot.yourPhotoUrl} alt={HEBREW_UI.photoAlt} />
      )}
      {snapshot.youCanSwapPhoto && (
        <button
          type="button"
          className="swap-photo-button"
          onClick={handleSwap}
        >
          {HEBREW_UI.swapPhotoButton}
        </button>
      )}

      {snapshot.youSubmitted ? (
        <>
          <p>{HEBREW_UI.alreadySubmittedNote}</p>
          <p>{HEBREW_UI.waitingForOthers}</p>
        </>
      ) : (
        <form onSubmit={handleSubmit}>
          <label>
            {HEBREW_UI.captionPlaceholder}
            <textarea
              value={caption}
              onChange={(e) => setCaption(clampCaptionForInput(e.target.value))}
              placeholder={HEBREW_UI.captionPlaceholder}
            />
            <span>{graphemesRemaining(caption)}</span>
          </label>
          <button type="submit">{HEBREW_UI.sendCaptionButton}</button>
          {error && <p role="alert">{error}</p>}
        </form>
      )}

      {progress && (
        <>
          <p className="writing-progress">
            {progress.submitted} {HEBREW_UI.ofSeparator} {progress.total}{" "}
            {HEBREW_UI.submittedProgressSuffix}
          </p>
          <ul>
            {snapshot.players.map((player) => (
              <li key={player.id}>
                {player.name}
                {progress.submittedPlayerIds.includes(player.id) && (
                  <span className="roster-check" aria-hidden="true">
                    {" "}
                    ✓
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
