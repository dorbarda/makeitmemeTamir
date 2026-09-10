import { HEBREW_UI } from "@shared/messages.js";
import type { LobbySnapshot, RoomPhase } from "@shared/protocol.js";
import { Countdown } from "../components/Countdown";
import { WritingPanel } from "./round/WritingPanel";
import { RatingPanel } from "./round/RatingPanel";
import { RoundEndPanel } from "./round/RoundEndPanel";
import { GameEndPanel } from "./round/GameEndPanel";
import { HostControls } from "./round/HostControls";

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
 * "RATING"` (plan 02-04); `RoundEndPanel` mounts only for `"ROUND_END"` and
 * `GameEndPanel` mounts only for `"GAME_END"` (plan 04-02 split what used to
 * be one shared panel into these two dedicated components). During
 * `REVEAL_BREAK` no panel mounts — no
 * meme, no caption, nothing to tap during the break — only the heading and
 * countdown are shown. The countdown already renders nothing once
 * `deadlineAt` is null, so `GAME_END`'s terminal, timer-less state needs no
 * extra branch here.
 *
 * The baseline roster below only mounts for phases where no panel already
 * lists every player: `WritingPanel` shows the same names with a submission
 * checkmark, `RoundEndPanel` shows them ranked with their score, and
 * `GameEndPanel` shows the winner banner plus that same scoreboard — this
 * screen showing a third, plainer copy of the same list read as a visible
 * duplicate bug (reported during the Phase 3 real-phone playtest). `RATING`
 * and `REVEAL_BREAK` have no player list of their own, so it still mounts
 * there.
 */
const PANEL_ALREADY_LISTS_PLAYERS: ReadonlySet<RoomPhase> = new Set(["WRITING", "ROUND_END", "GAME_END"]);

export function Round({ snapshot }: RoundProps) {
  const heading = snapshot.phase === "LOBBY" ? "" : PHASE_HEADINGS[snapshot.phase];
  const isGameEnd = snapshot.phase === "GAME_END";

  return (
    <main className={isGameEnd ? "hero-bg" : undefined}>
      <Countdown deadlineAt={snapshot.deadlineAt} serverNow={snapshot.serverNow} />
      <h1>{heading}</h1>

      {snapshot.round && (
        <p>
          {HEBREW_UI.roundLabel} {snapshot.round.index} {HEBREW_UI.ofSeparator} {snapshot.round.total}
        </p>
      )}

      {snapshot.phase === "WRITING" && <WritingPanel snapshot={snapshot} />}
      {snapshot.phase === "RATING" && <RatingPanel snapshot={snapshot} />}
      {snapshot.phase === "ROUND_END" && <RoundEndPanel snapshot={snapshot} />}
      {snapshot.phase === "GAME_END" && <GameEndPanel snapshot={snapshot} />}

      {snapshot.you.isHost && <HostControls snapshot={snapshot} />}

      {!PANEL_ALREADY_LISTS_PLAYERS.has(snapshot.phase) && (
        <ul>
          {snapshot.players.map((player) => (
            <li key={player.id} className={player.connected ? undefined : "player--disconnected"}>
              {player.name}
              {!player.connected && ` ${HEBREW_UI.disconnectedTag}`}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
