import { useState } from "react";
import { CLIENT_EVENTS } from "@shared/protocol.js";
import { getSocket } from "../socket/connection";

type JoinProps = {
  roomCode: string;
};

export function Join({ roomCode }: JoinProps) {
  const [name, setName] = useState("");

  function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    getSocket().emit(CLIENT_EVENTS.joinRoom, { roomCode, name: name.trim() });
  }

  return (
    <main>
      <h1>הצטרפות לחדר {roomCode}</h1>
      <form onSubmit={handleJoin}>
        <label>
          השם שלך
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="השם שלך"
            autoComplete="off"
          />
        </label>
        <button type="submit">הצטרף/י</button>
      </form>
    </main>
  );
}
