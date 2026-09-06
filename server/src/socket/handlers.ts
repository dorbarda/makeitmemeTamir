import type { Server, Socket } from "socket.io";
import { CLIENT_EVENTS, SERVER_EVENTS, type ProtocolError } from "@shared/protocol.js";
import { HEBREW_ERRORS } from "@shared/messages.js";
import { MAX_NAME_GRAPHEMES, sanitizeName, truncateToGraphemes } from "../names/nameValidation.js";
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

/**
 * The single name-entry pipeline every create/join/rename intent runs
 * through before the Room ever sees the candidate — sanitize (strip
 * control/format characters, collapse whitespace) then truncate to the
 * grapheme cap. Never trust the client's own pre-check as the enforcement
 * point.
 */
function prepareName(raw: string): string {
  return truncateToGraphemes(sanitizeName(raw ?? ""), MAX_NAME_GRAPHEMES);
}

export function registerHandlers(io: Server, socket: Socket, deps: HandlerDeps): void {
  const { roomManager, sessions } = deps;
  const data = socket.data as SocketData;

  socket.on(CLIENT_EVENTS.createRoom, ({ name }: { name: string }) => {
    const preparedName = prepareName(name);
    if (preparedName.length === 0) {
      emitError(socket, { code: "NAME_REQUIRED", messageHe: HEBREW_ERRORS.NAME_REQUIRED });
      return;
    }

    const room = roomManager.createRoom();
    const token = sessions.issue();
    const player = room.addPlayer(preparedName, token);
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
      emitError(socket, { code: "ROOM_NOT_FOUND", messageHe: HEBREW_ERRORS.ROOM_NOT_FOUND });
      return;
    }

    const preparedName = prepareName(name);
    if (preparedName.length === 0) {
      emitError(socket, { code: "NAME_REQUIRED", messageHe: HEBREW_ERRORS.NAME_REQUIRED });
      return;
    }

    const token = sessions.issue();
    const player = room.addPlayer(preparedName, token);
    sessions.bind(token, room.code, player.id);

    data.playerId = player.id;
    data.roomCode = room.code;
    data.token = token;

    socket.emit(SERVER_EVENTS.session, { token, playerId: player.id });
    socket.join(room.code);
    room.broadcast(io);
  });

  socket.on(CLIENT_EVENTS.rename, ({ name }: { name: string }) => {
    if (!data.playerId || !data.roomCode) {
      emitError(socket, { code: "NOT_IN_ROOM", messageHe: HEBREW_ERRORS.NOT_IN_ROOM });
      return;
    }

    const room = roomManager.findRoom(data.roomCode);
    if (!room) {
      emitError(socket, { code: "ROOM_NOT_FOUND", messageHe: HEBREW_ERRORS.ROOM_NOT_FOUND });
      return;
    }

    const preparedName = prepareName(name);
    const result = room.renamePlayer(data.playerId, preparedName);
    if (!result.ok) {
      emitError(socket, { code: result.error, messageHe: HEBREW_ERRORS[result.error] });
      return;
    }

    room.broadcast(io);
  });

  socket.on(CLIENT_EVENTS.rejoin, () => {
    if (!data.playerId || !data.roomCode) {
      emitError(socket, { code: "NOT_IN_ROOM", messageHe: HEBREW_ERRORS.NOT_IN_ROOM });
      return;
    }

    const room = roomManager.findRoom(data.roomCode);
    if (!room) {
      emitError(socket, { code: "ROOM_NOT_FOUND", messageHe: HEBREW_ERRORS.ROOM_NOT_FOUND });
      return;
    }

    room.attach(data.playerId);
    socket.join(room.code);
    socket.emit(SERVER_EVENTS.state, room.snapshotFor(data.playerId));
    room.broadcast(io);
  });

  socket.on(CLIENT_EVENTS.requestResync, () => {
    if (!data.playerId || !data.roomCode) {
      emitError(socket, { code: "NOT_IN_ROOM", messageHe: HEBREW_ERRORS.NOT_IN_ROOM });
      return;
    }

    const room = roomManager.findRoom(data.roomCode);
    if (!room) {
      emitError(socket, { code: "ROOM_NOT_FOUND", messageHe: HEBREW_ERRORS.ROOM_NOT_FOUND });
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
