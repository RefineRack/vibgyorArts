import type { DielineScene } from "@/lib/dieline-types";
import { flattenSvgPath, type PathPoint } from "@/lib/svg-path";
import { PANEL_ROLES, type Edge, type PanelRole } from "@/lib/artwork/types";
import { formatMm, offsetRect, rectFromPoints, type Rect } from "@/lib/artwork/dieline/geometry";

// Bridges the studio's Pacdora dieline (DielineScene from the Dieline API) to a
// *draft* canonical SVG. The brief expects VibgyorArts to supply cleaned SVGs
// with named panels; this only gives an operator a starting file. Panel roles
// are guessed from face names, bleed/safe are bounding-box rectangles, curves
// are flattened, and folds are not drawn, so the result is marked data-draft.
// TODO(Q3): replace with the supplied SVGs once the SKU list is agreed.

function guessRole(name: string): PanelRole {
  const lower = name.toLowerCase();
  if (/glue/.test(lower)) return "glue_flap";
  if (/dust/.test(lower)) return "dust_flap";
  if (/tuck/.test(lower)) return "tuck_flap";
  if (/lid.*flap|flap.*lid/.test(lower)) return "lid_flap";
  return PANEL_ROLES.find((role) => role !== "other" && lower.includes(role)) ?? "other";
}

function slug(name: string, used: Set<string>) {
  const base = name.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || "panel";
  let candidate = base;
  for (let index = 2; used.has(candidate); index += 1) candidate = `${base}_${index}`;
  used.add(candidate);
  return candidate;
}

function rectPath(rect: Rect) {
  const f = (value: number) => formatMm(value);
  return `M${f(rect.x)} ${f(rect.y)}H${f(rect.x + rect.width)}V${f(rect.y + rect.height)}H${f(rect.x)}Z`;
}

function edgeBetween(from: Rect, to: Rect): Edge {
  const dx = to.x + to.width / 2 - (from.x + from.width / 2);
  const dy = to.y + to.height / 2 - (from.y + from.height / 2);
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? "right" : "left";
  return dy > 0 ? "bottom" : "top";
}

export function pacdoraSceneToDraftSvg(scene: DielineScene, options: { sku: string; name?: string; bleedMm?: number; safeMm?: number }) {
  const bleed = options.bleedMm ?? 3;
  const safe = options.safeMm ?? 3;
  const used = new Set<string>();
  const faces = scene.faces
    .map((face) => {
      const outline = flattenSvgPath(face.path)[0] ?? [];
      return { face, outline, bounds: rectFromPoints(outline), name: slug(face.name, used) };
    })
    .filter((item): item is typeof item & { bounds: Rect } => item.bounds !== null && item.outline.length > 2);
  if (faces.length === 0) throw new Error("The Pacdora scene has no measurable faces.");

  const minX = Math.min(...faces.map((item) => item.bounds.x)) - bleed;
  const minY = Math.min(...faces.map((item) => item.bounds.y)) - bleed;
  const maxX = Math.max(...faces.map((item) => item.bounds.x + item.bounds.width)) + bleed;
  const maxY = Math.max(...faces.map((item) => item.bounds.y + item.bounds.height)) + bleed;
  const shift = (rect: Rect): Rect => ({ ...rect, x: rect.x - minX, y: rect.y - minY });
  const shiftPoints = (points: PathPoint[]) =>
    `M${points.map((point) => `${formatMm(point.x - minX)} ${formatMm(point.y - minY)}`).join("L")}Z`;

  const byFaceName = new Map(faces.map((item) => [item.face.name, item]));
  const neighbours = new Map<string, { name: string; edge: Edge }[]>();
  for (const hinge of scene.hinges) {
    const parent = byFaceName.get(hinge.parent);
    const child = byFaceName.get(hinge.child);
    if (!parent || !child) continue;
    neighbours.set(parent.name, [...(neighbours.get(parent.name) ?? []), { name: child.name, edge: edgeBetween(parent.bounds, child.bounds) }]);
    neighbours.set(child.name, [...(neighbours.get(child.name) ?? []), { name: parent.name, edge: edgeBetween(child.bounds, parent.bounds) }]);
  }

  const width = formatMm(maxX - minX);
  const height = formatMm(maxY - minY);
  const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const groups = faces.map((item) => {
    const role = guessRole(item.face.name);
    const unprinted = role === "glue_flap";
    const trim = shift(item.bounds);
    const edges = new Set<Edge>();
    const neighbourAttrs = (neighbours.get(item.name) ?? [])
      .filter((neighbour) => !edges.has(neighbour.edge) && edges.add(neighbour.edge))
      .map((neighbour) => ` data-neighbour-${neighbour.edge}="${neighbour.name}"`)
      .join("");
    const lines = [`<path id="cut-${item.name}" d="${shiftPoints(item.outline)}"/>`];
    if (!unprinted) {
      lines.push(`<path id="bleed-${item.name}" d="${rectPath(offsetRect(trim, bleed))}"/>`);
      lines.push(`<path id="safe-${item.name}" d="${rectPath(offsetRect(trim, -safe))}"/>`);
    }
    return `  <g id="panel-${item.name}" data-role="${role}" data-source-face="${escape(item.face.name)}"${unprinted ? ' data-unprinted="true"' : ""}${neighbourAttrs}>\n    ${lines.join("\n    ")}\n  </g>`;
  });

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}" data-sku="${escape(options.sku)}"${options.name ? ` data-name="${escape(options.name)}"` : ""} data-source="pacdora:${escape(scene.modelId)}" data-draft="true">`,
    ...groups,
    "</svg>",
  ].join("\n");
}
