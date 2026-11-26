import type { DielineScene } from "@/lib/dieline-types";
import { flattenSvgPath, type PathPoint } from "@/lib/svg-path";

export type DielineBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
};

export type DielinePanel = {
  name: string;
  width: number;
  height: number;
};

function pointsOf(scene: DielineScene) {
  const points: PathPoint[] = [];
  for (const face of scene.faces) {
    for (const outline of flattenSvgPath(face.path)) points.push(...outline);
  }
  return points;
}

export function dielineBounds(scene: DielineScene): DielineBounds | null {
  const points = pointsOf(scene);
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
  if (maxX <= minX || maxY <= minY) return null;
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

export function dielinePanels(scene: DielineScene): DielinePanel[] {
  return scene.faces.flatMap((face) => {
    const points = flattenSvgPath(face.path).flat();
    if (points.length === 0) return [];
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
    return [
      {
        name: face.name,
        width: Math.round((maxX - minX) * 10) / 10,
        height: Math.round((maxY - minY) * 10) / 10,
      },
    ];
  });
}

export function dielineSvg(scene: DielineScene) {
  const bounds = dielineBounds(scene);
  if (!bounds) return "";
  const paths = scene.faces
    .filter((face) => face.path.trim())
    .map((face) => `<path id="${face.name}" d="${face.path}"/>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}">${paths}</svg>`;
}

function trace(context: CanvasRenderingContext2D, points: PathPoint[]) {
  context.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) {
    context.lineTo(points[index].x, points[index].y);
  }
  context.closePath();
}

// The guide is the same millimetre layout the 3D faces use, so the returned
// print can be wrapped by those coordinates.
export function drawDielineGuide(scene: DielineScene) {
  const bounds = dielineBounds(scene);
  if (!bounds) return "";
  const longest = Math.max(bounds.width, bounds.height);
  const scale = 1024 / longest;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bounds.width * scale));
  canvas.height = Math.max(1, Math.round(bounds.height * scale));
  const context = canvas.getContext("2d");
  if (!context) return "";
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.setTransform(scale, 0, 0, scale, -bounds.minX * scale, -bounds.minY * scale);
  context.lineWidth = 1.5 / scale;
  context.strokeStyle = "#1c1915";
  context.fillStyle = "#f4efe6";
  for (const face of scene.faces) {
    const outline = flattenSvgPath(face.path)[0];
    if (!outline || outline.length < 3) continue;
    context.beginPath();
    trace(context, outline);
    context.fill();
    context.stroke();
  }
  return canvas.toDataURL("image/png");
}

export async function shrinkProductPhoto(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("This photo could not be read."));
      element.src = url;
    });
    const scale = Math.min(1, 1024 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This photo could not be read.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.86);
  } finally {
    URL.revokeObjectURL(url);
  }
}
