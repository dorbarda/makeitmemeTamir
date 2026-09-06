import { useState } from "react";
import { CLIENT_EVENTS, SERVER_EVENTS, type ProtocolError } from "@shared/protocol.js";
import { HEBREW_UI } from "@shared/messages.js";
import { getSocket } from "../socket/connection";
import { graphemesRemaining, clampForInput } from "../names/nameInput";

export function Home() {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);

  function handleCreateRoom(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setError(undefined);
    const socket = getSocket();
    const onError = (err: ProtocolError) => {
      setError(err.messageHe);
      cleanup();
    };
    function cleanup() {
      socket.off(SERVER_EVENTS.error, onError);
    }
    socket.once(SERVER_EVENTS.error, onError);
    socket.emit(CLIENT_EVENTS.createRoom, { name: name.trim() });
  }

  return (
    <main>
      <h1>מסיבת הממים של תמיר</h1>
      <form onSubmit={handleCreateRoom}>
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
        <button type="submit">{HEBREW_UI.createButton}</button>
        {error && <p role="alert">{error}</p>}
      </form>
    </main>
  );
}
