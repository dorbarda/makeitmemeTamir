// Pure hit-testing and placement primitives for the multi-box drag editor
// (MEME-01/D-05). No React/DOM code lives here on purpose — same rationale
// as compositor.ts: unit-testable without a real browser canvas.
//
// Overlap resolution is intentionally simple: no collision/merge logic.
// Boxes may fully overlap; the LAST box in array order always wins both
// hit-testing and (per compositor.ts's existing draw loop) rendering on
// top. Adding a box appends it last; dragging repositions in place without
// reordering — so a tie in visual overlap is always deterministic.

import type { CaptionBox } from "./compositor.js";
import { BOX_WIDTH, BOX_HEIGHT, CANVAS_WIDTH, CANVAS_HEIGHT } from "./compositor.js";

export const MAX_CAPTION_BOXES = 3; // D-05

/** Reverse array order — the last-drawn (topmost) box wins a tap on overlapping
 * boxes. No collision/merge logic: boxes may fully overlap (MEME-01/adjacency
 * edge case). */
export function getBoxAtPoint(boxes: CaptionBox[], x: number, y: number): string | null {
  for (let i = boxes.length - 1; i >= 0; i--) {
    const box = boxes[i];
    if (x >= box.x && x <= box.x + BOX_WIDTH && y >= box.y && y <= box.y + BOX_HEIGHT) {
      return box.id;
    }
  }
  return null;
}

export function clampBoxPosition(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(x, CANVAS_WIDTH - BOX_WIDTH)),
    y: Math.max(0, Math.min(y, CANVAS_HEIGHT - BOX_HEIGHT)),
  };
}

/** A newly added box starts near center, offset from each prior box so boxes
 * added in sequence are visibly distinct before the player drags them apart. */
export function nextBoxPosition(existingCount: number): { x: number; y: number } {
  const OFFSET = 32;
  const baseX = (CANVAS_WIDTH - BOX_WIDTH) / 2;
  const baseY = (CANVAS_HEIGHT - BOX_HEIGHT) / 2;
  return clampBoxPosition(baseX + existingCount * OFFSET, baseY + existingCount * OFFSET);
}

export function canAddBox(currentCount: number): boolean {
  return currentCount < MAX_CAPTION_BOXES;
}
