import { useState } from "react";
import { CLIENT_EVENTS } from "@shared/protocol.js";
import { getSocket } from "../socket/connection";

export function Home() {
  const [name, setName] = useState("");

  function handleCreateRoom(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    getSocket().emit(CLIENT_EVENTS.createRoom, { name: name.trim() });
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
            onChange={(e) => setName(e.target.value)}
            placeholder="השם שלך"
            autoComplete="off"
          />
        </label>
        <button type="submit">פתח חדר חדש</button>
      </form>
    </main>
  );
}
