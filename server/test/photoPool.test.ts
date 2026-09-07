import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  TAMIR_PHOTOS_DIR,
  listPhotoFiles,
  loadPhotoManifest,
  pickPhoto,
} from "../src/rooms/photoPool.js";

describe("listPhotoFiles", () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    while (tmpDirs.length > 0) {
      const dir = tmpDirs.pop()!;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  function makeTmpDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "photoPool-test-"));
    tmpDirs.push(dir);
    return dir;
  }

  it("filters out non-image extensions and returns a sorted array", () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, "03.png"), "");
    fs.writeFileSync(path.join(dir, "01.jpg"), "");
    fs.writeFileSync(path.join(dir, "02.svg"), "");
    fs.writeFileSync(path.join(dir, "notes.txt"), "");
    fs.writeFileSync(path.join(dir, ".DS_Store"), "");

    expect(listPhotoFiles(dir)).toEqual(["01.jpg", "02.svg", "03.png"]);
  });

  it("recognizes every documented image extension, case-insensitively", () => {
    const dir = makeTmpDir();
    const files = ["a.jpg", "b.JPEG", "c.png", "d.WEBP", "e.gif", "f.SVG"];
    for (const file of files) {
      fs.writeFileSync(path.join(dir, file), "");
    }

    expect(listPhotoFiles(dir)).toEqual([...files].sort());
  });

  it("returns an empty array for a missing directory rather than throwing", () => {
    const missing = path.join(os.tmpdir(), "photoPool-test-does-not-exist");
    expect(() => listPhotoFiles(missing)).not.toThrow();
    expect(listPhotoFiles(missing)).toEqual([]);
  });

  it("returns an empty array for an empty directory", () => {
    const dir = makeTmpDir();
    expect(listPhotoFiles(dir)).toEqual([]);
  });
});

describe("loadPhotoManifest", () => {
  it("returns exactly the 20 placeholder filenames under TAMIR_PHOTOS_DIR", () => {
    const expected = Array.from({ length: 20 }, (_, i) => `${String(i + 1).padStart(2, "0")}.svg`);

    expect(loadPhotoManifest()).toEqual(expected);
  });

  it("matches a fresh directory scan of TAMIR_PHOTOS_DIR (memoization does not go stale within a run)", () => {
    expect(loadPhotoManifest()).toEqual(listPhotoFiles(TAMIR_PHOTOS_DIR));
  });
});

describe("pickPhoto", () => {
  it("returns the first manifest entry not present in usedPhotoFiles", () => {
    const manifest = ["a.svg", "b.svg", "c.svg"];
    const used = new Set(["a.svg"]);
    const lastUsedSeq = new Map<string, number>();

    expect(pickPhoto(manifest, used, lastUsedSeq)).toBe("b.svg");
  });

  it("returns the first manifest entry when none have been used yet", () => {
    const manifest = ["a.svg", "b.svg", "c.svg"];

    expect(pickPhoto(manifest, new Set(), new Map())).toBe("a.svg");
  });

  it("falls back to the least-recently-used entry once every entry has been used (D-06)", () => {
    const manifest = ["a.svg", "b.svg", "c.svg"];
    const used = new Set(manifest);
    const lastUsedSeq = new Map<string, number>([
      ["a.svg", 5],
      ["b.svg", 2],
      ["c.svg", 9],
    ]);

    expect(pickPhoto(manifest, used, lastUsedSeq)).toBe("b.svg");
  });

  it("treats an entry with no recorded seq as -1, so it always wins the LRU fallback", () => {
    const manifest = ["a.svg", "b.svg", "c.svg"];
    const used = new Set(manifest);
    // b.svg has no recorded seq at all — it defaults to -1 and must win
    // against a.svg/c.svg which both have a recorded (non-negative) seq.
    const lastUsedSeq = new Map<string, number>([
      ["a.svg", 1],
      ["c.svg", 3],
    ]);

    expect(pickPhoto(manifest, used, lastUsedSeq)).toBe("b.svg");
  });

  it("breaks exact LRU ties by manifest order", () => {
    const manifest = ["a.svg", "b.svg", "c.svg"];
    const used = new Set(manifest);
    const lastUsedSeq = new Map<string, number>([
      ["a.svg", 4],
      ["b.svg", 4],
      ["c.svg", 4],
    ]);

    expect(pickPhoto(manifest, used, lastUsedSeq)).toBe("a.svg");
  });

  it("throws for an empty manifest", () => {
    expect(() => pickPhoto([], new Set(), new Map())).toThrow();
  });
});
