import type { LobbySnapshot } from "@shared/protocol.js";
import { HEBREW_UI } from "@shared/messages.js";

type GameEndPanelProps = {
  snapshot: LobbySnapshot;
};

/**
 * The dedicated game-end screen (SCORE-04/D-03, MEME-02/D-04). Renders only
 * what `snapshot.gameEnd`/`snapshot.players` say — the server already
 * computed both the winner(s) (`Room.buildGameEndView`) and the
 * best-of-the-night list (`Room.updateBestOfNight`); this component never
 * recomputes either. Kept as its own component rather than folded into
 * `RoundEndPanel` to avoid reintroducing the duplicate-player-list bug the
 * Phase 3 real-phone playtest found and fixed (see `Round.tsx`'s own doc
 * comment) — `RoundEndPanel` now covers `ROUND_END` only, this component
 * covers `GAME_END` only. `scoreboard` is copied verbatim from
 * `RoundEndPanel.tsx` rather than imported — these stay two independent
 * small components, per this codebase's one-component-per-file convention.
 */
export function GameEndPanel({ snapshot }: GameEndPanelProps) {
  if (!snapshot.gameEnd) return null;

  const scoreboard = [...snapshot.players].sort((a, b) => b.score - a.score);

  return (
    <section className="game-end-panel">
      <section className="winner-banner">
        <h2>{HEBREW_UI.winnerHeading}</h2>
        <ul className="winner-list">
          {snapshot.gameEnd.winners.map((winner) => (
            <li key={winner.id} className="winner-entry">
              {winner.name} — {winner.score} {HEBREW_UI.roundResultsPointsSuffix}
            </li>
          ))}
        </ul>
      </section>

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

      <section className="best-of-night">
        <h2>{HEBREW_UI.bestOfNightHeading}</h2>
        {snapshot.gameEnd.bestOfNight.length === 0 ? (
          <p>{HEBREW_UI.bestOfNightEmpty}</p>
        ) : (
          <ol className="best-of-list">
            {snapshot.gameEnd.bestOfNight.map((entry, index) => (
              <li key={`${entry.authorId}-${index}`} className="best-of-entry">
                <img className="meme-photo" src={entry.photoUrl} alt={HEBREW_UI.photoAlt} />
                <p>{entry.caption}</p>
                <p className="best-of-meta">
                  {entry.authorName} — {entry.score} {HEBREW_UI.roundResultsPointsSuffix}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </section>
  );
}
