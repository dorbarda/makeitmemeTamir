import type { LobbySnapshot } from "@shared/protocol.js";

type LobbyProps = {
  snapshot: LobbySnapshot;
};

export function Lobby({ snapshot }: LobbyProps) {
  return (
    <main>
      <h1>חדר {snapshot.roomCode}</h1>
      <p>
        {snapshot.readyCount} / {snapshot.players.length} מחוברים
      </p>
      <ul>
        {snapshot.players.map((player) => (
          <li key={player.id}>
            {player.name}
            {player.isHost ? " (מארח/ת)" : ""} — {player.connected ? "מחובר/ת" : "מנותק/ת"}
          </li>
        ))}
      </ul>
    </main>
  );
}
