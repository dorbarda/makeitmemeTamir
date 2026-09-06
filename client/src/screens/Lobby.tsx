import { useEffect, useState } from "react";
import { CLIENT_EVENTS, SERVER_EVENTS, type LobbySnapshot, type ProtocolError } from "@shared/protocol.js";
import { HEBREW_ERRORS, HEBREW_UI } from "@shared/messages.js";
import { getSocket } from "../socket/connection";
import { graphemesRemaining, clampForInput } from "../names/nameInput";
import { shareJoinLink } from "../share/shareJoinLink";

type LobbyProps = {
  snapshot: LobbySnapshot;
};

export function Lobby({ snapshot }: LobbyProps) {
  const you = snapshot.players.find((p) => p.id === snapshot.you.id);
  const [renameValue, setRenameValue] = useState(you?.name ?? "");
  const [renameError, setRenameError] = useState<string | undefined>(undefined);
  const [copied, setCopied] = useState(false);

  // The roster only ever changes when a fresh snapshot arrives — never
  // optimistically. Re-seed the field whenever our own stored name changes
  // (e.g. after a successful rename, or a name we typed pre-truncation).
  useEffect(() => {
    setRenameValue(you?.name ?? "");
  }, [you?.name]);

  // The copied confirmation is a brief toast, not a permanent label.
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 3000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  function handleRename(e: React.FormEvent) {
    e.preventDefault();
    setRenameError(undefined);

    const socket = getSocket();
    const onError = (err: ProtocolError) => {
      // Looked up locally rather than trusting err.messageHe verbatim, so
      // the player always sees this client build's current Hebrew wording.
      setRenameError(HEBREW_ERRORS[err.code]);
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

  async function handleShare() {
    const result = await shareJoinLink(snapshot.joinUrl);
    if (result.outcome === "shared" || result.outcome === "dismissed") return;

    // Fallback: open the WhatsApp invitation (the real distribution channel
    // for this party, D-02) and also copy the link so a browser with
    // neither a share sheet nor a WhatsApp handler can still paste it.
    window.open(result.whatsAppUrl, "_blank", "noopener,noreferrer");
    try {
      await navigator.clipboard.writeText(snapshot.joinUrl);
      setCopied(true);
    } catch {
      // Clipboard API unavailable or denied — the WhatsApp tab still opened.
    }
  }

  return (
    <main>
      {/* The code, the QR and the share control are rendered for every
          player, never gated on snapshot.you.isHost (D-12) — isHost stays in
          the snapshot for the server's own use and for plan 01-04's transfer
          logic, but no crown/badge is shown here (deliberately declined). */}
      <p>{HEBREW_UI.roomCodeLabel}</p>
      <p className="room-code">{snapshot.roomCode}</p>

      {snapshot.qrDataUrl && (
        <>
          <img className="qr-code" src={snapshot.qrDataUrl} alt={HEBREW_UI.scanToJoin} />
          <p>{HEBREW_UI.scanToJoin}</p>
        </>
      )}

      <button type="button" onClick={handleShare}>
        {HEBREW_UI.shareButton}
      </button>
      {copied && <p role="status">{HEBREW_UI.copiedToast}</p>}

      <p>
        {snapshot.readyCount} / {snapshot.capacity} {HEBREW_UI.connectedCount}
      </p>
      {snapshot.canStart ? (
        <p>{HEBREW_UI.readyToStart}</p>
      ) : (
        <p>{HEBREW_UI.waitingForPlayers}</p>
      )}

      <ul>
        {snapshot.players.map((player) => (
          <li key={player.id} className={player.connected ? undefined : "player--disconnected"}>
            {player.name}
            {!player.connected && " (מנותק/ת)"}
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
