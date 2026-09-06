import { randomUUID } from "node:crypto";
import type { Server } from "socket.io";
import {
  SERVER_EVENTS,
  type LobbySnapshot,
  type PlayerView,
  type RoomPhase,
} from "@shared/protocol.js";
import { MIN_PLAYERS_TO_START, ROOM_CAPACITY } from "../config.js";
import { normalizeForCompare } from "../names/nameValidation.js";
import type { Player } from "../players/Player.js";

/** Result of a rename attempt — never throws, always tells the caller why. */
export type RenameOutcome =
  | { ok: true; name: string }
  | { ok: false; error: "NAME_LOCKED" | "NAME_REQUIRED" };

export class Room {
  readonly code: string;
  /** Computed once at creation and cached — see RoomManager.createRoom. */
  readonly joinUrl: string;
  /** Computed once at creation and cached — see RoomManager.createRoom. */
  readonly qrDataUrl: string;
  phase: RoomPhase = "LOBBY";
  players = new Map<string, Player>();
  hostId: string | null = null;

  constructor(code: string, joinUrl: string, qrDataUrl: string) {
    this.code = code;
    this.joinUrl = joinUrl;
    this.qrDataUrl = qrDataUrl;
  }

  get isFull(): boolean {
    return this.players.size >= ROOM_CAPACITY;
  }

  /**
   * Adds a brand-new player using a token already issued by SessionRegistry.
   * `name` must already be sanitized and truncated by the caller — this only
   * resolves collisions against the room's current roster (D-07).
   */
  addPlayer(name: string, token: string): Player {
    const player: Player = {
      id: randomUUID(),
      token,
      name: this.resolveDisplayName(name),
      connected: true,
      score: 0,
    };
    this.players.set(player.id, player);
    if (this.hostId === null) {
      this.hostId = player.id;
    }
    return player;
  }

  /**
   * Resolves a candidate display name against the room's current roster:
   * returns it unchanged if free, otherwise appends the first free
   * "<candidate> <n>" suffix starting from 2 (D-07 — never rejects).
   * `excludePlayerId` lets a self-rename skip colliding with its own current
   * entry.
   */
  resolveDisplayName(candidate: string, excludePlayerId?: string): string {
    const taken = new Set(
      [...this.players.values()]
        .filter((p) => p.id !== excludePlayerId)
        .map((p) => normalizeForCompare(p.name)),
    );

    if (!taken.has(normalizeForCompare(candidate))) return candidate;

    let n = 2;
    while (taken.has(normalizeForCompare(`${candidate} ${n}`))) n++;
    return `${candidate} ${n}`;
  }

  /**
   * Renames a player already in this room. `candidate` must already be
   * sanitized and truncated by the caller. Refuses (never throws) with
   * NAME_LOCKED once the room has left LOBBY (D-09) or NAME_REQUIRED for an
   * empty candidate. Renaming to one's own current name is a no-op — it
   * never gets suffixed against itself.
   */
  renamePlayer(playerId: string, candidate: string): RenameOutcome {
    const player = this.players.get(playerId);
    if (!player) {
      // Caller validates the playerId->room binding before calling this;
      // unreachable in normal operation, but fails closed rather than
      // silently renaming nothing.
      return { ok: false, error: "NAME_REQUIRED" };
    }

    if (this.phase !== "LOBBY") {
      return { ok: false, error: "NAME_LOCKED" };
    }

    if (candidate.length === 0) {
      return { ok: false, error: "NAME_REQUIRED" };
    }

    if (normalizeForCompare(candidate) === normalizeForCompare(player.name)) {
      return { ok: true, name: player.name };
    }

    const resolved = this.resolveDisplayName(candidate, playerId);
    player.name = resolved;
    return { ok: true, name: resolved };
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
      joinUrl: this.joinUrl,
      qrDataUrl: this.qrDataUrl,
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
