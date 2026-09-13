import { customAlphabet } from "nanoid";
import { ROOM_ABANDONED_TTL_MS, ROOM_CODE_LENGTH, ROOM_GAME_END_TTL_MS } from "../config.js";
import { buildJoinUrl, buildQrDataUrl } from "./joinUrl.js";
import { Room } from "./Room.js";

const generateCandidate = customAlphabet("0123456789", ROOM_CODE_LENGTH);

export class RoomManager {
  private rooms = new Map<string, Room>();
  // Codes claimed synchronously but not yet inserted into `rooms` — closes
  // the window opened by createRoom's `await buildQrDataUrl(...)`. Without
  // this, two create-room intents landing in the same tick could both pass
  // the collision check against `rooms` (empty for this code either way)
  // before either finishes await-ing its QR code and inserts.
  private reservedCodes = new Set<string>();

  /**
   * Creates a room and generates its join URL and QR code exactly once,
   * cached on the Room for the lifetime of the room (see Room.joinUrl /
   * Room.qrDataUrl) — a 2KB string built once, not rebuilt on every
   * roster-change snapshot.
   */
  async createRoom(origin: string): Promise<Room> {
    let code: string;
    let attempts = 0;
    do {
      code = generateCandidate();
      attempts++;
      if (attempts > 50) {
        throw new Error("Room code space exhausted — should never happen at this scale");
      }
    } while (this.rooms.has(code) || this.reservedCodes.has(code));

    this.reservedCodes.add(code);
    try {
      const joinUrl = buildJoinUrl(origin, code);
      const qrDataUrl = await buildQrDataUrl(joinUrl);

      const room = new Room(code, joinUrl, qrDataUrl);
      this.rooms.set(code, room);
      return room;
    } finally {
      this.reservedCodes.delete(code);
    }
  }

  findRoom(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  /**
   * Disposes and forgets a room. The only place any room is ever removed
   * from `rooms` (debug/render-oom-memory-leak's root cause: before this
   * existed, nothing ever removed a room — every game ever created,
   * finished or abandoned, stayed resident in memory for the life of the
   * process). A no-op for a code that isn't currently tracked.
   */
  removeRoom(code: string): void {
    const room = this.rooms.get(code);
    if (!room) return;
    room.dispose();
    this.rooms.delete(code);
  }

  /**
   * Sweeps every tracked room and removes the ones that are genuinely done:
   * a `GAME_END` room idle past `ROOM_GAME_END_TTL_MS` (generous enough that
   * nobody mid-download gets cut off — applies even with a player still
   * connected, as a safety net against a forgotten-open tab rather than a
   * hard cutoff on a real viewer), or any room with zero connected players
   * idle past `ROOM_ABANDONED_TTL_MS` (an empty lobby, or a mid-game
   * walkaway nobody returned to). Returns the codes it removed, purely so
   * callers/tests can observe what happened.
   */
  reapIdleRooms(now: number = Date.now()): string[] {
    const reaped: string[] = [];
    for (const [code, room] of this.rooms) {
      const idleMs = now - room.lastActivityAt;
      const shouldReap =
        room.phase === "GAME_END"
          ? idleMs >= ROOM_GAME_END_TTL_MS
          : !room.hasConnectedPlayers && idleMs >= ROOM_ABANDONED_TTL_MS;

      if (shouldReap) {
        reaped.push(code);
      }
    }
    for (const code of reaped) {
      this.removeRoom(code);
    }
    return reaped;
  }
}
