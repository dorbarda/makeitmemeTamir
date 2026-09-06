import { randomUUID } from "node:crypto";
import type { Server } from "socket.io";
import {
  SERVER_EVENTS,
  type GameSettings,
  type LobbySnapshot,
  type PlayerView,
  type RoomPhase,
  type SettingsOptions,
} from "@shared/protocol.js";
import {
  BETWEEN_PHASES_MS,
  DEFAULT_RATING_SECONDS,
  DEFAULT_ROUND_COUNT,
  DEFAULT_WRITING_SECONDS,
  HOST_TRANSFER_GRACE_MS,
  MIN_PLAYERS_TO_START,
  RATING_SECONDS_PRESETS,
  ROOM_CAPACITY,
  ROSTER_FADE_GRACE_MS,
  ROUND_COUNT_PRESETS,
  WRITING_SECONDS_PRESETS,
} from "../config.js";
import { normalizeForCompare } from "../names/nameValidation.js";
import type { Player } from "../players/Player.js";

/** Result of a rename attempt — never throws, always tells the caller why. */
export type RenameOutcome =
  | { ok: true; name: string }
  | { ok: false; error: "NAME_LOCKED" | "NAME_REQUIRED" };

/** Result of a start-game attempt — never throws, always tells the caller why. */
export type StartGameOutcome =
  | { ok: true }
  | { ok: false; error: "NOT_HOST" | "WRONG_PHASE" | "NOT_ENOUGH_PLAYERS" };

export class Room {
  readonly code: string;
  /** Computed once at creation and cached — see RoomManager.createRoom. */
  readonly joinUrl: string;
  /** Computed once at creation and cached — see RoomManager.createRoom. */
  readonly qrDataUrl: string;
  phase: RoomPhase = "LOBBY";
  players = new Map<string, Player>();
  hostId: string | null = null;

  /** D-01/D-02 — seeded from the three DEFAULT_* constants, host-adjustable
   * pre-game via `change-settings` (plan 02-02), locked the moment the game
   * starts. Every round transition reads this, never a DEFAULT_* constant
   * directly, so a host who changed a setting is never silently ignored. */
  settings: GameSettings = {
    rounds: DEFAULT_ROUND_COUNT,
    writingSeconds: DEFAULT_WRITING_SECONDS,
    ratingSeconds: DEFAULT_RATING_SECONDS,
  };
  /** D-05 — true from the moment the game starts; settings are immutable
   * after that for the lifetime of the room. */
  settingsLocked = false;
  /** 1-based once play starts; 0 while still in LOBBY. */
  roundIndex = 0;
  /** D-12 — the absolute epoch-ms deadline for the current live phase, or
   * null in LOBBY/GAME_END. The single source of truth `snapshotFor` reads;
   * never a "seconds remaining" value. */
  deadlineAt: number | null = null;

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
  private hostTransferTimer: ReturnType<typeof setTimeout> | null = null;
  /** The single round-clock timer primitive — only one phase is ever "live"
   * at a time, so unlike `fadeTimers` this needs no map. Follows the exact
   * same schedule/clear/dispose shape as `fadeTimers`/`hostTransferTimer`. */
  private phaseTimer: ReturnType<typeof setTimeout> | null = null;
  private nextJoinSeq = 0;

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
      joinedAt: this.nextJoinSeq++,
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
   * player's pending roster-fade removal, if any (D-13), and cancels a
   * pending host-transfer countdown if the returning player is the current
   * host reconnecting in time (D-16).
   */
  attach(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) return;

    player.connected = true;
    this.clearFadeTimer(playerId);
    if (playerId === this.hostId) {
      this.clearHostTransferTimer();
    }
  }

  /**
   * Marks a player as disconnected without removing their record. In the
   * lobby, schedules that player's removal after `ROSTER_FADE_GRACE_MS`
   * (D-13) — a re-disconnect always restarts this clock from scratch rather
   * than letting an earlier timer fire late. Once play has begun the player
   * is kept indefinitely with their score intact (D-17) and nothing is
   * scheduled at all. If the detaching player currently holds `hostId`,
   * separately schedules a host-transfer countdown (D-16) regardless of
   * phase, since a dead host is a problem whether or not the game has
   * started.
   */
  detach(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) return;

    player.connected = false;

    if (this.phase === "LOBBY") {
      this.scheduleFade(playerId);
    }

    if (playerId === this.hostId) {
      this.scheduleHostTransfer();
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

  private scheduleHostTransfer(): void {
    this.clearHostTransferTimer();
    this.hostTransferTimer = setTimeout(() => {
      this.hostTransferTimer = null;
      this.transferHost();
    }, HOST_TRANSFER_GRACE_MS);
  }

  private clearHostTransferTimer(): void {
    if (this.hostTransferTimer) {
      clearTimeout(this.hostTransferTimer);
      this.hostTransferTimer = null;
    }
  }

  /**
   * Promotes the earliest-joined connected player to host (D-16). Chosen
   * deterministically — an arbitrary map entry would be untestable and
   * unexplainable to a room full of people watching it happen. Tolerates the
   * current `hostId` no longer being in `players` at all (the roster-fade
   * grace is shorter than the host-transfer grace, so a host who never
   * returns is typically removed from the roster before this ever fires).
   * If no connected player exists, leaves `hostId` untouched and returns
   * without throwing — the room stays usable if anyone reconnects. Takes no
   * arguments — there is no parameter a client-controlled caller could use
   * to name a successor; the only input is the room's own player map.
   */
  transferHost(): void {
    let successor: Player | undefined;
    for (const player of this.players.values()) {
      if (!player.connected) continue;
      if (!successor || player.joinedAt < successor.joinedAt) {
        successor = player;
      }
    }

    if (!successor) return;

    this.hostId = successor.id;
    this.onStateChanged?.();
  }

  /**
   * The single round-clock timer primitive every phase transition schedules
   * through. Clears any existing phase timer first (so a redundant call can
   * never leave two timers racing), stores the absolute deadline, and fires
   * `onExpire` once the deadline is reached — mutating state first and
   * notifying second, exactly like `scheduleFade`'s callback. `Room` must
   * never call `broadcast` from a timer: it has no hard dependency on
   * `Server`, only on the `onStateChanged` callback the caller wires up.
   */
  private schedulePhase(deadlineAt: number, onExpire: () => void): void {
    this.clearPhaseTimer();
    this.deadlineAt = deadlineAt;
    this.phaseTimer = setTimeout(
      () => {
        this.phaseTimer = null;
        onExpire();
        this.onStateChanged?.();
      },
      Math.max(0, deadlineAt - Date.now()),
    );
  }

  private clearPhaseTimer(): void {
    if (this.phaseTimer) {
      clearTimeout(this.phaseTimer);
      this.phaseTimer = null;
    }
  }

  /**
   * Starts the round engine (LOBBY-07). Host-only (T-02-01), requires the
   * room still be in LOBBY (T-02-11 — a double-tap can never schedule a
   * second concurrent phase timer), and requires the Phase 1 minimum of
   * `MIN_PLAYERS_TO_START` (D-06, unchanged). Never throws. On success locks
   * settings (D-05) and enters round 1's writing phase.
   */
  startGame(playerId: string): StartGameOutcome {
    if (playerId !== this.hostId) {
      return { ok: false, error: "NOT_HOST" };
    }
    if (this.phase !== "LOBBY") {
      return { ok: false, error: "WRONG_PHASE" };
    }
    if (this.players.size < MIN_PLAYERS_TO_START) {
      return { ok: false, error: "NOT_ENOUGH_PLAYERS" };
    }

    this.settingsLocked = true;
    this.roundIndex = 1;
    this.enterWriting();
    return { ok: true };
  }

  /**
   * Opens the writing phase for the current `roundIndex`, scheduling its
   * close from `this.settings.writingSeconds` — never from a DEFAULT_*
   * constant, so a host-changed setting is always honored.
   */
  private enterWriting(): void {
    this.phase = "WRITING";
    this.schedulePhase(Date.now() + this.settings.writingSeconds * 1000, () =>
      this.closeWriting(),
    );
  }

  /**
   * Writing has closed. In this plan there is no gameplay yet, so the round
   * always goes straight to its end; plan 02-04 inserts the rating-phase
   * branch in front of this.
   */
  private closeWriting(): void {
    this.enterRoundEnd();
  }

  /**
   * D-11's between-phases pacing beat, then either the next round's writing
   * phase or, after the last round, game end. Computed entirely from the
   * room's own state (`roundIndex`, `settings.rounds`) — no client input
   * names the next phase, matching `transferHost()`'s no-arguments rule.
   */
  private enterRoundEnd(): void {
    this.phase = "ROUND_END";
    this.schedulePhase(Date.now() + BETWEEN_PHASES_MS, () => {
      if (this.roundIndex < this.settings.rounds) {
        this.roundIndex++;
        this.enterWriting();
      } else {
        this.enterGameEnd();
      }
    });
  }

  /** Terminal: no timer, nothing further scheduled, no deadline. */
  private enterGameEnd(): void {
    this.phase = "GAME_END";
    this.clearPhaseTimer();
    this.deadlineAt = null;
  }

  /**
   * Clears every pending timer this room owns. Must be called wherever a
   * room is torn down, so a fade, host-transfer, or phase-timer callback
   * scheduled before teardown can never fire against a room that no longer
   * exists (T-02-10).
   */
  dispose(): void {
    for (const timer of this.fadeTimers.values()) {
      clearTimeout(timer);
    }
    this.fadeTimers.clear();
    this.clearHostTransferTimer();
    this.clearPhaseTimer();
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

    const settingsOptions: SettingsOptions = {
      rounds: ROUND_COUNT_PRESETS,
      writingSeconds: WRITING_SECONDS_PRESETS,
      ratingSeconds: RATING_SECONDS_PRESETS,
    };

    return {
      phase: this.phase,
      roomCode: this.code,
      joinUrl: this.joinUrl,
      qrDataUrl: this.qrDataUrl,
      players,
      readyCount,
      capacity: ROOM_CAPACITY,
      // Tightened beyond Phase 1's player-count-only gate: once the game has
      // left LOBBY, starting again is never offered (T-02-11).
      canStart: this.phase === "LOBBY" && this.players.size >= MIN_PLAYERS_TO_START,
      you: { id: playerId, isHost: playerId === this.hostId },
      settings: this.settings,
      settingsOptions,
      settingsLocked: this.settingsLocked,
      serverNow: Date.now(),
      deadlineAt: this.deadlineAt,
      round: this.phase === "LOBBY" ? null : { index: this.roundIndex, total: this.settings.rounds },
      // Placeholders this plan does not fill — later plans in this phase own
      // the real data (see the field comments in shared/protocol.ts).
      progress: null,
      youSubmitted: false,
      yourPlaceholderId: null,
      ratingStep: null,
      roundEnd: null,
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
