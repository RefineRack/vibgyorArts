import { dielineBounds } from "@/lib/dieline-art";
import type { DielineScene } from "@/lib/dieline-types";
import { flattenSvgPath, type PathPoint } from "@/lib/svg-path";

// Flat dieline preview for box cards: cut paths in indigo, crease/fold paths
// in salmon. Coordinates stay in millimetres. Stroke colours live in CSS.

export const CUT_COLOUR = "#3b4cc0";
export const CREASE_COLOUR = "#d45b4c";

export type PreviewPath = {
  d: string;
  kind: "cut" | "crease";
};

export type DielinePreview = {
  viewBox: string;
  widthMm: number;
  heightMm: number;
  paths: PreviewPath[];
};

type Segment = { a: PathPoint; b: PathPoint };

const PAD = 4;
const TOLERANCE = 0.8;

function distance(a: PathPoint, b: PathPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function segmentsOf(points: PathPoint[]): Segment[] {
  const segments: Segment[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    if (distance(a, b) > 0.05) segments.push({ a, b });
  }
  return segments;
}

function pointOnSegment(point: PathPoint, segment: Segment, tolerance: number) {
  const length = distance(segment.a, segment.b);
  if (length <= 0.05) return distance(point, segment.a) <= tolerance;
  const t =
    ((point.x - segment.a.x) * (segment.b.x - segment.a.x) + (point.y - segment.a.y) * (segment.b.y - segment.a.y)) /
    (length * length);
  if (t < -0.05 || t > 1.05) return false;
  const x = segment.a.x + t * (segment.b.x - segment.a.x);
  const y = segment.a.y + t * (segment.b.y - segment.a.y);
  return Math.hypot(point.x - x, point.y - y) <= tolerance;
}

function sharedSegments(parent: PathPoint[], child: PathPoint[]): Segment[] {
  const parentSegments = segmentsOf(parent);
  return segmentsOf(child).filter(
    (segment) =>
      distance(segment.a, segment.b) > TOLERANCE &&
      parentSegments.some(
        (other) => pointOnSegment(segment.a, other, TOLERANCE) && pointOnSegment(segment.b, other, TOLERANCE),
      ),
  );
}

function distanceToSegment(point: PathPoint, segment: Segment) {
  const length = distance(segment.a, segment.b);
  if (length <= 0.05) return distance(point, segment.a);
  const t = Math.min(
    1,
    Math.max(
      0,
      ((point.x - segment.a.x) * (segment.b.x - segment.a.x) + (point.y - segment.a.y) * (segment.b.y - segment.a.y)) /
        (length * length),
    ),
  );
  return Math.hypot(point.x - (segment.a.x + t * (segment.b.x - segment.a.x)), point.y - (segment.a.y + t * (segment.b.y - segment.a.y)));
}

function closestSegment(points: PathPoint[], pivot: PathPoint): Segment | null {
  let best: Segment | null = null;
  let bestDistance = Infinity;
  let bestLength = 0;
  for (const segment of segmentsOf(points)) {
    const d = distanceToSegment(pivot, segment);
    const length = distance(segment.a, segment.b);
    if (d < bestDistance - 0.05 || (Math.abs(d - bestDistance) <= 0.05 && length > bestLength)) {
      best = segment;
      bestDistance = d;
      bestLength = length;
    }
  }
  return best;
}

function pathFrom(d: string) {
  return flattenSvgPath(d).flatMap((contour) => (contour.length > 1 ? [contour] : []));
}

function segmentPath(segment: Segment) {
  return `M${round(segment.a.x)} ${round(segment.a.y)}L${round(segment.b.x)} ${round(segment.b.y)}`;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

/** Cut outlines (faces and holes) plus crease segments taken from hinges. */
export function dielinePreview(scene: DielineScene): DielinePreview | null {
  const bounds = dielineBounds(scene);
  if (!bounds) return null;

  const paths: PreviewPath[] = [];
  const outlines = new Map<string, PathPoint[]>();
  for (const face of scene.faces) {
    const contours = pathFrom(face.path);
    if (contours[0]) outlines.set(face.name, contours[0]);
    if (face.path.trim() && contours.length > 0) paths.push({ kind: "cut", d: face.path });
    for (const hole of face.holes) {
      if (hole.trim()) paths.push({ kind: "cut", d: hole });
    }
  }

  const seen = new Set<string>();
  for (const hinge of scene.hinges) {
    const parent = outlines.get(hinge.parent);
    const child = outlines.get(hinge.child);
    if (!parent || !child) continue;
    let creases = sharedSegments(parent, child);
    if (creases.length === 0) {
      const fallback = closestSegment(child, { x: hinge.pivot.x, y: hinge.pivot.y });
      if (fallback) creases = [fallback];
    }
    for (const crease of creases) {
      const d = segmentPath(crease);
      if (seen.has(d)) continue;
      seen.add(d);
      paths.push({ kind: "crease", d });
    }
  }

  return {
    viewBox: `${round(bounds.minX - PAD)} ${round(bounds.minY - PAD)} ${round(bounds.width + PAD * 2)} ${round(bounds.height + PAD * 2)}`,
    widthMm: bounds.width,
    heightMm: bounds.height,
    paths,
  };
}

/** Stand-alone SVG, useful in tests and for data URLs. Colours match the CSS tokens. */
export function dielinePreviewSvg(scene: DielineScene) {
  const preview = dielinePreview(scene);
  if (!preview) return "";
  const parts = preview.paths
    .map((path) => {
      const colour = path.kind === "cut" ? CUT_COLOUR : CREASE_COLOUR;
      const dash = path.kind === "crease" ? ' stroke-dasharray="2 1.5"' : "";
      return `<path d="${path.d}" fill="none" stroke="${colour}" stroke-width="0.7" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"${dash}/>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${preview.viewBox}" width="${preview.widthMm}mm" height="${preview.heightMm}mm">${parts}</svg>`;
}
