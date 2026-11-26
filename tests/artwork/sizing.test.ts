import { describe, expect, it } from "vitest";
import { closestSupportedRatio, effectiveDpi, exactAspectRatio, mmToPx, panelImageSpec, readImageInfo, solidPng } from "@/lib/artwork";

describe("pixel maths", () => {
  it("uses px = mm / 25.4 * dpi, rounded up", () => {
    expect(mmToPx(25.4, 300)).toBe(300);
    expect(mmToPx(76, 300)).toBe(898);
    expect(mmToPx(126, 300)).toBe(1489);
  });

  it("sizes the front panel on its bleed box at 300 DPI", () => {
    const spec = panelImageSpec({ widthMm: 70, heightMm: 120, bleedMm: 3 });
    expect(spec).toMatchObject({
      bleedWidthMm: 76,
      bleedHeightMm: 126,
      aspectRatio: "38:63",
      widthPx: 898,
      heightPx: 1489,
      requestedAspectRatio: "9:16",
      imageSize: "2K",
      expectedWidthPx: 1536,
      expectedHeightPx: 2752,
      upscaleRequired: false,
    });
    expect(spec.coverCropFraction).toBeGreaterThan(0.02);
  });

  it("picks the smallest tier that still reaches 300 DPI", () => {
    expect(panelImageSpec({ widthMm: 60, heightMm: 60, bleedMm: 3 }).imageSize).toBe("1K");
    expect(panelImageSpec({ widthMm: 300, heightMm: 300, bleedMm: 3 }).imageSize).toBe("4K");
    expect(panelImageSpec({ widthMm: 600, heightMm: 600, bleedMm: 3 }).upscaleRequired).toBe(true);
  });

  it("treats tall and wide ratios symmetrically", () => {
    expect(closestSupportedRatio(30, 120)).toBe("9:16");
    expect(closestSupportedRatio(120, 30)).toBe("21:9");
    expect(closestSupportedRatio(100, 100)).toBe("1:1");
    expect(exactAspectRatio(36, 126)).toBe("2:7");
  });

  it("computes effective DPI after cover-scaling", () => {
    expect(effectiveDpi(898, 1489, 76, 126)).toBeGreaterThanOrEqual(300);
    expect(effectiveDpi(449, 745, 76, 126)).toBeLessThan(151);
  });
});

describe("image info", () => {
  it("round-trips a generated PNG's size", () => {
    expect(readImageInfo(solidPng(37, 11, "#abcdef"))).toEqual({ mimeType: "image/png", widthPx: 37, heightPx: 11 });
  });

  it("reads a JPEG SOF header", () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x05, 0xdd, 0x03, 0x84, 0x03, 0, 0, 0, 0]);
    expect(readImageInfo(jpeg)).toEqual({ mimeType: "image/jpeg", widthPx: 900, heightPx: 1501 });
  });

  it("returns null for unknown data", () => {
    expect(readImageInfo(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});
