import { describe, it, expect } from "vitest";
import {
  MAX_CAPTION_BOXES,
  getBoxAtPoint,
  clampBoxPosition,
  nextBoxPosition,
  canAddBox,
} from "./hitTest";
import { BOX_WIDTH, BOX_HEIGHT, CANVAS_WIDTH, CANVAS_HEIGHT, type CaptionBox } from "./compositor";

describe("getBoxAtPoint", () => {
  it("returns the box's id for a point inside exactly one box", () => {
    const boxes: CaptionBox[] = [{ id: "box-1", text: "", x: 10, y: 20 }];

    expect(getBoxAtPoint(boxes, 50, 60)).toBe("box-1");
  });

  it("returns the LAST box in the array for a point inside two overlapping boxes", () => {
    const boxes: CaptionBox[] = [
      { id: "box-1", text: "", x: 10, y: 20 },
      { id: "box-2", text: "", x: 10, y: 20 },
    ];

    expect(getBoxAtPoint(boxes, 50, 60)).toBe("box-2");
  });

  it("returns null for a point outside every box", () => {
    const boxes: CaptionBox[] = [{ id: "box-1", text: "", x: 10, y: 20 }];

    expect(getBoxAtPoint(boxes, 0, 0)).toBeNull();
  });

  it("returns the box's id for a point exactly on its left edge (x === box.x)", () => {
    const boxes: CaptionBox[] = [{ id: "box-1", text: "", x: 10, y: 20 }];

    expect(getBoxAtPoint(boxes, 10, 20)).toBe("box-1");
  });

  it("returns the box's id for a point exactly on its right edge (x === box.x + BOX_WIDTH)", () => {
    const boxes: CaptionBox[] = [{ id: "box-1", text: "", x: 10, y: 20 }];

    expect(getBoxAtPoint(boxes, 10 + BOX_WIDTH, 20)).toBe("box-1");
  });
});

describe("clampBoxPosition", () => {
  it("clamps a position beyond the canvas's right/bottom edge to exactly (CANVAS_WIDTH - BOX_WIDTH, CANVAS_HEIGHT - BOX_HEIGHT)", () => {
    const result = clampBoxPosition(999999, 999999);

    expect(result).toEqual({ x: CANVAS_WIDTH - BOX_WIDTH, y: CANVAS_HEIGHT - BOX_HEIGHT });
  });

  it("clamps a negative position to exactly (0, 0)", () => {
    const result = clampBoxPosition(-50, -50);

    expect(result).toEqual({ x: 0, y: 0 });
  });
});

describe("nextBoxPosition", () => {
  it("returns a strictly different (offset) position for existingCount 0, 1, and 2, each within clampBoxPosition's own bounds", () => {
    const positions = [0, 1, 2].map((count) => nextBoxPosition(count));

    expect(positions[0]).not.toEqual(positions[1]);
    expect(positions[1]).not.toEqual(positions[2]);
    expect(positions[0]).not.toEqual(positions[2]);

    for (const pos of positions) {
      const clamped = clampBoxPosition(pos.x, pos.y);
      expect(pos).toEqual(clamped);
    }
  });
});

describe("canAddBox", () => {
  it("returns true for 0, 1, and 2 existing boxes", () => {
    expect(canAddBox(0)).toBe(true);
    expect(canAddBox(1)).toBe(true);
    expect(canAddBox(2)).toBe(true);
  });

  it("returns false for 3 (MAX_CAPTION_BOXES)", () => {
    expect(canAddBox(MAX_CAPTION_BOXES)).toBe(false);
    expect(canAddBox(3)).toBe(false);
  });
});
