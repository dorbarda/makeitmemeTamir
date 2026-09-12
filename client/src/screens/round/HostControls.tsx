import { useState } from "react";
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  type LobbySnapshot,
  type ProtocolError,
} from "@shared/protocol.js";
import { HEBREW_ERRORS, HEBREW_UI } from "@shared/messages.js";
import { getSocket } from "../../socket/connection";
import { otherRemovablePlayers, formatRemovePlayerConfirm } from "./hostControlsHelpers";

type HostControlsProps = { snapshot: LobbySnapshot };

type PendingAction = "skipRound" | "endGame" | "restartGame" | "removePlayer" | null;

// Confirmation copy for the three no-target actions, keyed by PendingAction.
// removePlayer's own confirmation copy is built separately (it needs the
// interpolated target name) and is never looked up here.
const CONFIRM_COPY: Record<Exclude<PendingAction, "removePlayer" | null>, string> = {
  skipRound: HEBREW_UI.skipRoundConfirm,
  endGame: HEBREW_UI.endGameConfirm,
  restartGame: HEBREW_UI.restartGameConfirm,
};

/**
 * The host-only "break glass" recovery panel (LIVE-04 through LIVE-07).
 * Never renders for a non-host — matching `Lobby.tsx`'s own `isHost` gate,
 * never merely CSS-hidden. Every action is confirm-BEFORE-send: nothing is
 * emitted to the server until the confirmation modal's own confirm button is
 * tapped, resolving the UI-SPEC's own internal inconsistency in favor of its
 * literal "{action} בטוח?" confirmation-gate copy and its explicit
 * "Cancel: ... no server action is sent" rule — a modal that asks "are you
 * sure?" after the action already fired would be actively misleading during
 * a live party.
 */
export function HostControls({ snapshot }: HostControlsProps) {
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [removeListOpen, setRemoveListOpen] = useState(false);
  const [targetPlayer, setTargetPlayer] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);

  // Defensive — Round.tsx's own gate (Task 3) already keeps this component
  // from mounting for a non-host at all.
  if (!snapshot.you.isHost) return null;

  function closeModal() {
    setPendingAction(null);
    setTargetPlayer(null);
    setError(undefined);
  }

  function confirm() {
    if (pendingAction === null) return;

    const socket = getSocket();
    const onError = (err: ProtocolError) => {
      setError(HEBREW_ERRORS[err.code]);
      cleanup();
    };
    const onState = () => {
      // Success — the next snapshot (already on its way) carries the new
      // state; this screen has no optimistic mutation of its own.
      closeModal();
      cleanup();
    };
    function cleanup() {
      socket.off(SERVER_EVENTS.error, onError);
      socket.off(SERVER_EVENTS.state, onState);
    }

    socket.once(SERVER_EVENTS.error, onError);
    socket.once(SERVER_EVENTS.state, onState);

    if (pendingAction === "removePlayer") {
      if (!targetPlayer) return;
      socket.emit(CLIENT_EVENTS.removePlayer, { targetPlayerId: targetPlayer.id });
    } else if (pendingAction === "skipRound") {
      socket.emit(CLIENT_EVENTS.skipRound, {});
    } else if (pendingAction === "endGame") {
      socket.emit(CLIENT_EVENTS.endGame, {});
    } else if (pendingAction === "restartGame") {
      socket.emit(CLIENT_EVENTS.restartGame, {});
    }
  }

  const others = removeListOpen ? otherRemovablePlayers(snapshot.players, snapshot.you.id) : [];

  const confirmCopy =
    pendingAction === "removePlayer" && targetPlayer
      ? formatRemovePlayerConfirm(HEBREW_UI.removePlayerConfirm, targetPlayer.name)
      : pendingAction && pendingAction !== "removePlayer"
        ? CONFIRM_COPY[pendingAction]
        : "";

  return (
    <section className="host-controls-panel">
      <h2>{HEBREW_UI.hostControlsHeading}</h2>
      <div className="host-controls-grid">
        <button
          type="button"
          className="host-controls-button"
          onClick={() => setPendingAction("skipRound")}
        >
          {HEBREW_UI.skipRoundButton}
        </button>
        <button
          type="button"
          className="host-controls-button"
          onClick={() => setRemoveListOpen(true)}
        >
          {HEBREW_UI.removePlayerButton}
        </button>
        <button
          type="button"
          className="host-controls-button"
          onClick={() => setPendingAction("endGame")}
        >
          {HEBREW_UI.endGameButton}
        </button>
        <button
          type="button"
          className="host-controls-button"
          onClick={() => setPendingAction("restartGame")}
        >
          {HEBREW_UI.restartGameButton}
        </button>
      </div>

      {removeListOpen && (
        <div className="host-modal-overlay">
          <div className="host-modal">
            {others.length === 0 ? (
              <>
                <p>{HEBREW_UI.removePlayerEmptyState}</p>
                <button type="button" onClick={() => setRemoveListOpen(false)}>
                  {HEBREW_UI.cancelButton}
                </button>
              </>
            ) : (
              <ul>
                {others.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setTargetPlayer({ id: p.id, name: p.name });
                        setRemoveListOpen(false);
                        setPendingAction("removePlayer");
                      }}
                    >
                      {p.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {pendingAction !== null && (
        <div className="host-modal-overlay">
          <div className="host-modal">
            {error ? (
              <>
                <p role="alert">{error}</p>
                <button type="button" onClick={closeModal}>
                  {HEBREW_UI.cancelButton}
                </button>
              </>
            ) : (
              <>
                <p>{confirmCopy}</p>
                <div className="host-modal-actions">
                  <button type="button" onClick={closeModal}>
                    {HEBREW_UI.cancelButton}
                  </button>
                  <button type="button" onClick={confirm}>
                    {HEBREW_UI.confirmButton}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
