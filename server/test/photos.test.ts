import { describe, it, expect } from "vitest";
import { assignPhotos, photoUrl, PHOTO_FILENAMES } from "../src/rooms/photos.js";

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

describe("photoUrl", () => {
  it("returns exactly /tamir-photos/<filename>", () => {
    expect(photoUrl("x.jpg")).toBe("/tamir-photos/x.jpg");
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
