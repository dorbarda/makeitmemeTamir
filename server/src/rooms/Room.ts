import { randomUUID } from "node:crypto";
import type { Server } from "socket.io";
import {
  SERVER_EVENTS,
  type LobbySnapshot,
  type PlayerView,
  type RoomPhase,
} from "@shared/protocol.js";
import { MIN_PLAYERS_TO_START, ROOM_CAPACITY, ROSTER_FADE_GRACE_MS } from "../config.js";
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

  /**
   * Invoked whenever a delayed internal timer (a roster fade, and later a
   * host transfer) mutates room state on its own, after the socket call
   * that triggered it has long since returned — the caller (handlers.ts,
   * the one place `io` is naturally in scope at room-creation time) wires
   * this to `() => room.broadcast(io)` right after the room is created.
   * Left `undefined` in tests that exercise these timers directly against a
   * bare `Room` with no live socket server — Room itself never imports
   * `Server` as a hard dependency of its own timer logic.
   */
  onStateChanged?: () => void;

  private fadeTimers = new Map<string, ReturnType<typeof setTimeout>>();

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

  /**
   * Marks a returning player as connected again (rejoin). Cancels that
   * player's pending roster-fade removal, if any (D-13).
   */
  attach(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) return;

    player.connected = true;
    this.clearFadeTimer(playerId);
  }

  /**
   * Marks a player as disconnected without removing their record. In the
   * lobby, schedules that player's removal after `ROSTER_FADE_GRACE_MS`
   * (D-13) — a re-disconnect always restarts this clock from scratch rather
   * than letting an earlier timer fire late. Once play has begun the player
   * is kept indefinitely with their score intact (D-17) and nothing is
   * scheduled at all.
   */
  detach(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) return;

    player.connected = false;

    if (this.phase === "LOBBY") {
      this.scheduleFade(playerId);
    }
  }

  private scheduleFade(playerId: string): void {
    this.clearFadeTimer(playerId);
    const timer = setTimeout(() => {
      this.fadeTimers.delete(playerId);
      this.players.delete(playerId);
      this.onStateChanged?.();
    }, ROSTER_FADE_GRACE_MS);
    this.fadeTimers.set(playerId, timer);
  }

  private clearFadeTimer(playerId: string): void {
    const timer = this.fadeTimers.get(playerId);
    if (timer) {
      clearTimeout(timer);
      this.fadeTimers.delete(playerId);
    }
  }

  /**
   * Clears every pending timer this room owns. Must be called wherever a
   * room is torn down, so a fade callback scheduled before teardown can
   * never fire against a room that no longer exists.
   */
  dispose(): void {
    for (const timer of this.fadeTimers.values()) {
      clearTimeout(timer);
    }
    this.fadeTimers.clear();
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
