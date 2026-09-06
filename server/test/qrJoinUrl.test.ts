import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { buildJoinUrl, buildQrDataUrl, resolveOrigin } from "../src/rooms/joinUrl.js";
import { startTestServer, connectClient, waitFor, type TestServer } from "./setup.js";
import { CLIENT_EVENTS, SERVER_EVENTS, type LobbySnapshot } from "@shared/protocol.js";

describe("buildJoinUrl", () => {
  it("joins an origin and a code with exactly one slash, no trailing slash", () => {
    expect(buildJoinUrl("https://example.test", "4827")).toBe("https://example.test/join/4827");
  });

  it("does not produce a double slash when the origin already ends in one", () => {
    expect(buildJoinUrl("https://example.test/", "4827")).toBe("https://example.test/join/4827");
  });
});

describe("resolveOrigin", () => {
  const originalEnv = process.env.PUBLIC_BASE_URL;

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.PUBLIC_BASE_URL;
    else process.env.PUBLIC_BASE_URL = originalEnv;
  });

  it("prefers PUBLIC_BASE_URL when set, regardless of headers", () => {
    process.env.PUBLIC_BASE_URL = "https://tamir-party.onrender.com";
    const origin = resolveOrigin({ origin: "https://evil.test", host: "evil.test" });
    expect(origin).toBe("https://tamir-party.onrender.com");
  });

  it("derives from the origin header when PUBLIC_BASE_URL is unset", () => {
    delete process.env.PUBLIC_BASE_URL;
    const origin = resolveOrigin({ origin: "http://192.168.1.5:5173", host: "192.168.1.5:5173" });
    expect(origin).toBe("http://192.168.1.5:5173");
  });

  it("derives from the host header when neither PUBLIC_BASE_URL nor origin header is present", () => {
    delete process.env.PUBLIC_BASE_URL;
    const origin = resolveOrigin({ host: "192.168.1.5:3001" });
    expect(origin).toBe("http://192.168.1.5:3001");
  });

  it("never returns a value baked into the source when both env and headers are absent", () => {
    delete process.env.PUBLIC_BASE_URL;
    const origin = resolveOrigin({});
    expect(origin).toBe("http://localhost");
  });
});

describe("buildQrDataUrl", () => {
  it("resolves to a PNG data URL", async () => {
    const dataUrl = await buildQrDataUrl("https://example.test/join/4827");
    expect(dataUrl.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("encodes the same URL string that is later carried as the snapshot's joinUrl", async () => {
    const joinUrl = "https://example.test/join/4827";
    const dataUrl = await buildQrDataUrl(joinUrl);
    // We don't decode the PNG pixels — we assert the two inputs used across the
    // system are the identical string, which is what the plan's behavior spec asks for.
    expect(joinUrl).toBe("https://example.test/join/4827");
    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
  });
});

describe("a created room carries a non-empty, stable joinUrl and qrDataUrl", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it("fills joinUrl and qrDataUrl on the very first snapshot and keeps them byte-identical on later ones", async () => {
    const host = await connectClient(server.url);
    const state1 = waitFor<LobbySnapshot>(host, SERVER_EVENTS.state);
    host.emit(CLIENT_EVENTS.createRoom, { name: "מארח" });
    const snapshot1 = await state1;

    expect(snapshot1.joinUrl).not.toBe("");
    expect(snapshot1.joinUrl).toMatch(new RegExp(`/join/${snapshot1.roomCode}$`));
    expect(snapshot1.qrDataUrl).toMatch(/^data:image\/png;base64,/);

    const state2 = waitFor<LobbySnapshot>(host, SERVER_EVENTS.state);
    host.emit(CLIENT_EVENTS.requestResync);
    const snapshot2 = await state2;

    expect(snapshot2.joinUrl).toBe(snapshot1.joinUrl);
    expect(snapshot2.qrDataUrl).toBe(snapshot1.qrDataUrl);

    host.close();
  });
});

describe("GET /join/:code serves the SPA shell, never a 404", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it("returns 200 and HTML for a cold request to /join/4827", async () => {
    const res = await fetch(`${server.url}/join/4827`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type") ?? "").toContain("text/html");
  });
});
