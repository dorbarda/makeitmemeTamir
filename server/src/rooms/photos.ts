import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * D-01 — Tamir's photos are delivered by the user uploading image files
 * directly into `client/public/tamir-photos/`. This module never hardcodes a
 * filename: the real files are opaque UUIDs the host drops in, and enumerating
 * the directory at load time is the only way this stays correct as photos are
 * added or swapped. Same "pure module living beside Room" shape as
 * `gameSettings.ts`/`rotation.ts` — a handful of exported functions, no
 * class, no side effects beyond what's documented here.
 *
 * One directory deeper than `app.ts`'s `CLIENT_DIST` resolution, since this
 * file lives in `server/src/rooms/` rather than `server/src/`. The same
 * relative path is correct in dev and in a production build with no server
 * wiring change, because Vite copies `client/public/` verbatim into
 * `client/dist/`, which `app.ts` already serves statically.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PHOTOS_DIR = path.resolve(__dirname, "../../../client/public/tamir-photos");

function loadPhotoFilenames(): string[] {
  const filenames = readdirSync(PHOTOS_DIR).filter((name) => /\.(jpe?g|png)$/i.test(name));
  if (filenames.length === 0) {
    // T-03-02 — fail loud at server start rather than serving a broken
    // writing screen mid-game.
    throw new Error(
      `No photo files found in ${PHOTOS_DIR} — add at least one .jpg/.jpeg/.png file before starting the server.`,
    );
  }
  return filenames;
}

export const PHOTO_FILENAMES: string[] = loadPhotoFilenames();

/** The exact static path `app.ts` already serves `client/public/` under. */
export function photoUrl(filename: string): string {
  return `/tamir-photos/${filename}`;
}

/** Fisher-Yates over `Math.random()` — no crypto RNG needed for a party game. */
function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * D-01's photo draw. Draws by concatenating successive shuffled copies of
 * `pool` until the accumulated list is at least as long as `playerIds`, then
 * zips `playerIds[i]` to the i-th drawn filename. Guarantees every player
 * gets a DISTINCT photo whenever `playerIds.length <= pool.length` (covers
 * every real party size against the real photo count), and still assigns a
 * real pool member to every player — never throwing, never leaving a gap —
 * when there are more players than photos.
 *
 * `pool` is an injectable parameter purely so tests can exercise the cycling
 * behavior deterministically without depending on however many real files
 * happen to exist on disk.
 */
export function assignPhotos(
  playerIds: string[],
  pool: string[] = PHOTO_FILENAMES,
): Map<string, string> {
  const drawn: string[] = [];
  while (drawn.length < playerIds.length) {
    drawn.push(...shuffle(pool));
  }

  const assignments = new Map<string, string>();
  playerIds.forEach((playerId, index) => {
    assignments.set(playerId, drawn[index]);
  });
  return assignments;
}
