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

/**
 * The exact static path `app.ts` already serves `client/public/` under.
 * Percent-encodes the filename so real uploaded filenames containing spaces,
 * parentheses, or other reserved characters (e.g. "IMG_1617 (2).jpg") produce
 * a valid, resolvable URL path instead of a silently broken one.
 */
export function photoUrl(filename: string): string {
  return `/tamir-photos/${encodeURIComponent(filename)}`;
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

/** A single uniform random pick from `pool` — no shuffle needed for one draw.
 * Every caller in Room.ts guarantees a non-empty `pool`. */
export function drawOnePhoto(pool: string[]): string {
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * ROUND-02's per-player draw: each player's photo is drawn only from their
 * OWN eligible pool (the photos they have not yet seen this game), rather
 * than one pool shared across the whole room the way `assignPhotos` does.
 * For each `[playerId, eligiblePool]` entry, in the map's own iteration
 * order, shuffles that player's own eligible pool and takes the first
 * filename not already claimed by an earlier player in this same call
 * (`usedThisRound`) — falling back to the shuffled result's own first entry
 * if every one of this player's eligible photos was already claimed (the
 * accepted degradation once players outnumber the eligible pool: a repeat
 * within one round, never a gap, never a crash). Leaves `assignPhotos`
 * itself completely unchanged.
 */
export function assignPhotosFromEligiblePools(
  eligiblePoolsByPlayer: ReadonlyMap<string, string[]>,
): Map<string, string> {
  const usedThisRound = new Set<string>();
  const assignments = new Map<string, string>();

  for (const [playerId, eligiblePool] of eligiblePoolsByPlayer) {
    const shuffled = shuffle(eligiblePool);
    const chosen = shuffled.find((filename) => !usedThisRound.has(filename)) ?? shuffled[0];
    usedThisRound.add(chosen);
    assignments.set(playerId, chosen);
  }

  return assignments;
}
