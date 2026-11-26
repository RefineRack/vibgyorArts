import type { Panel } from "@/lib/artwork/types";
import { bleedSizeMm } from "@/lib/artwork/dieline/geometry";

// Pixel and aspect-ratio maths for one panel (brief sections 3 and 6).
// px = mm / 25.4 * dpi, on the bleed box. Rounded up so the raster never falls
// below the target DPI. Physical millimetres never change here.

export const MM_PER_INCH = 25.4;

export function mmToPx(mm: number, dpi: number) {
  return Math.ceil(Math.round((mm / MM_PER_INCH) * dpi * 1000) / 1000);
}

export type ImageSizeTier = "1K" | "2K" | "4K";

/**
 * Output sizes for gemini-3-pro-image by aspect ratio and tier, from Google's
 * image generation docs (Interactions API, response_format.image).
 * TODO(Q2): confirm the ratio/size table and whether exact pixel sizes can be requested.
 */
export const GEMINI_PRO_IMAGE_SIZES: Record<string, Record<ImageSizeTier, [number, number]>> = {
  "1:1": { "1K": [1024, 1024], "2K": [2048, 2048], "4K": [4096, 4096] },
  "2:3": { "1K": [848, 1264], "2K": [1696, 2528], "4K": [3392, 5056] },
  "3:2": { "1K": [1264, 848], "2K": [2528, 1696], "4K": [5056, 3392] },
  "3:4": { "1K": [896, 1200], "2K": [1792, 2400], "4K": [3584, 4800] },
  "4:3": { "1K": [1200, 896], "2K": [2400, 1792], "4K": [4800, 3584] },
  "4:5": { "1K": [928, 1152], "2K": [1856, 2304], "4K": [3712, 4608] },
  "5:4": { "1K": [1152, 928], "2K": [2304, 1856], "4K": [4608, 3712] },
  "9:16": { "1K": [768, 1376], "2K": [1536, 2752], "4K": [3072, 5504] },
  "16:9": { "1K": [1376, 768], "2K": [2752, 1536], "4K": [5504, 3072] },
  "21:9": { "1K": [1584, 672], "2K": [3168, 1344], "4K": [6336, 2688] },
};

const TIERS: ImageSizeTier[] = ["1K", "2K", "4K"];

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** Exact "w:h" of the bleed box, reduced, at 0.1 mm resolution. */
export function exactAspectRatio(widthMm: number, heightMm: number) {
  const w = Math.round(widthMm * 10);
  const h = Math.round(heightMm * 10);
  const divisor = gcd(w, h) || 1;
  return `${w / divisor}:${h / divisor}`;
}

export function ratioValue(ratio: string) {
  const [w, h] = ratio.split(":").map(Number);
  return w / h;
}

/** Closest supported ratio in log space, so 2:1 and 1:2 are treated alike. */
export function closestSupportedRatio(widthMm: number, heightMm: number, supported = Object.keys(GEMINI_PRO_IMAGE_SIZES)) {
  const target = Math.log(widthMm / heightMm);
  let best = supported[0];
  for (const ratio of supported) {
    if (Math.abs(Math.log(ratioValue(ratio)) - target) < Math.abs(Math.log(ratioValue(best)) - target)) best = ratio;
  }
  return best;
}

/**
 * Share of the generated image lost when it is cover-scaled onto the bleed box
 * (or, equivalently, letterboxed). Brief section 7 warns above 2%.
 */
export function coverCropFraction(imageRatio: number, boxRatio: number) {
  return 1 - Math.min(imageRatio / boxRatio, boxRatio / imageRatio);
}

export interface PanelImageSpec {
  bleedWidthMm: number;
  bleedHeightMm: number;
  /** Exact bleed-box ratio, stored on Generation.aspectRatio. */
  aspectRatio: string;
  /** Target pixels at the configured DPI on the bleed box. */
  widthPx: number;
  heightPx: number;
  dpi: number;
  /** What the model is asked for. */
  requestedAspectRatio: string;
  imageSize: ImageSizeTier;
  expectedWidthPx: number;
  expectedHeightPx: number;
  /** True when even the largest tier is below target and the raster will need upscaling. */
  upscaleRequired: boolean;
  coverCropFraction: number;
}

export function panelImageSpec(panel: Pick<Panel, "widthMm" | "heightMm" | "bleedMm">, dpi = 300): PanelImageSpec {
  const { widthMm, heightMm } = bleedSizeMm(panel);
  const widthPx = mmToPx(widthMm, dpi);
  const heightPx = mmToPx(heightMm, dpi);
  const requestedAspectRatio = closestSupportedRatio(widthMm, heightMm);
  const sizes = GEMINI_PRO_IMAGE_SIZES[requestedAspectRatio];
  // Cover-scaling crops the long side, so the binding constraint is the scale factor.
  const scaleNeeded = (size: [number, number]) => Math.max(widthPx / size[0], heightPx / size[1]);
  const tier = TIERS.find((item) => scaleNeeded(sizes[item]) <= 1) ?? "4K";
  const [expectedWidthPx, expectedHeightPx] = sizes[tier];
  return {
    bleedWidthMm: widthMm,
    bleedHeightMm: heightMm,
    aspectRatio: exactAspectRatio(widthMm, heightMm),
    widthPx,
    heightPx,
    dpi,
    requestedAspectRatio,
    imageSize: tier,
    expectedWidthPx,
    expectedHeightPx,
    // TODO(Q8): upscaling / vectorising beyond 4K is not decided; flagged for QA.
    upscaleRequired: scaleNeeded(sizes[tier]) > 1,
    coverCropFraction: coverCropFraction(ratioValue(requestedAspectRatio), widthMm / heightMm),
  };
}

/** Effective DPI of a raster cover-scaled onto a bleed box. */
export function effectiveDpi(widthPx: number, heightPx: number, bleedWidthMm: number, bleedHeightMm: number) {
  const scale = Math.max(bleedWidthMm / widthPx, bleedHeightMm / heightPx); // mm per px after cover
  return MM_PER_INCH / scale;
}
