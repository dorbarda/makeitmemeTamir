// The pure, canvas-injectable composition primitives every meme render
// surface builds on (D-01, D-02, RESEARCH.md's rasterize-and-transmit
// decision). No React/DOM-lifecycle code lives here on purpose: every
// function takes its canvas/context as a parameter so this module is
// unit-testable without a real browser canvas (jsdom has no real Canvas 2D
// implementation — see this plan's flagged HEB-03 assumption).
//
// Wave 3 (Plan 05-03) extends `CaptionBox`/`drawFrame` with drag/add/remove
// for up to 3 boxes (D-05); this plan proves the pipeline with exactly one
// fixed, centered box.

export type CaptionBox = { id: string; text: string; x: number; y: number };

export const CANVAS_WIDTH = 600;
export const CANVAS_HEIGHT = 800;
export const BOX_WIDTH = 360;
// BOX_HEIGHT stays exported unchanged at 100 because WritingPanel.tsx
// (initial box `y` centering) and hitTest.ts (`getBoxAtPoint`/
// `clampBoxPosition` hit-testing and drag bounds) both still read it as
// their fixed layout/hit-test constant — neither file is touched by this
// task — while `drawFrame`'s actual *rendered* box height is now computed
// per box from wrapped text. A short caption's visible box can therefore be
// shorter than its (unchanged, fixed-size) drag hit-area; that is an
// accepted, minor tradeoff since the hit-area is never smaller than the
// visible box, so dragging stays reliable.
export const BOX_HEIGHT = 100;

const LINE_HEIGHT = 34; // px per wrapped line, sized for 28px Heebo caption font
const BOX_PADDING = 12; // px inset on every side
const CORNER_RADIUS = 16; // px corner radius for the rounded box

/**
 * A simple greedy word-wrap. No character-level breaking of a single
 * overlong word — matches this task's minimal scope. Callers MUST set
 * `ctx.font` before calling this, since it uses `ctx.measureText`.
 */
function wrapCaptionText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = words[0];
  for (let i = 1; i < words.length; i++) {
    const candidate = `${current} ${words[i]}`;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = words[i];
    }
  }
  lines.push(current);
  return lines;
}

/**
 * Fills a rounded rectangle, feature-detecting `ctx.roundRect` (jsdom/vitest
 * has no real Canvas 2D implementation, so both branches need their own test
 * coverage).
 */
function drawRoundedBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, r);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.arcTo(x + width, y, x + width, y + r, r);
  ctx.lineTo(x + width, y + height - r);
  ctx.arcTo(x + width, y + height, x + width - r, y + height, r);
  ctx.lineTo(x + r, y + height);
  ctx.arcTo(x, y + height, x, y + height - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
  ctx.fill();
}

/**
 * Draws the photo followed by each non-empty caption box's semi-transparent
 * dark backing (D-04) and Hebrew text. `ctx.direction = 'rtl'` is the single
 * line HEB-03's correctness depends on entirely — it is what makes the
 * browser apply correct Unicode bidi reordering and glyph shaping.
 */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  photo: CanvasImageSource,
  boxes: CaptionBox[],
): void {
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.drawImage(photo, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  for (const box of boxes) {
    if (box.text.trim().length === 0) continue;
    ctx.font = "28px Heebo, sans-serif";
    ctx.direction = "rtl"; // CRITICAL — HEB-03's correctness depends entirely on this line
    const text = box.text.trim();
    const maxTextWidth = BOX_WIDTH - BOX_PADDING * 2;
    const lines = wrapCaptionText(ctx, text, maxTextWidth);
    const boxHeight = Math.max(lines.length, 1) * LINE_HEIGHT + BOX_PADDING * 2;
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)"; // D-04 — semi-transparent dark backing
    drawRoundedBox(ctx, box.x, box.y, BOX_WIDTH, boxHeight, CORNER_RADIUS);
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    lines.forEach((line, i) => {
      ctx.fillText(line, box.x + BOX_WIDTH - BOX_PADDING, box.y + BOX_PADDING + i * LINE_HEIGHT, maxTextWidth);
    });
  }
}

/** Rasterizes the canvas to a PNG blob — the rasterize-and-transmit boundary. */
export function rasterize(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("canvas.toBlob failed"));
        return;
      }
      resolve(blob);
    }, "image/png");
  });
}

/** Strips the `data:image/png;base64,` prefix, leaving the bare base64 payload the wire contract carries. */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
    reader.readAsDataURL(blob);
  });
}

/** The inverse of `blobToBase64` — turns a stored `meme` field back into an `<img src>`. */
export function memeDataUrl(meme: string): string {
  return `data:image/png;base64,${meme}`;
}
