import type { INode } from "svgson";
import { flattenSvgPath, type PathPoint } from "@/lib/svg-path";
import type { Mm, Panel } from "@/lib/artwork/types";

// Axis-aligned millimetre geometry. SVG user units are millimetres (brief
// section 3), so no unit conversion happens here.

export type Rect = { x: Mm; y: Mm; width: Mm; height: Mm };

export const MM_TOLERANCE = 0.1;

export function rectFromPoints(points: PathPoint[]): Rect | null {
  if (points.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  if (!(maxX > minX && maxY > minY)) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Grow (positive) or shrink (negative) a rectangle on every side. */
export function offsetRect(rect: Rect, by: Mm): Rect {
  return { x: rect.x - by, y: rect.y - by, width: rect.width + 2 * by, height: rect.height + 2 * by };
}

export function rectsClose(a: Rect, b: Rect, tolerance = MM_TOLERANCE) {
  return (
    Math.abs(a.x - b.x) <= tolerance &&
    Math.abs(a.y - b.y) <= tolerance &&
    Math.abs(a.width - b.width) <= tolerance &&
    Math.abs(a.height - b.height) <= tolerance
  );
}

export function rectInside(inner: Rect, outer: Rect, tolerance = MM_TOLERANCE) {
  return (
    inner.x >= outer.x - tolerance &&
    inner.y >= outer.y - tolerance &&
    inner.x + inner.width <= outer.x + outer.width + tolerance &&
    inner.y + inner.height <= outer.y + outer.height + tolerance
  );
}

function numberAttr(node: INode, name: string) {
  const value = Number(node.attributes[name] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function pointList(value: string | undefined) {
  const numbers = (value ?? "").trim().split(/[\s,]+/).filter(Boolean).map(Number);
  const points: PathPoint[] = [];
  for (let index = 0; index + 1 < numbers.length; index += 2) points.push({ x: numbers[index], y: numbers[index + 1] });
  return points;
}

/** Bounding box of a single shape element, in the file's user units (mm). */
export function elementBounds(node: INode): Rect | null {
  switch (node.name) {
    case "path":
      return rectFromPoints(flattenSvgPath(node.attributes.d ?? "").flat());
    case "rect": {
      const width = numberAttr(node, "width");
      const height = numberAttr(node, "height");
      return width > 0 && height > 0 ? { x: numberAttr(node, "x"), y: numberAttr(node, "y"), width, height } : null;
    }
    case "polygon":
    case "polyline":
      return rectFromPoints(pointList(node.attributes.points));
    default:
      return null;
  }
}

/** Trim rectangle on the board. Width/height on a panel are in reading orientation. */
export function boardTrimRect(panel: Pick<Panel, "xMm" | "yMm" | "widthMm" | "heightMm" | "rotationDeg">): Rect {
  const sideways = Math.abs(panel.rotationDeg % 180) === 90;
  return {
    x: panel.xMm,
    y: panel.yMm,
    width: sideways ? panel.heightMm : panel.widthMm,
    height: sideways ? panel.widthMm : panel.heightMm,
  };
}

export function boardBleedRect(panel: Panel): Rect {
  return offsetRect(boardTrimRect(panel), panel.bleedMm);
}

export function boardSafeRect(panel: Panel): Rect {
  return offsetRect(boardTrimRect(panel), -panel.safeMm);
}

/** Bleed box size in reading orientation (what the image model is asked to fill). */
export function bleedSizeMm(panel: Pick<Panel, "widthMm" | "heightMm" | "bleedMm">) {
  return { widthMm: panel.widthMm + 2 * panel.bleedMm, heightMm: panel.heightMm + 2 * panel.bleedMm };
}

export function safeSizeMm(panel: Pick<Panel, "widthMm" | "heightMm" | "safeMm">) {
  return { widthMm: panel.widthMm - 2 * panel.safeMm, heightMm: panel.heightMm - 2 * panel.safeMm };
}

/** Rounds to 0.01 mm to keep float noise out of stored records. */
export function roundMm(value: number) {
  return Math.round(value * 100) / 100;
}

/** "70", "70.5" — for prompts and messages. */
export function formatMm(value: number) {
  return String(Math.round(value * 10) / 10);
}
