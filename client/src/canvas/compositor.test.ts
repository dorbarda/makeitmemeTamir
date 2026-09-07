import { describe, it, expect, vi } from "vitest";
import {
  drawFrame,
  rasterize,
  blobToBase64,
  memeDataUrl,
  type CaptionBox,
} from "./compositor";

/**
 * A minimal fake CanvasRenderingContext2D — jsdom has no real Canvas 2D
 * implementation, so this is the only way to unit-test `drawFrame`'s calls
 * without a real browser. This can only prove the caption STRING reaches
 * `fillText` byte-for-byte; it can never prove real bidi/glyph rendering
 * correctness (this plan's flagged HEB-03 assumption — see 05-02-PLAN.md).
 */
function makeFakeCtx() {
  return {
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    fillStyle: "",
    font: "",
    direction: "",
    textAlign: "",
    textBaseline: "",
  };
}

const fakePhoto = {} as CanvasImageSource;

describe("drawFrame", () => {
  it("calls ctx.drawImage exactly once with the photo", () => {
    const ctx = makeFakeCtx();
    const boxes: CaptionBox[] = [{ id: "box-1", text: "שלום", x: 10, y: 20 }];

    drawFrame(ctx as unknown as CanvasRenderingContext2D, fakePhoto, boxes);

    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
    expect(ctx.drawImage).toHaveBeenCalledWith(fakePhoto, 0, 0, 600, 800);
  });

  it("skips fillRect/fillText entirely for a box whose text.trim() is empty", () => {
    const ctx = makeFakeCtx();
    const boxes: CaptionBox[] = [{ id: "box-1", text: "   ", x: 10, y: 20 }];

    drawFrame(ctx as unknown as CanvasRenderingContext2D, fakePhoto, boxes);

    expect(ctx.fillRect).not.toHaveBeenCalled();
    expect(ctx.fillText).not.toHaveBeenCalled();
  });

  it("sets ctx.direction to rtl and calls fillText with the box's exact, unmodified mixed text", () => {
    const ctx = makeFakeCtx();
    const mixedText = "מחיר: 50% הנחה ל-VIP";
    const boxes: CaptionBox[] = [{ id: "box-1", text: mixedText, x: 10, y: 20 }];

    drawFrame(ctx as unknown as CanvasRenderingContext2D, fakePhoto, boxes);

    expect(ctx.direction).toBe("rtl");
    expect(ctx.fillText).toHaveBeenCalledTimes(1);
    const [text] = ctx.fillText.mock.calls[0] as [string, number, number, number];
    expect(text).toBe(mixedText);
  });
});

describe("rasterize", () => {
  it("resolves with whatever Blob a stubbed canvas.toBlob callback provides", async () => {
    const fakeBlob = new Blob(["fake-png-bytes"], { type: "image/png" });
    const canvas = {
      toBlob: (cb: BlobCallback) => cb(fakeBlob),
    } as unknown as HTMLCanvasElement;

    const result = await rasterize(canvas);

    expect(result).toBe(fakeBlob);
  });

  it("rejects when the callback provides null", async () => {
    const canvas = {
      toBlob: (cb: BlobCallback) => cb(null),
    } as unknown as HTMLCanvasElement;

    await expect(rasterize(canvas)).rejects.toThrow("canvas.toBlob failed");
  });
});

describe("blobToBase64", () => {
  it("resolves with the exact base64 encoding of the blob's bytes", async () => {
    const blob = new Blob(["hello"], { type: "text/plain" });

    const base64 = await blobToBase64(blob);

    expect(base64).toBe(btoa("hello"));
  });
});

describe("memeDataUrl", () => {
  it('returns exactly "data:image/png;base64,abc"', () => {
    expect(memeDataUrl("abc")).toBe("data:image/png;base64,abc");
  });
});
