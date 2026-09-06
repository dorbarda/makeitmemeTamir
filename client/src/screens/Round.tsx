import { HEBREW_UI } from "@shared/messages.js";
import type { LobbySnapshot, RoomPhase } from "@shared/protocol.js";
import { Countdown } from "../components/Countdown";
import { WritingPanel } from "./round/WritingPanel";
import { RatingPanel } from "./round/RatingPanel";

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
 * snapshot says — no client-side phase inference. The countdown is mounted
 * unconditionally at the top so it is always visible (D-15) rather than
 * appearing only on some screens; it renders nothing itself when
 * `deadlineAt` is null. `WritingPanel` mounts only while `phase ===
 * "WRITING"` (plan 02-03); `RatingPanel` mounts only while `phase ===
 * "RATING"` (plan 02-04). During `REVEAL_BREAK` neither panel mounts — no
 * meme, no caption, nothing to tap during the break — only the heading and
 * countdown are shown.
 */
export function Round({ snapshot }: RoundProps) {
  const heading = snapshot.phase === "LOBBY" ? "" : PHASE_HEADINGS[snapshot.phase];

  return (
    <main>
      <Countdown deadlineAt={snapshot.deadlineAt} serverNow={snapshot.serverNow} />
      <h1>{heading}</h1>

      {snapshot.round && (
        <p>
          {HEBREW_UI.roundLabel} {snapshot.round.index} {HEBREW_UI.ofSeparator} {snapshot.round.total}
        </p>
      )}

      {snapshot.phase === "WRITING" && <WritingPanel snapshot={snapshot} />}
      {snapshot.phase === "RATING" && <RatingPanel snapshot={snapshot} />}

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
