import { afterEach, describe, expect, it, vi } from "vitest";
import { buildWhatsAppUrl, shareJoinLink } from "./shareJoinLink";

const JOIN_URL = "https://tamir-party.onrender.com/join/4827";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("buildWhatsAppUrl", () => {
  it("returns a wa.me URL whose text parameter contains the percent-encoded join URL", () => {
    const url = buildWhatsAppUrl(JOIN_URL);
    expect(url.startsWith("https://wa.me/?text=")).toBe(true);
    const params = new URL(url).searchParams;
    const text = params.get("text") ?? "";
    expect(text).toContain(JOIN_URL);
  });

  it("includes a short Hebrew invitation alongside the link", () => {
    const url = buildWhatsAppUrl(JOIN_URL);
    const text = new URL(url).searchParams.get("text") ?? "";
    // Hebrew block range check — proves the invitation text is Hebrew, not English.
    expect(/[֐-׿]/.test(text)).toBe(true);
  });
});

describe("shareJoinLink", () => {
  it("calls navigator.share when it exists and reports success", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share });

    const result = await shareJoinLink(JOIN_URL);

    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: JOIN_URL }));
    expect(result).toEqual({ outcome: "shared" });
  });

  it("returns a fallback result naming the WhatsApp URL when navigator.share is absent", async () => {
    vi.stubGlobal("navigator", {});

    const result = await shareJoinLink(JOIN_URL);

    expect(result.outcome).toBe("fallback");
    if (result.outcome === "fallback") {
      expect(result.whatsAppUrl).toBe(buildWhatsAppUrl(JOIN_URL));
    }
  });

  it("reports dismissal, not an error, when the user dismisses the native share sheet", async () => {
    const abortError = new DOMException("share canceled", "AbortError");
    const share = vi.fn().mockRejectedValue(abortError);
    vi.stubGlobal("navigator", { share });

    const result = await shareJoinLink(JOIN_URL);

    expect(result).toEqual({ outcome: "dismissed" });
  });

  it("never throws to its caller under any of the three branches", async () => {
    vi.stubGlobal("navigator", {
      share: vi.fn().mockRejectedValue(new Error("totally unexpected failure")),
    });

    await expect(shareJoinLink(JOIN_URL)).resolves.not.toThrow();
  });
});
