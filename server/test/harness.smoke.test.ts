import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startTestServer, connectClient, type TestServer } from "./setup.js";

describe("test harness smoke test", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it("answers GET /health with { ok: true }", async () => {
    const res = await fetch(`${server.url}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });

  it("accepts a connected socket.io-client connection", async () => {
    const socket = await connectClient(server.url);
    expect(socket.connected).toBe(true);
    socket.close();
  });
});
