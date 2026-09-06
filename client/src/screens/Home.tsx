import { useState } from "react";
import { CLIENT_EVENTS, SERVER_EVENTS, type ProtocolError } from "@shared/protocol.js";
import { HEBREW_ERRORS, HEBREW_UI } from "@shared/messages.js";
import { getSocket } from "../socket/connection";
import { graphemesRemaining, clampForInput } from "../names/nameInput";

type HomeProps = {
  /** Navigates to the manual 4-digit fallback (D-04) for someone who opened
   * the bare origin but has a code to type rather than a link to tap. */
  onHaveCode: () => void;
};

export function Home({ onHaveCode }: HomeProps) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);

  function handleCreateRoom(e: React.FormEvent) {
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
      <button type="button" onClick={onHaveCode}>
        {HEBREW_UI.haveACode}
      </button>
    </main>
  );
}
