import { describe, expect, it } from "vitest";
import { formatMm, formatSize } from "@/lib/box-dimensions";

describe("formatSize", () => {
  it("formats length, width and height in millimetres with a times sign", () => {
    expect(formatSize({ length: 302, width: 152, height: 182 })).toBe("302 × 152 × 182 mm");
    expect(formatSize({ length: 120, width: 60, height: 160 })).toBe("120 × 60 × 160 mm");
  });

  it("keeps a single decimal place when needed", () => {
    expect(formatSize({ length: 120.25, width: 60, height: 160 })).toBe("120.3 × 60 × 160 mm");
    expect(formatMm(2)).toBe("2");
    expect(formatMm(2.0)).toBe("2");
    expect(formatMm(2.25)).toBe("2.3");
  });

  it("returns null when any side is missing or not positive", () => {
    expect(formatSize({ length: 0, width: 60, height: 160 })).toBeNull();
    expect(formatSize({ length: 120, width: -1, height: 160 })).toBeNull();
    expect(formatSize({ length: 120, width: 60, height: Number.NaN })).toBeNull();
  });
});
