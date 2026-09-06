/**
 * Browser smoke test — the safety net for bugs unit tests structurally cannot see.
 *
 * Three defects in phase 1 shipped past a fully green suite and were found only
 * by opening the app on a real phone:
 *
 *   1. The socket never finished connecting, so every button silently did
 *      nothing. The unit tests passed because the test helper supplies the auth
 *      option as a plain object, which takes a different code path inside
 *      socket.io-client than the browser's function form.
 *   2. Every screen overflowed the viewport, clipping the Hebrew title and the
 *      name label off the right edge.
 *   3. Multi-person emoji were shattered into separate characters by the name
 *      sanitizer.
 *
 * This drives the real production build in a real browser against a real
 * server, so that class of failure fails HERE instead of in front of the party.
 * Every check below maps to something that actually broke.
 *
 * Run: npm run test:browser
 */
import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

/**
 * Playwright bundles a browser build per release, but a preinstalled image may
 * carry a different revision. Prefer whatever chromium is actually on disk and
 * fall back to Playwright's own resolution so this runs unmodified elsewhere.
 */
function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!base || !existsSync(base)) return undefined;
  for (const dir of readdirSync(base).filter((d) => d.startsWith("chromium-"))) {
    const candidate = path.join(base, dir, "chrome-linux", "chrome");
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.on("error", reject);
    srv.listen(0, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function waitForHealth(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/health`);
      if (res.ok) return;
    } catch {
      // Server not accepting connections yet.
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`server did not become healthy within ${timeoutMs}ms`);
}

const failures = [];
function check(label, condition, detail = "") {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
    failures.push(label);
  }
}

/** Screen text with newlines flattened, for substring assertions. */
const screenText = (page) => page.locator("body").innerText().then((t) => t.replace(/\s+/g, " ").trim());

async function main() {
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;

  const server = spawn("npm", ["--prefix", "server", "run", "start"], {
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: "production", PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let serverLog = "";
  server.stdout.on("data", (d) => (serverLog += d));
  server.stderr.on("data", (d) => (serverLog += d));

  let browser;
  try {
    await waitForHealth(url);
    browser = await chromium.launch({ executablePath: findChromium(), args: ["--no-sandbox"] });

    // --- Host creates a room -------------------------------------------------
    // Guards defect 1: if the socket never completes its handshake, the button
    // does nothing and no room code ever appears.
    const host = await browser.newPage(PHONE);
    const pageErrors = [];
    host.on("pageerror", (e) => pageErrors.push(String(e)));
    await host.goto(url, { waitUntil: "networkidle" });

    await host.fill("input", "דור");
    await host.click("button[type=submit]");
    await host.waitForTimeout(2500);

    const hostText = await screenText(host);
    const code = (hostText.match(/\d{4}/) || [])[0];
    check("clicking create actually reaches the server and returns a room code", Boolean(code), hostText.slice(0, 120));
    check("no uncaught page errors while creating a room", pageErrors.length === 0, pageErrors.join(" | "));
    if (!code) throw new Error("cannot continue without a room code");

    // --- The page fits a phone ----------------------------------------------
    // Guards defect 2: content wider than the viewport clipped the Hebrew title.
    const overflow = await host.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    check("lobby does not scroll sideways on a 390px screen", overflow <= 1, `overflow ${overflow}px`);

    // --- A second player joins ----------------------------------------------
    const guest = await browser.newPage(PHONE);
    await guest.goto(`${url}/join/${code}`, { waitUntil: "networkidle" });
    await guest.fill("input", "תמיר");
    await guest.click("button[type=submit]");
    await guest.waitForTimeout(2500);

    check("guest sees both players", (await screenText(guest)).includes("תמיר"));
    await host.waitForTimeout(500);
    const hostAfterJoin = await screenText(host);
    check("host sees the guest appear without reloading", hostAfterJoin.includes("תמיר"), hostAfterJoin.slice(0, 160));

    const guestOverflow = await guest.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    check("join screen does not scroll sideways either", guestOverflow <= 1, `overflow ${guestOverflow}px`);

    // --- Identity survives a reload -----------------------------------------
    // This is LIVE-02, the phase's whole reason for existing: a returning
    // player must not appear as an extra person.
    await guest.reload({ waitUntil: "networkidle" });
    await guest.waitForTimeout(2500);
    const guestAfterReload = await screenText(guest);
    check("returning player lands back in the room, not on the home screen", guestAfterReload.includes(code), guestAfterReload.slice(0, 160));
    check("returning player keeps their own name", guestAfterReload.includes("תמיר"));

    const hostAfterReload = await screenText(host);
    const tamirCount = (hostAfterReload.match(/תמיר/g) || []).length;
    check("a reload does NOT create a phantom extra player", tamirCount === 1, `saw "תמיר" ${tamirCount}x`);

    // --- Duplicate names are numbered, never refused -------------------------
    // D-07: nobody is ever blocked at the door.
    const twin = await browser.newPage(PHONE);
    await twin.goto(`${url}/join/${code}`, { waitUntil: "networkidle" });
    await twin.fill("input", "תמיר");
    await twin.click("button[type=submit]");
    await twin.waitForTimeout(2500);
    const twinText = await screenText(twin);
    check("a duplicate name still gets into the room", twinText.includes(code), twinText.slice(0, 160));
    check("the duplicate is auto-numbered rather than rejected", /תמיר 2/.test(twinText), twinText.slice(0, 160));

    // --- Emoji names survive the round trip ----------------------------------
    // Guards defect 3: the sanitizer used to split a family emoji apart.
    const emojiPlayer = await browser.newPage(PHONE);
    await emojiPlayer.goto(`${url}/join/${code}`, { waitUntil: "networkidle" });
    await emojiPlayer.fill("input", "\u{1F468}‍\u{1F469}‍\u{1F467}");
    await emojiPlayer.click("button[type=submit]");
    await emojiPlayer.waitForTimeout(2500);
    const emojiText = await screenText(emojiPlayer);
    check(
      "a multi-person emoji name survives intact",
      emojiText.includes("\u{1F468}‍\u{1F469}‍\u{1F467}"),
      emojiText.slice(0, 160),
    );
  } finally {
    if (browser) await browser.close();
    server.kill("SIGTERM");
  }

  console.log("");
  if (failures.length > 0) {
    console.error(`FAILED: ${failures.length} check(s)\n  - ${failures.join("\n  - ")}`);
    if (serverLog.trim()) console.error(`\nserver output:\n${serverLog.trim().slice(-1500)}`);
    process.exit(1);
  }
  console.log("All browser checks passed.");
}

main().catch((err) => {
  console.error("browser smoke test errored:", err);
  process.exit(1);
});
