import { customAlphabet } from "nanoid";
import { ROOM_CODE_LENGTH } from "../config.js";
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
}
