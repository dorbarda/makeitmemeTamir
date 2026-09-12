import { afterEach, describe, expect, it, vi } from "vitest";
import { saveOrShareMeme } from "./saveOrShareMeme";

// Any short base64 string exercises the decode path — a real PNG is not needed.
const SAMPLE_MEME = btoa("x");

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("saveOrShareMeme", () => {
  it("returns shared when canShare({ files }) is true and share() resolves", async () => {
    const canShare = vi.fn().mockReturnValue(true);
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { canShare, share });

    const result = await saveOrShareMeme(SAMPLE_MEME);

    expect(canShare).toHaveBeenCalled();
    expect(share).toHaveBeenCalled();
    expect(result).toEqual({ outcome: "shared" });
  });

  it("returns dismissed when share() rejects with an AbortError DOMException", async () => {
    const canShare = vi.fn().mockReturnValue(true);
    const abortError = new DOMException("share canceled", "AbortError");
    const share = vi.fn().mockRejectedValue(abortError);
    vi.stubGlobal("navigator", { canShare, share });

    const result = await saveOrShareMeme(SAMPLE_MEME);

    expect(result).toEqual({ outcome: "dismissed" });
  });

  it("returns fallback with a blob and never calls share() when canShare is absent", async () => {
    const share = vi.fn();
    vi.stubGlobal("navigator", { share });

    const result = await saveOrShareMeme(SAMPLE_MEME);

    expect(share).not.toHaveBeenCalled();
    expect(result.outcome).toBe("fallback");
  });

  it("returns fallback with a blob and never calls share() when canShare returns false", async () => {
    const canShare = vi.fn().mockReturnValue(false);
    const share = vi.fn();
    vi.stubGlobal("navigator", { canShare, share });

    const result = await saveOrShareMeme(SAMPLE_MEME);

    expect(share).not.toHaveBeenCalled();
    expect(result.outcome).toBe("fallback");
  });

  it("the fallback blob round-trips back to the original base64 string", async () => {
    vi.stubGlobal("navigator", {});

    const result = await saveOrShareMeme(SAMPLE_MEME);

    expect(result.outcome).toBe("fallback");
    if (result.outcome === "fallback") {
      expect(await blobToBase64(result.blob)).toBe(SAMPLE_MEME);
    }
  });

  it("never throws under any branch, including an unexpected share() failure", async () => {
    const canShare = vi.fn().mockReturnValue(true);
    const share = vi.fn().mockRejectedValue(new Error("totally unexpected failure"));
    vi.stubGlobal("navigator", { canShare, share });

    await expect(saveOrShareMeme(SAMPLE_MEME)).resolves.not.toThrow();
  });
});
