import { HEBREW_UI } from "@shared/messages.js";
import type { LobbySnapshot, RoomPhase } from "@shared/protocol.js";

type RoundProps = {
  snapshot: LobbySnapshot;
};

// Every non-LOBBY phase gets its own heading; LOBBY never reaches this
// screen (App.tsx renders Lobby for it instead).
const PHASE_HEADINGS: Record<Exclude<RoomPhase, "LOBBY">, string> = {
  WRITING: HEBREW_UI.writingHeading,
  REVEAL_BREAK: HEBREW_UI.revealBreakHeading,
  RATING: HEBREW_UI.ratingHeading,
  ROUND_END: HEBREW_UI.roundEndHeading,
  GAME_END: HEBREW_UI.gameEndHeading,
};

/**
 * The in-game screen for every phase after LOBBY. Renders only what the
 * snapshot says — no client-side phase inference, no local timer state yet
 * (that's Task 2's Countdown component). Phase-specific content (the caption
 * form, the rating step) mounts at the two commented points below in plans
 * 02-03 and 02-04.
 */
export function Round({ snapshot }: RoundProps) {
  const heading = snapshot.phase === "LOBBY" ? "" : PHASE_HEADINGS[snapshot.phase];

  return (
    <main>
      <h1>{heading}</h1>

      {snapshot.round && (
        <p>
          {HEBREW_UI.roundLabel} {snapshot.round.index} {HEBREW_UI.ofSeparator} {snapshot.round.total}
        </p>
      )}

      {/* Mount point: writing panel (caption form + progress) — plan 02-03 */}

      {/* Mount point: rating panel (one meme at a time) — plan 02-04 */}

      <ul>
        {snapshot.players.map((player) => (
          <li key={player.id} className={player.connected ? undefined : "player--disconnected"}>
            {player.name}
            {!player.connected && ` ${HEBREW_UI.disconnectedTag}`}
          </li>
        ))}
      </ul>
    </main>
  );
}
