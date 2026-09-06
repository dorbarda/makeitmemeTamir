import express from "express";
import { createServer as createHttpServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server as SocketIOServer } from "socket.io";
import { PING_INTERVAL_MS, PING_TIMEOUT_MS } from "./config.js";
import { RoomManager } from "./rooms/RoomManager.js";
import { SessionRegistry } from "./players/SessionRegistry.js";
import { createAuthMiddleware } from "./socket/authMiddleware.js";
import { registerHandlers } from "./socket/handlers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.resolve(__dirname, "../../client/dist");

export function createServer() {
  const app = express();

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  // Explicit fallback for the deep join link (D-02/D-03): a phone opening
  // `/join/<code>` cold — not via client-side navigation, e.g. tapping a
  // WhatsApp link that opens straight into an in-app browser — must get the
  // SPA shell, never a 404. The path segment is never interpolated into the
  // returned HTML, so a crafted code cannot inject markup into the response.
  app.get("/join/:code", (_req, res, next) => {
    res.sendFile(path.join(CLIENT_DIST, "index.html"), (err) => {
      if (err) next(err);
    });
  });

  app.use(express.static(CLIENT_DIST));
  app.get(/.*/, (req, res, next) => {
    if (path.extname(req.path)) {
      next();
      return;
    }
    res.sendFile(path.join(CLIENT_DIST, "index.html"), (err) => {
      if (err) next();
    });
  });

  const httpServer = createHttpServer(app);

  const io = new SocketIOServer(httpServer, {
    pingInterval: PING_INTERVAL_MS,
    pingTimeout: PING_TIMEOUT_MS,
    connectionStateRecovery: {},
  });

  const roomManager = new RoomManager();
  const sessions = new SessionRegistry();

  io.use(createAuthMiddleware(sessions));
  io.on("connection", (socket) => {
    registerHandlers(io, socket, { roomManager, sessions });
  });

  return { httpServer, io, roomManager };
}
