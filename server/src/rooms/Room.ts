import { randomUUID } from "node:crypto";
import type { Server } from "socket.io";
import {
  SERVER_EVENTS,
  type BestOfEntry,
  type GameEndView,
  type GameSettings,
  type LobbySnapshot,
  type PlayerView,
  type RatingStepView,
  type RatingValue,
  type RoomPhase,
  type RoundEndEntry,
  type RoundEndView,
  type SettingsOptions,
  type SubmissionProgress,
} from "@shared/protocol.js";
import {
  BETWEEN_MEMES_MS,
  BETWEEN_PHASES_MS,
  HOST_TRANSFER_GRACE_MS,
  MIN_PLAYERS_TO_START,
  MIN_SUBMISSIONS_TO_RATE,
  RATING_COLLAPSE_MS,
  RATING_SECONDS_PRESETS,
  ROOM_CAPACITY,
  ROSTER_FADE_GRACE_MS,
  ROUND_COUNT_PRESETS,
  WRITING_COLLAPSE_MS,
  WRITING_SECONDS_PRESETS,
} from "../config.js";
import { defaultSettings, isPresetValue } from "./gameSettings.js";
import { PHOTO_FILENAMES, assignPhotosFromEligiblePools, drawOnePhoto, photoUrl } from "./photos.js";
import { buildRotation, eligibleRaters } from "./rotation.js";
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

/** Result of a change-settings attempt — never throws, always tells the
 * caller why. Shaped exactly like RenameOutcome/StartGameOutcome. */
export type ChangeSettingOutcome =
  | { ok: true; settings: GameSettings }
  | { ok: false; error: "NOT_HOST" | "SETTINGS_LOCKED" | "SETTINGS_INVALID" };

/** Result of a submit-caption attempt — never throws, always tells the
 * caller why. Shaped exactly like RenameOutcome/StartGameOutcome. */
export type SubmitCaptionOutcome =
  | { ok: true }
  | { ok: false; error: "WRONG_PHASE" | "CAPTION_REQUIRED" | "ALREADY_SUBMITTED" };

/** Result of a submit-rating attempt — never throws, always tells the
 * caller why. Shaped exactly like RenameOutcome/StartGameOutcome/
 * SubmitCaptionOutcome. Refusal order (checked in `submitRating`): phase and
 * stepIndex first (WRONG_PHASE), then identity (CANNOT_RATE_OWN), then value
 * shape (RATING_OUT_OF_RANGE), then replay (ALREADY_RATED). */
export type SubmitRatingOutcome =
  | { ok: true }
  | {
      ok: false;
      error: "WRONG_PHASE" | "CANNOT_RATE_OWN" | "ALREADY_RATED" | "RATING_OUT_OF_RANGE";
    };

/** Result of a swap-photo attempt — never throws, always tells the caller
 * why. Shaped exactly like the other outcome types (ROUND-06, D-01, D-02). */
export type SwapPhotoOutcome =
  | { ok: true; photoUrl: string }
  | { ok: false; error: "WRONG_PHASE" | "ALREADY_SUBMITTED" | "SWAP_ALREADY_USED" };

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
  settings: GameSettings = defaultSettings();
  /** D-05 — true from the moment the game starts; settings are immutable
   * after that for the lifetime of the room. */
  settingsLocked = false;
  /** 1-based once play starts; 0 while still in LOBBY. */
  roundIndex = 0;
  /** D-12 — the absolute epoch-ms deadline for the current live phase, or
   * null in LOBBY/GAME_END. The single source of truth `snapshotFor` reads;
   * never a "seconds remaining" value. */
  deadlineAt: number | null = null;
  /** playerId -> caption text, for the current round only. A `Map` is
   * deliberate: its insertion order is the submission-arrival order plan
   * 02-04 turns into the reveal rotation, captured for free and never
   * re-derived. Cleared at the start of every round's writing phase. */
  submissions = new Map<string, string>();

  /** Built once from `submissions` when writing closes (D-08) — the ordered
   * list of author ids to reveal and rate, one per rating step. Never
   * re-derived mid-round: `stepIndex` indexes into this same array for the
   * whole rating phase, so a reconnecting phone always lands on the same
   * step everyone else is on. */
  rotation: string[] = [];
  /** -1 before rating begins; otherwise the index into `rotation` of the
   * meme currently on screen (during RATING) or about to be shown next
   * (during REVEAL_BREAK). */
  stepIndex = -1;
  /** stepIndex -> raterId -> the value that rater cast. A player absent from
   * a step's inner map simply never rated it (D-10) — no default is ever
   * written on their behalf. */
  ratings = new Map<number, Map<string, RatingValue>>();
  /** stepIndex -> the number of eligible raters at the exact moment that
   * step closed. Recorded so Phase 4 can choose between a sum and an average
   * without a rework (D-10's flag). */
  eligibleAtClose = new Map<number, number>();
  /** playerId -> this round's assigned photo filename (D-01). Rebuilt every
   * `enterWriting()` via `assignPhotos`; a player who joins after that has
   * already run gets a lazy fallback draw via `photoUrlFor`. */
  photoAssignments = new Map<string, string>();
  /** MEME-02/D-04 — the running top-3 highest-scoring memes across the whole
   * game so far, always length <= 3, always sorted highest-score-first.
   * Never cleared between rounds, never recomputed from round history —
   * `updateBestOfNight()` is the sole mutation site, called only from
   * `enterRoundEnd()`. */
  bestOfNight: BestOfEntry[] = [];
  /** ROUND-02 — every photo filename a player has ever been shown this game,
   * across every round. Never cleared at `enterWriting()`; only a single
   * player's own set is cleared (via `eligiblePoolFor`) once they have seen
   * every photo currently in the pool, per CONTEXT.md's graceful-reset
   * discretion. */
  photosSeenByPlayer = new Map<string, Set<string>>();
  /** ROUND-06/D-02 — the playerIds who have already used this round's one
   * swap. Cleared every `enterWriting()`, exactly like `submissions`. */
  swapUsed = new Set<string>();

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
   * The single place any live deadline is ever shortened (D-07). Computes
   * `Date.now() + targetMs`; if that instant is not strictly earlier than
   * the current `deadlineAt` it returns false and changes nothing —
   * otherwise it reschedules through `schedulePhase` with the same expiry
   * callback and returns true. This one guard is what makes "the clock only
   * ever shortens" a property of the code rather than a discipline every
   * call site has to remember.
   */
  private collapseDeadline(targetMs: number, onExpire: () => void): boolean {
    const candidate = Date.now() + targetMs;
    if (this.deadlineAt !== null && candidate >= this.deadlineAt) {
      return false;
    }
    this.schedulePhase(candidate, onExpire);
    return true;
  }

  /**
   * If every currently connected player has submitted a caption this round,
   * collapses the writing deadline to `WRITING_COLLAPSE_MS` from now instead
   * of leaving the room to sit out the rest of the original deadline
   * (D-07). Deliberately keyed on connected players only (Phase 1 D-17,
   * LIVE-03): a player who has left must never be able to hold the early
   * finish hostage. Because collapse only shortens, a disconnected player
   * who reconnects in time can still submit against the unchanged deadline.
   */
  private maybeCollapseWriting(): void {
    const connectedPlayers = [...this.players.values()].filter((p) => p.connected);
    if (connectedPlayers.length === 0) return;
    const allSubmitted = connectedPlayers.every((p) => this.submissions.has(p.id));
    if (allSubmitted) {
      this.collapseDeadline(WRITING_COLLAPSE_MS, () => this.closeWriting());
    }
  }

  /**
   * Records a player's caption for the current round (ROUND-04/ROUND-05).
   * `text` must already be sanitized and truncated by the caller — this only
   * enforces the round-engine rules: refused with `WRONG_PHASE` outside
   * WRITING, `CAPTION_REQUIRED` for an empty prepared string, and
   * `ALREADY_SUBMITTED` for a second attempt from the same player in the
   * same round (T-02-14 — no replay can overwrite a stored caption or
   * double-count progress). On success, checks whether every connected
   * player has now submitted and collapses the deadline if so (D-07).
   */
  submitCaption(playerId: string, text: string): SubmitCaptionOutcome {
    if (this.phase !== "WRITING") {
      return { ok: false, error: "WRONG_PHASE" };
    }
    if (text.length === 0) {
      return { ok: false, error: "CAPTION_REQUIRED" };
    }
    if (this.submissions.has(playerId)) {
      return { ok: false, error: "ALREADY_SUBMITTED" };
    }

    this.submissions.set(playerId, text);
    this.maybeCollapseWriting();
    return { ok: true };
  }

  /**
   * Changes one game setting (D-01/D-02). Host-only (T-02-02), refused once
   * settings are locked or the room has left LOBBY (D-05/T-02-12), and
   * refused for any value that is not one of that key's exact presets
   * (T-02-03) — never a range check, never a client-supplied object spread.
   * Order of refusal: identity first, then lock state, then value validity —
   * matching this method's own doc order and the plan's stated precedence.
   */
  changeSetting(playerId: string, key: string, value: unknown): ChangeSettingOutcome {
    if (playerId !== this.hostId) {
      return { ok: false, error: "NOT_HOST" };
    }
    if (this.settingsLocked || this.phase !== "LOBBY") {
      return { ok: false, error: "SETTINGS_LOCKED" };
    }
    if (!isPresetValue(key, value)) {
      return { ok: false, error: "SETTINGS_INVALID" };
    }

    // isPresetValue narrows `key` to SettingKey and already proved `value` is
    // an integer member of that key's own preset array — the cast reflects
    // what was just verified, not an unchecked assumption.
    this.settings[key] = value as number;
    return { ok: true, settings: this.settings };
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
    this.submissions.clear();
    this.rotation = [];
    this.stepIndex = -1;
    this.ratings.clear();
    this.eligibleAtClose.clear();
    this.swapUsed.clear();
    this.photoAssignments = this.drawPhotosForRound([...this.players.keys()]);
    this.schedulePhase(Date.now() + this.settings.writingSeconds * 1000, () =>
      this.closeWriting(),
    );
  }

  /**
   * ROUND-02 — `playerId`'s currently-eligible photo pool: `pool` filtered
   * down to filenames they have not yet seen this game. If they have no
   * seen-set yet, or `pool` filtered against it comes back empty (they have
   * now seen every photo currently in `pool`), resets their seen-set
   * (CONTEXT.md's Claude's Discretion: graceful degradation over crashing or
   * stalling once the pool is exhausted) and returns `pool` unchanged.
   */
  private eligiblePoolFor(playerId: string, pool: string[] = PHOTO_FILENAMES): string[] {
    const seen = this.photosSeenByPlayer.get(playerId);
    if (!seen || seen.size === 0) return pool;

    const eligible = pool.filter((filename) => !seen.has(filename));
    if (eligible.length === 0) {
      seen.clear();
      return pool;
    }
    return eligible;
  }

  /** Records that `playerId` has now been shown `filename` this game
   * (ROUND-02). Gets or creates that player's own seen-set. */
  private markPhotoSeen(playerId: string, filename: string): void {
    let seen = this.photosSeenByPlayer.get(playerId);
    if (!seen) {
      seen = new Set<string>();
      this.photosSeenByPlayer.set(playerId, seen);
    }
    seen.add(filename);
  }

  /**
   * ROUND-02's per-player draw for a round (or a lazy late-joiner draw):
   * builds each player's own eligible pool, draws one photo per player via
   * `assignPhotosFromEligiblePools`, then records every resulting photo as
   * seen before returning the assignment map.
   */
  private drawPhotosForRound(playerIds: string[]): Map<string, string> {
    const eligiblePools = new Map<string, string[]>();
    for (const playerId of playerIds) {
      eligiblePools.set(playerId, this.eligiblePoolFor(playerId));
    }
    const assignments = assignPhotosFromEligiblePools(eligiblePools);
    for (const [playerId, filename] of assignments) {
      this.markPhotoSeen(playerId, filename);
    }
    return assignments;
  }

  /**
   * D-01 — this round's photo for `playerId`, drawn from `photoAssignments`.
   * A player who joins after this round's `enterWriting()` already ran has
   * no entry there (nothing today prevents a mid-round join); this lazily
   * draws one (honoring the same ROUND-02 seen-photo tracking as a normal
   * round draw), caches it, and returns it either way, so `snapshotFor`
   * never has to render an empty `<img src>` for anyone currently in WRITING
   * or RATING.
   */
  private photoUrlFor(playerId: string): string {
    let filename = this.photoAssignments.get(playerId);
    if (!filename) {
      filename = this.drawPhotosForRound([playerId]).get(playerId)!;
      this.photoAssignments.set(playerId, filename);
    }
    return photoUrl(filename);
  }

  /**
   * Swaps `playerId`'s currently assigned photo for a new one, instantly and
   * with no preview (D-01). Refused with `WRONG_PHASE` outside WRITING,
   * `ALREADY_SUBMITTED` once this player's caption has locked in this
   * round's photo (D-02), and `SWAP_ALREADY_USED` on a second attempt in the
   * same round. Draws from the player's own eligible (not-yet-seen) pool,
   * excluding their current photo so a swap is never a no-op — falling back
   * to the full eligible pool if the current photo was their only eligible
   * option.
   */
  swapPhoto(playerId: string): SwapPhotoOutcome {
    if (this.phase !== "WRITING") {
      return { ok: false, error: "WRONG_PHASE" };
    }
    if (this.submissions.has(playerId)) {
      return { ok: false, error: "ALREADY_SUBMITTED" };
    }
    if (this.swapUsed.has(playerId)) {
      return { ok: false, error: "SWAP_ALREADY_USED" };
    }

    const currentFilename = this.photoAssignments.get(playerId);
    const eligible = this.eligiblePoolFor(playerId);
    const withoutCurrent = eligible.filter((filename) => filename !== currentFilename);
    const pool = withoutCurrent.length > 0 ? withoutCurrent : eligible;
    const filename = drawOnePhoto(pool);

    this.photoAssignments.set(playerId, filename);
    this.markPhotoSeen(playerId, filename);
    this.swapUsed.add(playerId);
    return { ok: true, photoUrl: photoUrl(filename) };
  }

  /**
   * SCORE-01 — the only place `Player.score` is ever mutated. Iterates
   * `this.rotation` by index, sums each step's raw rating values, and adds
   * the total onto that step's author. Called as the very first line of
   * `enterRoundEnd()`, before `phase` changes to `ROUND_END`. A round skipped
   * for too few captions (D-09) has an empty `rotation`, so this is a no-op
   * for that round — no score is invented. No socket handler in
   * `server/src/socket/handlers.ts` ever assigns to `.score`, so no client
   * message can influence it.
   */
  private applyRoundScores(): void {
    this.rotation.forEach((authorId, index) => {
      const stepRatings = this.ratings.get(index);
      if (!stepRatings) return;
      const total = [...stepRatings.values()].reduce((sum, value) => sum + value, 0);
      const author = this.players.get(authorId);
      if (author) {
        author.score += total;
      }
    });
  }

  /**
   * MEME-02/D-04 — updates the running "best of the night" list from this
   * round that just closed. Walks `this.rotation` the same way
   * `applyRoundScores` does: a step with no entry in `this.ratings` (nobody
   * rated it) contributes nothing. For every rated step, pushes one entry
   * carrying everything the client needs to render it (photo, caption,
   * author, score), then re-sorts the whole list highest-score-first and
   * trims it to length 3. `Array.prototype.sort`'s stability means a later
   * round's meme with a score EQUAL to an already-surviving entry's score
   * never displaces it — the earlier-inserted survivor keeps the #3 slot,
   * matching D-03's own no-tiebreaker philosophy applied to this list's
   * eviction boundary. Must only ever be called from `enterRoundEnd()`
   * (never later), since it calls `photoUrlFor(authorId)` while
   * `photoAssignments` still holds THIS round's draw, before the next
   * round's `enterWriting()` can overwrite it. Read-only with respect to
   * round history — never re-derives the list by scanning past rounds.
   */
  private updateBestOfNight(): void {
    this.rotation.forEach((authorId, index) => {
      const stepRatings = this.ratings.get(index);
      if (!stepRatings) return;
      const score = [...stepRatings.values()].reduce((sum, value) => sum + value, 0);
      this.bestOfNight.push({
        authorId,
        authorName: this.players.get(authorId)?.name ?? "",
        caption: this.submissions.get(authorId) ?? "",
        photoUrl: this.photoUrlFor(authorId),
        score,
      });
    });
    this.bestOfNight.sort((a, b) => b.score - a.score);
    if (this.bestOfNight.length > 3) {
      this.bestOfNight.length = 3;
    }
  }

  /**
   * Writing has closed. Builds this round's rating rotation once, from the
   * submissions map (D-08) — a player who never submitted has no key in that
   * map and is therefore simply absent from the rotation.
   *
   * D-09: if fewer than `MIN_SUBMISSIONS_TO_RATE` captions came in, the
   * rating phase is skipped entirely — one caption (or zero) cannot be
   * meaningfully rated, because its sole author is the one person barred
   * from rating it, so showing a single-meme rating step would be a
   * countdown nobody could ever act on. The round goes straight to
   * `enterRoundEnd()` without ever entering `REVEAL_BREAK` or `RATING` for
   * this round. Otherwise, opens the D-11 pacing beat before the first meme.
   */
  private closeWriting(): void {
    this.rotation = buildRotation(this.submissions);
    if (this.rotation.length < MIN_SUBMISSIONS_TO_RATE) {
      this.enterRoundEnd();
      return;
    }
    this.enterRevealBreak(0, BETWEEN_PHASES_MS);
  }

  /**
   * D-11's pacing beat before a meme appears — 3000ms out of writing, 2000ms
   * between memes. An instant screen swap on a phone reads as having missed
   * something. Sets `stepIndex` to the upcoming step now (not when the
   * break ends) so a phone reconnecting mid-break already knows which step
   * it is waiting for.
   */
  private enterRevealBreak(nextStepIndex: number, delayMs: number): void {
    this.phase = "REVEAL_BREAK";
    this.stepIndex = nextStepIndex;
    this.schedulePhase(Date.now() + delayMs, () => this.enterRatingStep(nextStepIndex));
  }

  /**
   * Opens rating step `index`, scheduling its own close from
   * `this.settings.ratingSeconds` — measured from the moment the step opens,
   * not from when the preceding break started, so the break time never eats
   * into the step's own rating time.
   */
  private enterRatingStep(index: number): void {
    this.phase = "RATING";
    this.stepIndex = index;
    this.schedulePhase(Date.now() + this.settings.ratingSeconds * 1000, () =>
      this.closeRatingStep(),
    );
  }

  /**
   * Closes the current rating step (VOTE-04). Records the eligible-rater
   * count at the moment of close (D-10's flag for Phase 4), then either
   * opens the next step's break or ends the round. Guarded on
   * `phase === "RATING"` at entry and returns without effect otherwise, so a
   * `collapseDeadline` reschedule landing on the exact instant the original
   * timer would also have fired can never advance the rotation twice (the
   * adjacency case) or re-open an already-closed step.
   */
  private closeRatingStep(): void {
    if (this.phase !== "RATING") return;

    const authorId = this.rotation[this.stepIndex];
    this.eligibleAtClose.set(this.stepIndex, eligibleRaters(this.players, authorId).length);

    const nextIndex = this.stepIndex + 1;
    if (nextIndex < this.rotation.length) {
      this.enterRevealBreak(nextIndex, BETWEEN_MEMES_MS);
    } else {
      this.enterRoundEnd();
    }
  }

  /**
   * Records a player's rating for the meme currently on screen (VOTE-01/03/
   * 04). `stepIndex`/`value` arrive straight from the client payload with no
   * prior coercion (T-02-05/T-02-06) — every check below is this method's
   * own responsibility. Refusal order: wrong phase or a stale/future
   * stepIndex -> `WRONG_PHASE` (this is what makes a replayed or stale frame
   * land nowhere); the current step's author -> `CANNOT_RATE_OWN`; anything
   * other than the literals 1, 2 or 3 -> `RATING_OUT_OF_RANGE`; a rater who
   * already has an entry for this step -> `ALREADY_RATED`. On success,
   * stores the value and checks whether every eligible rater has now rated
   * (early-finish collapse, D-07).
   */
  submitRating(playerId: string, stepIndex: unknown, value: unknown): SubmitRatingOutcome {
    if (this.phase !== "RATING" || stepIndex !== this.stepIndex) {
      return { ok: false, error: "WRONG_PHASE" };
    }

    const authorId = this.rotation[this.stepIndex];
    if (playerId === authorId) {
      return { ok: false, error: "CANNOT_RATE_OWN" };
    }

    if (value !== 1 && value !== 2 && value !== 3) {
      return { ok: false, error: "RATING_OUT_OF_RANGE" };
    }

    let stepRatings = this.ratings.get(this.stepIndex);
    if (!stepRatings) {
      stepRatings = new Map<string, RatingValue>();
      this.ratings.set(this.stepIndex, stepRatings);
    }

    if (stepRatings.has(playerId)) {
      return { ok: false, error: "ALREADY_RATED" };
    }

    stepRatings.set(playerId, value);
    this.maybeCollapseRating();
    return { ok: true };
  }

  /**
   * If every eligible rater for the current step has now rated it, collapses
   * the step's deadline to `RATING_COLLAPSE_MS` from now instead of leaving
   * the room to sit out the rest of the original deadline (D-07). Reuses
   * `collapseDeadline`, the single chokepoint through which any live
   * deadline may ever be shortened, so "never extends" holds here for free.
   */
  private maybeCollapseRating(): void {
    const authorId = this.rotation[this.stepIndex];
    const eligible = eligibleRaters(this.players, authorId);
    const stepRatings = this.ratings.get(this.stepIndex);
    const allRated = eligible.length > 0 && eligible.every((id) => stepRatings?.has(id));
    if (allRated) {
      this.collapseDeadline(RATING_COLLAPSE_MS, () => this.closeRatingStep());
    }
  }

  /**
   * D-11's between-phases pacing beat, then either the next round's writing
   * phase or, after the last round, game end. Computed entirely from the
   * room's own state (`roundIndex`, `settings.rounds`) — no client input
   * names the next phase, matching `transferHost()`'s no-arguments rule.
   */
  private enterRoundEnd(): void {
    this.applyRoundScores();
    this.updateBestOfNight();
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
   * Builds the round-end view for the round that just closed (VOTE-04's
   * empty edge, D-10). For each step in `rotation`, in the same order the
   * memes were shown, carries the author's id and current name, the
   * caption, the raw rating values that step received (never a default for
   * a silent rater), the eligible-rater count recorded at the moment that
   * step closed, and — as of VOTE-06 (plan 04-01) — that meme's real total
   * score: a plain sum of `ratings`, computed once here so no other file
   * ever re-derives a meme's score from its raw ratings array. D-10 flagged
   * that a meme rated while some eligible raters were away would score lower
   * purely by bad luck of timing; VOTE-06 accepted that tradeoff (a sum,
   * highest first) rather than an average or a floor. A round that skipped
   * rating (D-09) yields an empty `entries` array, never null and never a
   * fabricated entry.
   */
  private buildRoundEndView(): RoundEndView {
    const entries: RoundEndEntry[] = this.rotation.map((authorId, index) => {
      const author = this.players.get(authorId);
      const stepRatings = this.ratings.get(index);
      const values = stepRatings ? [...stepRatings.values()] : [];
      return {
        authorId,
        authorName: author?.name ?? "",
        caption: this.submissions.get(authorId) ?? "",
        ratings: values,
        eligibleAtClose: this.eligibleAtClose.get(index) ?? 0,
        score: values.reduce((sum, value) => sum + value, 0),
      };
    });
    return { entries };
  }

  /**
   * Builds the GAME_END-only view (SCORE-04/D-03, MEME-02/D-04). Computed
   * fresh every call, never cached. `winners` is every player whose score
   * equals the room's own max score — never just one on a tie, and never a
   * tiebreaker of any kind. `bestOfNight` is only READ here, never
   * recomputed — `updateBestOfNight()` already maintains it incrementally.
   */
  private buildGameEndView(): GameEndView {
    const players = [...this.players.values()];
    const maxScore = players.reduce((max, p) => Math.max(max, p.score), 0);
    const winners: PlayerView[] = players
      .filter((p) => p.score === maxScore)
      .map((p) => ({
        id: p.id,
        name: p.name,
        connected: p.connected,
        isHost: p.id === this.hostId,
        score: p.score,
      }));
    return { winners, bestOfNight: this.bestOfNight };
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

    const inWriting = this.phase === "WRITING";
    // D-14 — no caption text of any player, including this snapshot's own
    // recipient, is ever placed in a WRITING snapshot. `progress` carries ids
    // only; there is no field here a caption could occupy, so there is
    // nothing to leak even to someone reading the raw socket frame.
    const progress: SubmissionProgress | null = inWriting
      ? {
          submitted: this.submissions.size,
          total: this.players.size,
          submittedPlayerIds: [...this.submissions.keys()],
        }
      : null;
    const you = this.players.get(playerId);

    // `ratingStep` carries the CURRENT step's caption only — never any other
    // step's — and no author identity for anyone but the author themself
    // (`youAreAuthor` is the only identity signal exposed). `null` in every
    // phase but RATING, including REVEAL_BREAK, so no caption rides along
    // during a break either (D-14's discipline extended to the reveal side).
    let ratingStep: RatingStepView | null = null;
    if (this.phase === "RATING") {
      const authorId = this.rotation[this.stepIndex];
      const stepRatings = this.ratings.get(this.stepIndex);
      const eligible = eligibleRaters(this.players, authorId);
      const youHaveRated = stepRatings?.has(playerId) ?? false;

      ratingStep = {
        index: this.stepIndex,
        total: this.rotation.length,
        caption: this.submissions.get(authorId) ?? "",
        photoUrl: this.photoUrlFor(authorId),
        youAreAuthor: playerId === authorId,
        youMayRate: eligible.includes(playerId) && !youHaveRated,
        youHaveRated,
        ratedCount: stepRatings?.size ?? 0,
        eligibleCount: eligible.length,
      };
    }

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
      progress,
      youSubmitted: inWriting && this.submissions.has(playerId),
      // D-01 — this player's own assigned photo for the round, never a
      // placeholder.
      yourPhotoUrl: inWriting && you ? this.photoUrlFor(playerId) : null,
      // ROUND-06/D-02 — true only during WRITING, before this player has
      // submitted or already used this round's one swap.
      youCanSwapPhoto:
        inWriting && !this.submissions.has(playerId) && !this.swapUsed.has(playerId),
      ratingStep,
      // T-02-20 — `roundEnd` is now ROUND_END-only (plan 04-02 split it from
      // GAME_END, which gets its own dedicated `gameEnd` view below); the
      // full caption/rating set for the round still never travels early
      // (D-14's discipline extended to the round-end reveal).
      roundEnd: this.phase === "ROUND_END" ? this.buildRoundEndView() : null,
      // plan 04-02 — GAME_END's own dedicated view: every tied top scorer
      // (SCORE-04/D-03) and the real top-3 best-of-the-night memes
      // (MEME-02/D-04).
      gameEnd: this.phase === "GAME_END" ? this.buildGameEndView() : null,
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
