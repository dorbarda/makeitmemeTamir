import "@fontsource/heebo/400.css";
import { useEffect, useRef, useState } from "react";
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  type LobbySnapshot,
  type ProtocolError,
} from "@shared/protocol.js";
import { HEBREW_ERRORS, HEBREW_UI } from "@shared/messages.js";
import { getSocket } from "../../socket/connection";
import {
  type CaptionBox,
  drawFrame,
  rasterize,
  blobToBase64,
  BOX_WIDTH,
  BOX_HEIGHT,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
} from "../../canvas/compositor.js";

// A purely client-side UX cap on how much text one caption box can
// reasonably hold once drawn onto a fixed-size image — it no longer mirrors
// any server constant (the server has no text-length concept for `meme` at
// all after Plan 05-01; see server/src/rooms/Room.ts's shape/size-only
// validation).
const MAX_CAPTION_BOX_GRAPHEMES = 60;
const segmenter = new Intl.Segmenter("he", { granularity: "grapheme" });

function toGraphemes(value: string): string[] {
  return [...segmenter.segment(value)].map((s) => s.segment);
}

/** Characters left before the cap — never derived from `.length`. */
function graphemesRemaining(value: string): number {
  return MAX_CAPTION_BOX_GRAPHEMES - toGraphemes(value).length;
}

/** Truncates at a grapheme boundary as the player types past the cap. */
function clampCaptionForInput(value: string): string {
  const graphemes = toGraphemes(value);
  if (graphemes.length <= MAX_CAPTION_BOX_GRAPHEMES) return value;
  return graphemes.slice(0, MAX_CAPTION_BOX_GRAPHEMES).join("");
}

type WritingPanelProps = {
  snapshot: LobbySnapshot;
};

/**
 * The writing phase's own screen (D-01, D-02): the player's own real assigned
 * photo of Tamir is composed live on a canvas with one caption box drawn on
 * top, and submitting rasterizes that exact canvas to a base64 PNG sent as
 * `meme` — the tracer proving the rasterize-and-transmit pipeline
 * (RESEARCH.md) end to end before Wave 3 adds drag/add/remove for up to 3
 * boxes (D-05). No optimistic state: this panel only flips to the submitted
 * view once the next snapshot says `youSubmitted` — the server is the sole
 * authority, exactly like `Lobby.tsx`'s `handleRename` round-trip. Nothing
 * here ever renders another player's caption text, because the snapshot
 * never carries one (D-14).
 */
export function WritingPanel({ snapshot }: WritingPanelProps) {
  const [boxes, setBoxes] = useState<CaptionBox[]>([
    {
      id: "box-1",
      text: "",
      x: (CANVAS_WIDTH - BOX_WIDTH) / 2,
      y: (CANVAS_HEIGHT - BOX_HEIGHT) / 2,
    },
  ]);
  const [error, setError] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const photoRef = useRef<HTMLImageElement | null>(null);

  function redraw() {
    const canvas = canvasRef.current;
    const photo = photoRef.current;
    if (!canvas || !photo) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawFrame(ctx, photo, boxes);
  }

  // Loads this player's own assigned photo (D-01) once it's known, then
  // draws the first frame as soon as it's ready.
  useEffect(() => {
    if (!snapshot.yourPhotoUrl) return;
    const img = new Image();
    img.onload = () => {
      photoRef.current = img;
      redraw();
    };
    img.src = snapshot.yourPhotoUrl;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.yourPhotoUrl]);

  // Live preview as the player types.
  useEffect(() => {
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boxes]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);

    // MEME-01's empty-caption edge — enforced here because a rasterized
    // image is always non-empty bytes even with blank text, so the server
    // can no longer catch this (see Plan 05-01's key-decisions).
    if (!boxes.some((b) => b.text.trim().length > 0)) {
      setError(HEBREW_ERRORS.CAPTION_REQUIRED);
      return;
    }

    setSubmitting(true);
    try {
      // CRITICAL — HEB-03 depends on this running before any fillText call,
      // or the browser silently falls back to a system font mid-render.
      await document.fonts.ready;

      const canvas = canvasRef.current;
      const photo = photoRef.current;
      if (!canvas || !photo) {
        setError(HEBREW_ERRORS.CAPTION_REQUIRED);
        return;
      }

      // Guarantees the just-typed text is on the canvas before rasterizing.
      redraw();

      const socket = getSocket();
      const onError = (err: ProtocolError) => {
        setError(HEBREW_ERRORS[err.code]);
        cleanup();
      };
      const onState = () => {
        // Success — the next snapshot (already on its way) flips
        // youSubmitted; this screen has no optimistic mutation of its own.
        cleanup();
      };
      function cleanup() {
        socket.off(SERVER_EVENTS.error, onError);
        socket.off(SERVER_EVENTS.state, onState);
      }

      const blob = await rasterize(canvas);
      const meme = await blobToBase64(blob);

      socket.once(SERVER_EVENTS.error, onError);
      socket.once(SERVER_EVENTS.state, onState);
      socket.emit(CLIENT_EVENTS.submitCaption, { meme });
    } finally {
      setSubmitting(false);
    }
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
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="meme-canvas"
      />
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
            <input
              type="text"
              value={boxes[0].text}
              onChange={(e) =>
                setBoxes([{ ...boxes[0], text: clampCaptionForInput(e.target.value) }])
              }
              placeholder={HEBREW_UI.captionPlaceholder}
            />
            <span>{graphemesRemaining(boxes[0].text)}</span>
          </label>
          <button type="submit" disabled={submitting}>
            {HEBREW_UI.sendCaptionButton}
          </button>
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
