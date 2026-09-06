import { useState } from "react";
import { CLIENT_EVENTS, SERVER_EVENTS, type ProtocolError } from "@shared/protocol.js";
import { HEBREW_ERRORS, HEBREW_UI } from "@shared/messages.js";
import { getSocket } from "../socket/connection";
import { graphemesRemaining, clampForInput } from "../names/nameInput";

const CODE_LENGTH = 4;

/** Keeps only digits and caps the length — the client-side half of D-01's
 * numeric-keypad rationale. Convenience only: the server is the authoritative
 * check, and a short or non-numeric code is refused there regardless. */
function sanitizeCodeInput(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, CODE_LENGTH);
}

type JoinByCodeProps = {
  onJoined: (roomCode: string) => void;
};

/** The manual 4-digit fallback (D-04) for anyone not in the WhatsApp group —
 * a single screen collecting both the code and a display name, submitting
 * straight to the same `join-room` intent the deep link's Join screen uses. */
export function JoinByCode({ onJoined }: JoinByCodeProps) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);

  function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== CODE_LENGTH || !name.trim()) return;

    setError(undefined);
    const socket = getSocket();
    const onError = (err: ProtocolError) => {
      // Looked up locally rather than trusting err.messageHe verbatim, so
      // the player always sees this client build's current Hebrew wording.
      // The typed code and name are never cleared on error (state above is
      // untouched here) — the player can fix a typo and retry immediately.
      setError(HEBREW_ERRORS[err.code]);
      cleanup();
    };
    const onState = () => {
      // Success — normalize the address bar to /join/<code> so a refresh
      // keeps working, without a full page reload.
      cleanup();
      onJoined(code);
    };
    function cleanup() {
      socket.off(SERVER_EVENTS.error, onError);
      socket.off(SERVER_EVENTS.state, onState);
    }
    socket.once(SERVER_EVENTS.error, onError);
    socket.once(SERVER_EVENTS.state, onState);
    socket.emit(CLIENT_EVENTS.joinRoom, { roomCode: code, name: name.trim() });
  }

  return (
    <main>
      <h1>{HEBREW_UI.enterCodeTitle}</h1>
      <form onSubmit={handleJoin}>
        <label>
          {HEBREW_UI.codePlaceholder}
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            maxLength={CODE_LENGTH}
            value={code}
            onChange={(e) => setCode(sanitizeCodeInput(e.target.value))}
            placeholder={HEBREW_UI.codePlaceholder}
          />
        </label>
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
