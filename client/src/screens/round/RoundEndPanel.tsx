import type { LobbySnapshot } from "@shared/protocol.js";
import { HEBREW_UI } from "@shared/messages.js";

type RoundEndPanelProps = {
  snapshot: LobbySnapshot;
};

/**
 * The round-end and game-end screens (VOTE-04, D-10). Renders only what
 * `snapshot.roundEnd` says, in the exact order the server sent it — no sort
 * call and no summation of any entry's `ratings` array into a score.
 * Ranking memes by total points is VOTE-06 (Phase 4), and whether a score is
 * a sum, an average or some floor is explicitly deferred there too (D-10);
 * a placeholder that quietly picked one would pre-empt that decision. This
 * same component covers both ROUND_END (mid-game) and GAME_END (the final
 * round's results, with no separate winner screen — that is Phase 4's
 * SCORE-04/MEME-02).
 */
export function RoundEndPanel({ snapshot }: RoundEndPanelProps) {
  const roundEnd = snapshot.roundEnd;
  if (!roundEnd) return null;

  return (
    <section className="round-end-panel">
      {roundEnd.entries.length === 0 ? (
        <p>{HEBREW_UI.roundEndTooFewCaptions}</p>
      ) : (
        <ul>
          {roundEnd.entries.map((entry) => (
            <li key={entry.authorId} className="round-end-entry">
              <p>{entry.authorName}</p>
              <p>{entry.caption}</p>
              <p>
                {entry.ratings.length} {HEBREW_UI.ofSeparator} {entry.eligibleAtClose}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
