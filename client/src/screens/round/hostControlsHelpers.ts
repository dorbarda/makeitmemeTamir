import type { PlayerView } from "@shared/protocol.js";

/**
 * The remove-player selection list's source of truth (LIVE-05). Excludes the
 * acting host themself (a host must never be offered as their own removal
 * target) and every disconnected player (nothing to force-disconnect that
 * isn't already gone). Preserves the input array's own order — no re-sort.
 */
export function otherRemovablePlayers(players: PlayerView[], selfId: string): PlayerView[] {
  return players.filter((p) => p.connected && p.id !== selfId);
}

/**
 * Interpolates the removed player's name into the confirmation copy.
 * `String.prototype.replace` with a *string* search argument (not a RegExp)
 * never re-interprets `playerName` as a pattern, so this stays safe even if
 * a name ever contained a literal "{" or "}" character.
 */
export function formatRemovePlayerConfirm(template: string, playerName: string): string {
  return template.replace("{playerName}", playerName);
}
