import type { Server, Socket } from "socket.io";
import { CLIENT_EVENTS, SERVER_EVENTS, type ProtocolError, type SettingKey } from "@shared/protocol.js";
import { HEBREW_ERRORS } from "@shared/messages.js";
import { MAX_CAPTION_GRAPHEMES, RATE_LIMIT_MAX_INTENTS, RATE_LIMIT_WINDOW_MS } from "../config.js";
import { MAX_NAME_GRAPHEMES, sanitizeName, truncateToGraphemes } from "../names/nameValidation.js";
import { resolveOrigin } from "../rooms/joinUrl.js";
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

/**
 * The same sanitize-then-truncate pipeline as `prepareName`, applied to a
 * submitted caption instead of a name. Graphemes rather than code units
 * because a code-unit slice can split an emoji surrogate pair, and emoji are
 * explicitly allowed in player-authored text (Phase 1 D-08). This is a
 * payload-size bound for T-02-08, not the enforcement point for D-14 — D-14
 * is enforced entirely inside `Room.snapshotFor`'s omission of any caption
 * field.
 */
function prepareCaption(raw: string): string {
  return truncateToGraphemes(sanitizeName(raw ?? ""), MAX_CAPTION_GRAPHEMES);
}

/**
 * Per-socket sliding-window guard applied only to create-room/join-room.
 * Deliberately excludes rejoin/request-resync so a phone reconnecting
 * repeatedly on a bad network is never locked out of its own room (T-01-09).
 */
function isRateLimited(data: SocketData): boolean {
  const now = Date.now();
  const timestamps = (data.roomIntentTimestamps ??= []);
  while (timestamps.length > 0 && now - timestamps[0] > RATE_LIMIT_WINDOW_MS) {
    timestamps.shift();
  }
  if (timestamps.length >= RATE_LIMIT_MAX_INTENTS) {
    return true;
  }
  timestamps.push(now);
  return false;
}

export function registerHandlers(io: Server, socket: Socket, deps: HandlerDeps): void {
  const { roomManager, sessions } = deps;
  const data = socket.data as SocketData;

  socket.on(CLIENT_EVENTS.createRoom, async ({ name }: { name: string }) => {
    if (isRateLimited(data)) {
      emitError(socket, { code: "RATE_LIMITED", messageHe: HEBREW_ERRORS.RATE_LIMITED });
      return;
    }

    const preparedName = prepareName(name);
    if (preparedName.length === 0) {
      emitError(socket, { code: "NAME_REQUIRED", messageHe: HEBREW_ERRORS.NAME_REQUIRED });
      return;
    }

    const origin = resolveOrigin(socket.handshake.headers);
    const room = await roomManager.createRoom(origin);
    // The one place `io` is naturally in scope at room-creation time — wires
    // the room's delayed internal timers (roster fade, host transfer) to a
    // real broadcast for the lifetime of the room. Left unset in tests that
    // construct a bare `Room` directly (see rosterFade/hostTransfer tests).
    room.onStateChanged = () => room.broadcast(io);
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
    if (isRateLimited(data)) {
      emitError(socket, { code: "RATE_LIMITED", messageHe: HEBREW_ERRORS.RATE_LIMITED });
      return;
    }

    const room = roomManager.findRoom(roomCode);
    if (!room) {
      emitError(socket, { code: "ROOM_NOT_FOUND", messageHe: HEBREW_ERRORS.ROOM_NOT_FOUND });
      return;
    }

    // Capacity applies to new players only (D-05) — a returning player
    // resolves through `rejoin`, which never consults `isFull`, so someone
    // already in a full room is never locked out of it.
    if (room.isFull) {
      emitError(socket, { code: "ROOM_FULL", messageHe: HEBREW_ERRORS.ROOM_FULL });
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

  socket.on(CLIENT_EVENTS.changeSettings, ({ key, value }: { key: SettingKey; value: number }) => {
    if (!data.playerId || !data.roomCode) {
      emitError(socket, { code: "NOT_IN_ROOM", messageHe: HEBREW_ERRORS.NOT_IN_ROOM });
      return;
    }

    const room = roomManager.findRoom(data.roomCode);
    if (!room) {
      emitError(socket, { code: "ROOM_NOT_FOUND", messageHe: HEBREW_ERRORS.ROOM_NOT_FOUND });
      return;
    }

    // key/value are passed through exactly as received — validation lives in
    // one place (Room.changeSetting -> isPresetValue), never pre-checked or
    // coerced here, so that single place is the real gate (T-02-03).
    const result = room.changeSetting(data.playerId, key, value);
    if (!result.ok) {
      emitError(socket, { code: result.error, messageHe: HEBREW_ERRORS[result.error] });
      return;
    }

    room.broadcast(io);
  });

  socket.on(CLIENT_EVENTS.startGame, () => {
    if (!data.playerId || !data.roomCode) {
      emitError(socket, { code: "NOT_IN_ROOM", messageHe: HEBREW_ERRORS.NOT_IN_ROOM });
      return;
    }

    const room = roomManager.findRoom(data.roomCode);
    if (!room) {
      emitError(socket, { code: "ROOM_NOT_FOUND", messageHe: HEBREW_ERRORS.ROOM_NOT_FOUND });
      return;
    }

    // The payload carries no identity field a client could forge (T-02-01) —
    // only the server-bound socket.data.playerId is trusted.
    const result = room.startGame(data.playerId);
    if (!result.ok) {
      emitError(socket, { code: result.error, messageHe: HEBREW_ERRORS[result.error] });
      return;
    }

    room.broadcast(io);
  });

  socket.on(CLIENT_EVENTS.submitCaption, ({ text }: { text: string }) => {
    if (!data.playerId || !data.roomCode) {
      emitError(socket, { code: "NOT_IN_ROOM", messageHe: HEBREW_ERRORS.NOT_IN_ROOM });
      return;
    }

    const room = roomManager.findRoom(data.roomCode);
    if (!room) {
      emitError(socket, { code: "ROOM_NOT_FOUND", messageHe: HEBREW_ERRORS.ROOM_NOT_FOUND });
      return;
    }

    // The author is always socket.data.playerId (T-02-04) — the payload
    // carries no player-id field for a client to forge.
    const result = room.submitCaption(data.playerId, prepareCaption(text));
    if (!result.ok) {
      emitError(socket, { code: result.error, messageHe: HEBREW_ERRORS[result.error] });
      return;
    }

    room.broadcast(io);
  });

  socket.on(CLIENT_EVENTS.rejoin, () => {
    if (!data.playerId || !data.roomCode) {
      // No known binding for this socket's token (missing, expired, or a
      // token this server never issued — T-01-17). Never an error and never
      // a match against someone else's identity: the client has nothing to
      // resync into yet, so a fresh, unbound token is issued for it to carry
      // into whatever create-room/join-room it does next. create-room and
      // join-room already mint their own token unconditionally, so this
      // never collides with — or is required by — that path; it only means
      // a bare `rejoin` from an unrecognised token gets a normal reply
      // instead of a swallowed error nobody was listening for.
      const token = sessions.issue();
      data.token = token;
      socket.emit(SERVER_EVENTS.session, { token, playerId: "" });
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
