import { describe, it, expect } from "vitest";
import { otherRemovablePlayers, formatRemovePlayerConfirm } from "./hostControlsHelpers";
import type { PlayerView } from "@shared/protocol.js";

const players: PlayerView[] = [
  { id: "host-1", name: "המנחה", connected: true, isHost: true, score: 0 },
  { id: "p-2", name: "דנה", connected: true, isHost: false, score: 3 },
  { id: "p-3", name: "יוסי", connected: false, isHost: false, score: 1 },
  { id: "p-4", name: "רותם", connected: true, isHost: false, score: 5 },
];

describe("otherRemovablePlayers", () => {
  it("returns every player with connected === true and id !== selfId, preserving input order", () => {
    const result = otherRemovablePlayers(players, "host-1");

    expect(result).toEqual([
      { id: "p-2", name: "דנה", connected: true, isHost: false, score: 3 },
      { id: "p-4", name: "רותם", connected: true, isHost: false, score: 5 },
    ]);
  });

  it("excludes selfId even when that player is connected", () => {
    const result = otherRemovablePlayers(players, "host-1");

    expect(result.some((p) => p.id === "host-1")).toBe(false);
  });

  it("excludes every disconnected player, including ones that are not the acting host", () => {
    const result = otherRemovablePlayers(players, "host-1");

    expect(result.some((p) => p.id === "p-3")).toBe(false);
  });

  it("returns an empty array when the only connected player is the host themself", () => {
    const soloRoster: PlayerView[] = [
      { id: "host-1", name: "המנחה", connected: true, isHost: true, score: 0 },
      { id: "p-2", name: "דנה", connected: false, isHost: false, score: 0 },
    ];

    expect(otherRemovablePlayers(soloRoster, "host-1")).toEqual([]);
  });
});

describe("formatRemovePlayerConfirm", () => {
  it("replaces exactly the first literal {playerName} token, leaving the rest of the sentence unchanged", () => {
    const template = "זה יתנתק את {playerName} מהחדר. בטוח?";

    expect(formatRemovePlayerConfirm(template, "דנה")).toBe("זה יתנתק את דנה מהחדר. בטוח?");
  });

  it("never throws for a playerName containing a literal { or } character", () => {
    const template = "זה יתנתק את {playerName} מהחדר. בטוח?";

    expect(() => formatRemovePlayerConfirm(template, "{דנה}")).not.toThrow();
    expect(formatRemovePlayerConfirm(template, "{דנה}")).toBe("זה יתנתק את {דנה} מהחדר. בטוח?");
  });
});
