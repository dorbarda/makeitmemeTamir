import { useState } from "react";
import { CLIENT_EVENTS, SERVER_EVENTS, type ProtocolError } from "@shared/protocol.js";
import { HEBREW_ERRORS, HEBREW_UI } from "@shared/messages.js";
import { getSocket } from "../socket/connection";
import { graphemesRemaining, clampForInput } from "../names/nameInput";

type JoinProps = {
  roomCode: string;
};

export function Join({ roomCode }: JoinProps) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);

  function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setError(undefined);
    const socket = getSocket();
    const onError = (err: ProtocolError) => {
      // Looked up locally rather than trusting err.messageHe verbatim, so
      // the player always sees this client build's current Hebrew wording.
      setError(HEBREW_ERRORS[err.code]);
      cleanup();
    };
    function cleanup() {
      socket.off(SERVER_EVENTS.error, onError);
    }
    socket.once(SERVER_EVENTS.error, onError);
    socket.emit(CLIENT_EVENTS.joinRoom, { roomCode, name: name.trim() });
  }

  return (
    <main>
      <h1>
        {HEBREW_UI.joiningRoomPrefix} {roomCode}
      </h1>
      <form onSubmit={handleJoin}>
        <label>
          השם שלך
          <input
            type="text"
            value={name}
            onChange={(e) => setName(clampForInput(e.target.value))}
            placeholder={HEBREW_UI.namePlaceholder}
            autoComplete="off"
          />
          <span>{graphemesRemaining(name)}</span>
        </label>
        <button type="submit">{HEBREW_UI.joinButton}</button>
        {error && <p role="alert">{error}</p>}
      </form>
    </main>
  );
}
