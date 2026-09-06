import { useEffect, useState } from "react";
import { CLIENT_EVENTS, SERVER_EVENTS, type LobbySnapshot, type ProtocolError } from "@shared/protocol.js";
import { HEBREW_UI } from "@shared/messages.js";
import { getSocket } from "../socket/connection";
import { graphemesRemaining, clampForInput } from "../names/nameInput";

type LobbyProps = {
  snapshot: LobbySnapshot;
};

export function Lobby({ snapshot }: LobbyProps) {
  const you = snapshot.players.find((p) => p.id === snapshot.you.id);
  const [renameValue, setRenameValue] = useState(you?.name ?? "");
  const [renameError, setRenameError] = useState<string | undefined>(undefined);

  // The roster only ever changes when a fresh snapshot arrives — never
  // optimistically. Re-seed the field whenever our own stored name changes
  // (e.g. after a successful rename, or a name we typed pre-truncation).
  useEffect(() => {
    setRenameValue(you?.name ?? "");
  }, [you?.name]);

  function handleRename(e: React.FormEvent) {
    e.preventDefault();
    setRenameError(undefined);

    const socket = getSocket();
    const onError = (err: ProtocolError) => {
      setRenameError(err.messageHe);
      cleanup();
    };
    const onState = () => {
      // Success — the next snapshot (already on its way) carries the new
      // name; nothing to assume here.
      cleanup();
    };
    function cleanup() {
      socket.off(SERVER_EVENTS.error, onError);
      socket.off(SERVER_EVENTS.state, onState);
    }

    socket.once(SERVER_EVENTS.error, onError);
    socket.once(SERVER_EVENTS.state, onState);
    socket.emit(CLIENT_EVENTS.rename, { name: renameValue });
  }

  return (
    <main>
      <h1>חדר {snapshot.roomCode}</h1>
      <p>
        {HEBREW_UI.playersInRoom}: {snapshot.readyCount} / {snapshot.players.length} מחוברים
      </p>
      {!snapshot.canStart && <p>{HEBREW_UI.waitingForPlayers}</p>}
      <ul>
        {snapshot.players.map((player) => (
          <li key={player.id}>
            {player.name}
            {player.isHost ? " (מארח/ת)" : ""} — {player.connected ? "מחובר/ת" : "מנותק/ת"}
          </li>
        ))}
      </ul>

      {snapshot.phase === "LOBBY" && (
        <form onSubmit={handleRename}>
          <label>
            {HEBREW_UI.renameButton}
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(clampForInput(e.target.value))}
              placeholder={HEBREW_UI.namePlaceholder}
              autoComplete="off"
            />
            <span>{graphemesRemaining(renameValue)}</span>
          </label>
          <button type="submit">{HEBREW_UI.renameButton}</button>
          {renameError && <p role="alert">{renameError}</p>}
        </form>
      )}
    </main>
  );
}
