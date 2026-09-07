import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The directory the real (or, for now, placeholder — D-08) Tamir photo set
 * lives in. Three ".." segments up from server/src/rooms/ reach the repo
 * root, mirroring app.ts's own CLIENT_DIST resolution one level shallower
 * (server/src/ needs only two ".." segments to reach the repo root).
 */
export const TAMIR_PHOTOS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../client/public/tamir-photos",
);

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"]);

/**
 * Lists the image files in `dir`, sorted alphabetically. A missing directory
 * returns an empty array rather than throwing — a misconfigured deploy
 * should fail loudly later, at the first pickPhoto call (an empty manifest),
 * not silently at module import time.
 */
export function listPhotoFiles(dir: string): string[] {
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return [];
  }

  return entries
    .filter((entry) => IMAGE_EXTENSIONS.has(path.extname(entry).toLowerCase()))
    .sort();
}

let cachedManifest: string[] | undefined;

/**
 * The room's photo manifest — the on-disk placeholder (or, later, real)
 * Tamir photo set. Memoized so the directory is scanned exactly once per
 * server process.
 */
export function loadPhotoManifest(): string[] {
  if (cachedManifest === undefined) {
    cachedManifest = listPhotoFiles(TAMIR_PHOTOS_DIR);
  }
  return cachedManifest;
}

/**
 * D-05/D-06 photo selection: prefer any manifest entry never yet used by
 * this room; once every entry has been used at least once, fall back to the
 * least-recently-used entry (lowest recorded seq, with an unrecorded entry
 * defaulting to -1 so it always wins against a recorded one), breaking exact
 * ties by manifest order.
 *
 * Throws for an empty manifest — a startup/configuration invariant (an empty
 * photo set), not a per-request client-triggered outcome, so this
 * deliberately does not follow the fail-closed typed-outcome convention
 * Room's own player-facing methods use (submitCaption, submitRating, etc.).
 */
export function pickPhoto(
  manifest: readonly string[],
  usedPhotoFiles: ReadonlySet<string>,
  lastUsedSeq: ReadonlyMap<string, number>,
): string {
  if (manifest.length === 0) {
    throw new Error("pickPhoto: manifest is empty — no photos are configured");
  }

  const unused = manifest.find((file) => !usedPhotoFiles.has(file));
  if (unused !== undefined) {
    return unused;
  }

  let best = manifest[0]!;
  let bestSeq = lastUsedSeq.get(best) ?? -1;
  for (const file of manifest.slice(1)) {
    const seq = lastUsedSeq.get(file) ?? -1;
    if (seq < bestSeq) {
      best = file;
      bestSeq = seq;
    }
  }
  return best;
}
