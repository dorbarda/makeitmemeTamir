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
export const BOX_HEIGHT = 100;

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
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)"; // D-04 — semi-transparent dark backing
    ctx.fillRect(box.x, box.y, BOX_WIDTH, BOX_HEIGHT);
    ctx.fillStyle = "#ffffff";
    ctx.font = "28px Heebo, sans-serif";
    ctx.direction = "rtl"; // CRITICAL — HEB-03's correctness depends entirely on this line
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillText(box.text, box.x + BOX_WIDTH - 12, box.y + 12, BOX_WIDTH - 24);
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
