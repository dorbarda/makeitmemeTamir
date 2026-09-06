import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import { createServer } from "../src/app.js";

export type TestServer = {
  url: string;
  io: ReturnType<typeof createServer>["io"];
  roomManager: ReturnType<typeof createServer>["roomManager"];
  close: () => Promise<void>;
};

export function startTestServer(): Promise<TestServer> {
  return new Promise((resolve, reject) => {
    const { httpServer, io, roomManager } = createServer();

    httpServer.listen(0, () => {
      const address = httpServer.address();
      if (address === null || typeof address === "string") {
        reject(new Error("Failed to determine ephemeral port for test server"));
        return;
      }

      const url = `http://localhost:${address.port}`;

      // io.close() also closes the underlying httpServer it was attached to —
      // closing httpServer again afterward would error with "Server is not running".
      const close = () =>
        new Promise<void>((resolveClose, rejectClose) => {
          io.close((err) => {
            if (err) {
              rejectClose(err);
              return;
            }
            resolveClose();
          });
        });

      resolve({ url, io, roomManager, close });
    });
  });
}

export function connectClient(url: string, token?: string): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const socket = ioClient(url, {
      auth: token ? { token } : {},
      transports: ["websocket"],
      reconnection: false,
      forceNew: true,
    });

    const timer = setTimeout(() => {
      socket.close();
      reject(new Error("connectClient timed out waiting for 'connect'"));
    }, 5000);

    socket.on("connect", () => {
      clearTimeout(timer);
      resolve(socket);
    });

    socket.on("connect_error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

export function waitFor<T = unknown>(
  socket: ClientSocket,
  eventName: string,
  timeoutMs = 5000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`waitFor timed out waiting for event "${eventName}"`));
    }, timeoutMs);

    socket.once(eventName, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}
