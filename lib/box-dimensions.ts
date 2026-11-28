// Shared millimetre size formatting for box cards and the studio.

export type BoxDimensions = {
  length: number;
  width: number;
  height: number;
};

/** "120 × 60 × 160 mm", or null when any side is missing or not positive. */
export function formatSize(box: BoxDimensions): string | null {
  if (!(box.length > 0 && box.width > 0 && box.height > 0)) return null;
  return `${formatMm(box.length)} × ${formatMm(box.width)} × ${formatMm(box.height)} mm`;
}

export function formatMm(value: number) {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
