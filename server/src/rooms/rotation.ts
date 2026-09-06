import type { Player } from "../players/Player.js";

/**
 * Builds the round's rating rotation from the submissions map, in the same
 * style as `gameSettings.ts` — a pure module living beside `Room`.
 *
 * `buildRotation(submissions)` is `[...submissions.keys()]` and nothing more.
 * A `Map`'s iteration order is insertion order, and insertion happens at
 * submission-arrival time inside a single-threaded process — arrival order is
 * therefore already a total order with no ties to break and no comparator to
 * write. A player who never submitted has no key in the map and is therefore
 * simply absent from the result (D-08), which is exactly why the rotation's
 * length is the submission count and never the player count.
 */
export function buildRotation(submissions: ReadonlyMap<string, string>): string[] {
  return [...submissions.keys()];
}

/**
 * Every player eligible to rate the meme currently on screen: connected
 * (LIVE-03 — a departed player can never hold a step open) and not the
 * author of that meme (VOTE-03 — the author sits their own step out).
 */
export function eligibleRaters(
  players: ReadonlyMap<string, Player>,
  authorId: string,
): string[] {
  return [...players.values()]
    .filter((p) => p.connected && p.id !== authorId)
    .map((p) => p.id);
}
