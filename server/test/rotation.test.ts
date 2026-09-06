import { describe, it, expect } from "vitest";
import { buildRotation, eligibleRaters } from "../src/rooms/rotation.js";
import type { Player } from "../src/players/Player.js";

function makePlayer(id: string, overrides: Partial<Player> = {}): Player {
  return {
    id,
    token: `token-${id}`,
    name: id,
    connected: true,
    score: 0,
    joinedAt: 0,
    ...overrides,
  };
}

describe("buildRotation", () => {
  it("returns the submitters' ids in the map's insertion (submission-arrival) order", () => {
    const submissions = new Map<string, string>();
    submissions.set("p3", "third to submit");
    submissions.set("p1", "first to submit");
    submissions.set("p2", "second to submit");

    expect(buildRotation(submissions)).toEqual(["p3", "p1", "p2"]);
  });

  it("skips a player in the roster who never submitted (D-08): five players, three submissions, three-entry rotation", () => {
    // The rotation is built purely from the submissions map — the full
    // five-player roster never enters this function at all, which is
    // exactly why a non-submitter cannot appear in the result.
    const submissions = new Map<string, string>();
    submissions.set("p1", "a");
    submissions.set("p2", "b");
    submissions.set("p4", "c");

    const rotation = buildRotation(submissions);
    expect(rotation).toEqual(["p1", "p2", "p4"]);
    expect(rotation).not.toContain("p3");
    expect(rotation).not.toContain("p5");
  });

  it("returns an empty array for an empty submissions map", () => {
    expect(buildRotation(new Map())).toEqual([]);
  });

  it("returns a one-element array for a one-entry submissions map", () => {
    const submissions = new Map([["solo", "only caption"]]);
    expect(buildRotation(submissions)).toEqual(["solo"]);
  });

  it("is deterministic: called twice on the same map, both arrays are element-for-element equal", () => {
    const submissions = new Map<string, string>();
    submissions.set("a", "1");
    submissions.set("b", "2");
    submissions.set("c", "3");

    expect(buildRotation(submissions)).toEqual(buildRotation(submissions));
  });
});

describe("eligibleRaters", () => {
  it("returns every connected player except the author", () => {
    const players = new Map<string, Player>([
      ["author", makePlayer("author")],
      ["b", makePlayer("b")],
      ["c", makePlayer("c")],
    ]);

    expect(eligibleRaters(players, "author").sort()).toEqual(["b", "c"]);
  });

  it("excludes a disconnected player, even though they are not the author", () => {
    const players = new Map<string, Player>([
      ["author", makePlayer("author")],
      ["b", makePlayer("b", { connected: false })],
      ["c", makePlayer("c")],
    ]);

    expect(eligibleRaters(players, "author")).toEqual(["c"]);
  });

  it("never includes the author, even when the author is connected", () => {
    const players = new Map<string, Player>([
      ["author", makePlayer("author", { connected: true })],
      ["b", makePlayer("b")],
    ]);

    expect(eligibleRaters(players, "author")).not.toContain("author");
  });
});
