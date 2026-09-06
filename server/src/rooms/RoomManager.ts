import { customAlphabet } from "nanoid";
import { ROOM_CODE_LENGTH } from "../config.js";
import { Room } from "./Room.js";

const generateCandidate = customAlphabet("0123456789", ROOM_CODE_LENGTH);

export class RoomManager {
  private rooms = new Map<string, Room>();

  createRoom(): Room {
    let code: string;
    let attempts = 0;
    do {
      code = generateCandidate();
      attempts++;
      if (attempts > 50) {
        throw new Error("Room code space exhausted — should never happen at this scale");
      }
    } while (this.rooms.has(code));

    const room = new Room(code);
    this.rooms.set(code, room);
    return room;
  }

  findRoom(code: string): Room | undefined {
    return this.rooms.get(code);
  }
}
