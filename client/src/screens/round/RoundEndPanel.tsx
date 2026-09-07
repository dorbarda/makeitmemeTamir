import type { LobbySnapshot } from "@shared/protocol.js";
import { HEBREW_UI } from "@shared/messages.js";

type RoundEndPanelProps = {
  snapshot: LobbySnapshot;
};

/**
 * The round-end and game-end screens (VOTE-04, D-10, SCORE-01/03, VOTE-06).
 * Renders only what `snapshot.roundEnd`/`snapshot.players` say — no
 * summation of any entry's `ratings` array into a score; the server already
 * did that (`Room.buildRoundEndView`), and this component only sorts the
 * already-computed values for display: `rankedEntries` ranks that round's
 * MEMES by their real `entry.score`, highest first (VOTE-06), while
 * `scoreboard` separately ranks PLAYERS by their accumulated score, a plain
 * list with no per-round delta (D-03). This same component covers both
 * ROUND_END (mid-game) and GAME_END (the final round's results, with no
 * separate winner screen — that is Phase 4's SCORE-04/MEME-02).
 */
export function RoundEndPanel({ snapshot }: RoundEndPanelProps) {
  const roundEnd = snapshot.roundEnd;
  if (!roundEnd) return null;

  const scoreboard = [...snapshot.players].sort((a, b) => b.score - a.score);
  const rankedEntries = [...roundEnd.entries].sort((a, b) => b.score - a.score);

  return (
    <section className="round-end-panel">
      {rankedEntries.length === 0 ? (
        <p>{HEBREW_UI.roundEndTooFewCaptions}</p>
      ) : (
        <ul>
          {rankedEntries.map((entry) => (
            <li key={entry.authorId} className="round-end-entry">
              <p>{entry.authorName}</p>
              <p>{entry.caption}</p>
              <p className="round-end-score">
                {entry.score} {HEBREW_UI.roundResultsPointsSuffix}
              </p>
            </li>
          ))}
        </ul>
      )}

      <section className="scoreboard">
        <h2>{HEBREW_UI.scoreboardHeading}</h2>
        <ol className="scoreboard-list">
          {scoreboard.map((player) => (
            <li key={player.id} className="scoreboard-entry">
              <span>{player.name}</span>
              <span>{player.score}</span>
            </li>
          ))}
        </ol>
      </section>
    </section>
  );
}
