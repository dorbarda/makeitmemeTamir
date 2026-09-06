import { randomUUID } from "node:crypto";
import type { Server } from "socket.io";
import {
  SERVER_EVENTS,
  type LobbySnapshot,
  type PlayerView,
  type RoomPhase,
} from "@shared/protocol.js";
import { MIN_PLAYERS_TO_START, ROOM_CAPACITY } from "../config.js";
import type { Player } from "../players/Player.js";

export class Room {
  readonly code: string;
  phase: RoomPhase = "LOBBY";
  players = new Map<string, Player>();
  hostId: string | null = null;

  constructor(code: string) {
    this.code = code;
  }

  get isFull(): boolean {
    return this.players.size >= ROOM_CAPACITY;
  }

  /** Adds a brand-new player using a token already issued by SessionRegistry. */
  addPlayer(name: string, token: string): Player {
    const player: Player = {
      id: randomUUID(),
      token,
      name,
      connected: true,
      score: 0,
    };
    this.players.set(player.id, player);
    if (this.hostId === null) {
      this.hostId = player.id;
    }
    return player;
  }

  /** Marks a returning player as connected again (rejoin). */
  attach(playerId: string): void {
    const player = this.players.get(playerId);
    if (player) player.connected = true;
  }

  /** Marks a player as disconnected without removing their record. */
  detach(playerId: string): void {
    const player = this.players.get(playerId);
    if (player) player.connected = false;
  }

  snapshotFor(playerId: string): LobbySnapshot {
    const players: PlayerView[] = [...this.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      connected: p.connected,
      isHost: p.id === this.hostId,
      score: p.score,
    }));

    const readyCount = players.filter((p) => p.connected).length;

    return {
      phase: this.phase,
      roomCode: this.code,
      joinUrl: "", // filled by plan 01-03
      qrDataUrl: "", // filled by plan 01-03
      players,
      readyCount,
      capacity: ROOM_CAPACITY,
      canStart: this.players.size >= MIN_PLAYERS_TO_START,
      you: { id: playerId, isHost: playerId === this.hostId },
    };
  }

  /**
   * Sends every connected socket in this room its own personalized snapshot.
   * Single-process only (per PROJECT.md) — iterates the in-memory socket map
   * directly rather than the adapter, so no `fetchSockets()` round trip is needed.
   */
  broadcast(io: Server): void {
    for (const socket of io.sockets.sockets.values()) {
      const playerId = socket.data?.playerId as string | undefined;
      if (playerId && socket.rooms.has(this.code) && this.players.has(playerId)) {
        socket.emit(SERVER_EVENTS.state, this.snapshotFor(playerId));
      }
    }
  }
}
