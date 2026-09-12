import { useState } from "react";
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  type LobbySnapshot,
  type ProtocolError,
  type RatingValue,
} from "@shared/protocol.js";
import { HEBREW_ERRORS, HEBREW_UI } from "@shared/messages.js";
import { getSocket } from "../../socket/connection";
import { memeDataUrl } from "../../canvas/compositor.js";
import { SaveShareButton } from "./SaveShareButton";

type RatingPanelProps = {
  snapshot: LobbySnapshot;
};

const TIER_LABELS: Record<RatingValue, string> = {
  1: HEBREW_UI.ratingTierMeh,
  2: HEBREW_UI.ratingTierFine,
  3: HEBREW_UI.ratingTierFunniest,
};

/**
 * The rating step's own screen: one meme at a time, the same one on every
 * player's screen (VOTE-01). Renders only what `snapshot.ratingStep` says —
 * no client-side phase inference, no optimistic state. The panel only ever
 * flips to the rated view once the next snapshot says `youHaveRated`, the
 * same round-trip discipline as `WritingPanel`'s `youSubmitted`. The meme's
 * own author sees a waiting state with no rating buttons (VOTE-03) — this
 * dwell time is where MEME-03's save/share button lives (plan 05-04), since
 * it's the one point every author already sits looking at their own
 * finished meme. Nobody sees any other player's individual rating, only
 * the live X-of-Y count.
 */
export function RatingPanel({ snapshot }: RatingPanelProps) {
  const [error, setError] = useState<string | undefined>(undefined);
  const ratingStep = snapshot.ratingStep;
  if (!ratingStep) return null;

  function handleRate(stepIndex: number, value: RatingValue) {
    setError(undefined);

    const socket = getSocket();
    const onError = (err: ProtocolError) => {
      setError(HEBREW_ERRORS[err.code]);
      cleanup();
    };
    const onState = () => {
      // Success — the next snapshot (already on its way) flips youHaveRated;
      // this screen has no optimistic mutation of its own.
      cleanup();
    };
    function cleanup() {
      socket.off(SERVER_EVENTS.error, onError);
      socket.off(SERVER_EVENTS.state, onState);
    }

    socket.once(SERVER_EVENTS.error, onError);
    socket.once(SERVER_EVENTS.state, onState);
    // Sending the step index with the rating is what lets the server refuse
    // a tap that landed after the step already moved on, rather than
    // mis-applying it to the next meme (T-02-05).
    socket.emit(CLIENT_EVENTS.submitRating, { stepIndex, value });
  }

  return (
    <section className="rating-panel">
      <p>
        {ratingStep.index + 1} {HEBREW_UI.ofSeparator} {ratingStep.total}
      </p>

      <img className="meme-photo" src={memeDataUrl(ratingStep.meme)} alt={HEBREW_UI.photoAlt} />

      {ratingStep.youAreAuthor ? (
        <>
          <p>{HEBREW_UI.yourMemeWaiting}</p>
          <SaveShareButton meme={ratingStep.meme} />
        </>
      ) : ratingStep.youHaveRated ? (
        <p>{HEBREW_UI.ratedAlreadyNote}</p>
      ) : (
        <div className="rating-tiers">
          {([1, 2, 3] as const).map((value) => (
            <button
              key={value}
              type="button"
              className="rating-tier"
              onClick={() => handleRate(ratingStep.index, value)}
            >
              {TIER_LABELS[value]}
            </button>
          ))}
          {error && <p role="alert">{error}</p>}
        </div>
      )}

      <p className="writing-progress">
        {ratingStep.ratedCount} {HEBREW_UI.ofSeparator} {ratingStep.eligibleCount}
      </p>
    </section>
  );
}
