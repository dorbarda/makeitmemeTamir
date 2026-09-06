import type { Server, Socket } from "socket.io";
import { CLIENT_EVENTS, SERVER_EVENTS, type ProtocolError } from "@shared/protocol.js";
import type { RoomManager } from "../rooms/RoomManager.js";
import type { SessionRegistry } from "../players/SessionRegistry.js";
import type { SocketData } from "./authMiddleware.js";

export type HandlerDeps = {
  roomManager: RoomManager;
  sessions: SessionRegistry;
};

function emitError(socket: Socket, error: ProtocolError): void {
  socket.emit(SERVER_EVENTS.error, error);
}

export function registerHandlers(io: Server, socket: Socket, deps: HandlerDeps): void {
  const { roomManager, sessions } = deps;
  const data = socket.data as SocketData;

  socket.on(CLIENT_EVENTS.createRoom, ({ name }: { name: string }) => {
    const room = roomManager.createRoom();
    const token = sessions.issue();
    const player = room.addPlayer(name, token);
    sessions.bind(token, room.code, player.id);

    data.playerId = player.id;
    data.roomCode = room.code;
    data.token = token;

    socket.emit(SERVER_EVENTS.session, { token, playerId: player.id });
    socket.join(room.code);
    room.broadcast(io);
  });

  socket.on(CLIENT_EVENTS.joinRoom, ({ roomCode, name }: { roomCode: string; name: string }) => {
    const room = roomManager.findRoom(roomCode);
    if (!room) {
      emitError(socket, { code: "ROOM_NOT_FOUND", messageHe: "החדר לא נמצא" });
      return;
    }

    const token = sessions.issue();
    const player = room.addPlayer(name, token);
    sessions.bind(token, room.code, player.id);

    data.playerId = player.id;
    data.roomCode = room.code;
    data.token = token;

    socket.emit(SERVER_EVENTS.session, { token, playerId: player.id });
    socket.join(room.code);
    room.broadcast(io);
  });

  socket.on(CLIENT_EVENTS.rejoin, () => {
    if (!data.playerId || !data.roomCode) {
      emitError(socket, { code: "NOT_IN_ROOM", messageHe: "עדיין לא הצטרפת לחדר" });
      return;
    }

    const room = roomManager.findRoom(data.roomCode);
    if (!room) {
      emitError(socket, { code: "ROOM_NOT_FOUND", messageHe: "החדר לא נמצא" });
      return;
    }

    room.attach(data.playerId);
    socket.join(room.code);
    socket.emit(SERVER_EVENTS.state, room.snapshotFor(data.playerId));
    room.broadcast(io);
  });

  socket.on(CLIENT_EVENTS.requestResync, () => {
    if (!data.playerId || !data.roomCode) {
      emitError(socket, { code: "NOT_IN_ROOM", messageHe: "עדיין לא הצטרפת לחדר" });
      return;
    }

    const room = roomManager.findRoom(data.roomCode);
    if (!room) {
      emitError(socket, { code: "ROOM_NOT_FOUND", messageHe: "החדר לא נמצא" });
      return;
    }

    socket.emit(SERVER_EVENTS.state, room.snapshotFor(data.playerId));
  });

  socket.on("disconnect", () => {
    if (!data.playerId || !data.roomCode) return;

    const room = roomManager.findRoom(data.roomCode);
    if (!room) return;

    room.detach(data.playerId);
    room.broadcast(io);
  });
}
