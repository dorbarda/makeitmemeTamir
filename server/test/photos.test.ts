import { describe, it, expect } from "vitest";
import {
  assignPhotos,
  assignPhotosFromEligiblePools,
  drawOnePhoto,
  photoUrl,
  PHOTO_FILENAMES,
} from "../src/rooms/photos.js";

// Pure unit test over assignPhotos/photoUrl, using a small local injected
// pool so the test is deterministic and independent of however many real
// files exist on disk at any given moment — same style as
// rotation.test.ts/gameSettings.test.ts.
describe("assignPhotos", () => {
  const pool = ["a.jpg", "b.jpg", "c.jpg"];

  it("returns a 3-entry map whose values, as a set, equal the pool exactly when player count matches pool size", () => {
    const assignments = assignPhotos(["p1", "p2", "p3"], pool);
    expect(assignments.size).toBe(3);
    expect(new Set(assignments.values())).toEqual(new Set(pool));
  });

  it("returns 2 distinct values, both members of the pool, when player count is below pool size", () => {
    const assignments = assignPhotos(["p1", "p2"], pool);
    const values = [...assignments.values()];
    expect(values).toHaveLength(2);
    expect(new Set(values).size).toBe(2);
    for (const filename of values) {
      expect(pool).toContain(filename);
    }
  });

  it("with more players than photos, returns one filename per player, every one a pool member, and every pool member appears at least once", () => {
    const playerIds = Array.from({ length: 7 }, (_, i) => `p${i}`);
    const assignments = assignPhotos(playerIds, pool);
    expect(assignments.size).toBe(7);

    const values = [...assignments.values()];
    for (const filename of values) {
      expect(pool).toContain(filename);
    }
    for (const filename of pool) {
      expect(values).toContain(filename);
    }
  });

  it("never throws for an empty playerIds array", () => {
    expect(() => assignPhotos([], pool)).not.toThrow();
    expect(assignPhotos([], pool).size).toBe(0);
  });
});

// ROUND-02's per-player draw, same small-injected-pool determinism style as
// assignPhotos above.
describe("assignPhotosFromEligiblePools", () => {
  it("given two players whose eligible pools do not overlap at all, assigns each player a filename from their OWN eligible pool only", () => {
    const pools = new Map<string, string[]>([
      ["p1", ["a.jpg", "b.jpg"]],
      ["p2", ["c.jpg", "d.jpg"]],
    ]);
    const assignments = assignPhotosFromEligiblePools(pools);
    expect(assignments.size).toBe(2);
    expect(["a.jpg", "b.jpg"]).toContain(assignments.get("p1"));
    expect(["c.jpg", "d.jpg"]).toContain(assignments.get("p2"));
  });

  it("given two players who share an identical single-filename eligible pool, still assigns a real pool member to both (the accepted degradation)", () => {
    const pools = new Map<string, string[]>([
      ["p1", ["only.jpg"]],
      ["p2", ["only.jpg"]],
    ]);
    const assignments = assignPhotosFromEligiblePools(pools);
    expect(assignments.size).toBe(2);
    expect(assignments.get("p1")).toBe("only.jpg");
    expect(assignments.get("p2")).toBe("only.jpg");
  });

  it("returns an empty map for an empty input map, never throwing", () => {
    expect(() => assignPhotosFromEligiblePools(new Map())).not.toThrow();
    expect(assignPhotosFromEligiblePools(new Map()).size).toBe(0);
  });

  it("with three players and a three-filename shared pool, assigns each player a distinct pool member", () => {
    const pool = ["a.jpg", "b.jpg", "c.jpg"];
    const pools = new Map<string, string[]>([
      ["p1", pool],
      ["p2", pool],
      ["p3", pool],
    ]);
    const assignments = assignPhotosFromEligiblePools(pools);
    const values = [...assignments.values()];
    expect(new Set(values).size).toBe(3);
    for (const filename of values) {
      expect(pool).toContain(filename);
    }
  });
});

describe("drawOnePhoto", () => {
  const pool = ["a.jpg", "b.jpg", "c.jpg"];

  it("called repeatedly against a multi-item pool, always returns a member of that pool", () => {
    for (let i = 0; i < 50; i++) {
      expect(pool).toContain(drawOnePhoto(pool));
    }
  });

  it("returns the sole entry for a single-item pool", () => {
    expect(drawOnePhoto(["only.jpg"])).toBe("only.jpg");
  });
});

describe("photoUrl", () => {
  it("returns exactly /tamir-photos/<filename>", () => {
    expect(photoUrl("x.jpg")).toBe("/tamir-photos/x.jpg");
  });

  it("percent-encodes a filename containing a space and parentheses", () => {
    const input = "IMG_1617 (2).jpg";
    const url = photoUrl(input);
    expect(url).not.toMatch(/ /);
    expect(url).toMatch(/%20/);
    expect(() => new URL(url, "http://x")).not.toThrow();
    const parsed = new URL(url, "http://x");
    expect(decodeURIComponent(parsed.pathname)).toBe(`/tamir-photos/${input}`);
  });
});

// Light real-filesystem smoke check against the real, non-injected
// PHOTO_FILENAMES export — proves client/public/tamir-photos is enumerated
// correctly at the moment the suite runs.
describe("PHOTO_FILENAMES (real filesystem)", () => {
  it("is non-empty and every entry matches /\\.(jpe?g|png)$/i", () => {
    expect(PHOTO_FILENAMES.length).toBeGreaterThan(0);
    for (const filename of PHOTO_FILENAMES) {
      expect(filename).toMatch(/\.(jpe?g|png)$/i);
    }
  });
});
