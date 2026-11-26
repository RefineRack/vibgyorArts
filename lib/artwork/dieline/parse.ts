import { parseSync, type INode } from "svgson";
import { EDGES, isPanelRole, type Edge, type Panel, type PanelNeighbour, type PanelRole } from "@/lib/artwork/types";
import { MM_TOLERANCE, elementBounds, offsetRect, rectInside, rectsClose, roundMm, type Rect } from "@/lib/artwork/dieline/geometry";

// Reads a canonical dieline SVG (brief section 4 conventions) into panel data
// and reports every convention it breaks. No network, no storage.

export type ParsedPanel = Omit<Panel, "id" | "boxId">;

export interface DielineIssue {
  code: string;
  message: string;
  panel?: string;
}

export interface SidecarPanel {
  role?: PanelRole;
  unprinted?: boolean;
  printFacing?: "outside" | "inside";
  bleedMm?: number;
  safeMm?: number;
  rotationDeg?: number;
  neighbours?: PanelNeighbour[];
}

/** Optional JSON beside the SVG for data that is awkward to encode as attributes. */
export interface DielineSidecar {
  box?: {
    sku?: string;
    name?: string;
    style?: string;
    finishedWidthMm?: number;
    finishedDepthMm?: number;
    finishedHeightMm?: number;
  };
  panels?: Record<string, SidecarPanel>;
}

export interface ParsedDieline {
  boardWidthMm: number;
  boardHeightMm: number;
  box: {
    sku?: string;
    name?: string;
    style?: string;
    finishedWidthMm?: number;
    finishedDepthMm?: number;
    finishedHeightMm?: number;
    spotLayerName?: string;
    creaseLayerName?: string;
    draft: boolean;
  };
  panels: ParsedPanel[];
  errors: DielineIssue[];
  warnings: DielineIssue[];
}

export interface ParseOptions {
  defaultBleedMm: number;
  defaultSafeMm: number;
  sidecar?: DielineSidecar;
}

const NAME = /^[a-z0-9][a-z0-9_]*(?:-[a-z0-9_]+)*$/;

function walk(node: INode, visit: (node: INode) => void) {
  visit(node);
  for (const child of node.children) walk(child, visit);
}

function mmLength(value: string | undefined) {
  const match = value?.trim().match(/^(\d+(?:\.\d+)?)mm$/);
  return match ? Number(match[1]) : null;
}

function optionalNumber(value: string | undefined) {
  if (value === undefined || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function roleFromName(name: string): PanelRole | null {
  return isPanelRole(name) ? name : null;
}

export function parseDieline(svg: string, options: ParseOptions): ParsedDieline {
  const errors: DielineIssue[] = [];
  const warnings: DielineIssue[] = [];
  const result: ParsedDieline = { boardWidthMm: 0, boardHeightMm: 0, box: { draft: false }, panels: [], errors, warnings };

  let root: INode;
  try {
    root = parseSync(svg);
  } catch (error) {
    errors.push({ code: "svg-unreadable", message: `The SVG could not be parsed: ${(error as Error).message}` });
    return result;
  }
  if (root.name !== "svg") {
    errors.push({ code: "svg-root", message: "The root element must be <svg>." });
    return result;
  }

  // Board size: viewBox in mm starting at 0 0, width/height in mm that agree.
  const viewBox = (root.attributes.viewBox ?? "").trim().split(/[\s,]+/).map(Number);
  const width = mmLength(root.attributes.width);
  const height = mmLength(root.attributes.height);
  if (viewBox.length !== 4 || viewBox.some((value) => !Number.isFinite(value))) {
    errors.push({ code: "viewbox-missing", message: "The SVG needs viewBox=\"0 0 {boardWidthMm} {boardHeightMm}\"." });
  } else if (viewBox[0] !== 0 || viewBox[1] !== 0 || viewBox[2] <= 0 || viewBox[3] <= 0) {
    errors.push({ code: "viewbox-origin", message: "The viewBox must start at 0 0 and have a positive size." });
  } else {
    result.boardWidthMm = roundMm(viewBox[2]);
    result.boardHeightMm = roundMm(viewBox[3]);
  }
  if (width === null || height === null) {
    errors.push({ code: "units-not-mm", message: "The SVG width and height must be given in millimetres, e.g. width=\"300mm\"." });
  } else if (
    result.boardWidthMm > 0 &&
    (Math.abs(width - result.boardWidthMm) > MM_TOLERANCE || Math.abs(height - result.boardHeightMm) > MM_TOLERANCE)
  ) {
    errors.push({ code: "units-mismatch", message: "width/height in mm must equal the viewBox size (1 user unit = 1 mm)." });
  }

  const attr = root.attributes;
  const sidecarBox = options.sidecar?.box ?? {};
  result.box = {
    sku: sidecarBox.sku ?? attr["data-sku"],
    name: sidecarBox.name ?? attr["data-name"],
    style: sidecarBox.style ?? attr["data-style"],
    finishedWidthMm: sidecarBox.finishedWidthMm ?? optionalNumber(attr["data-finished-width-mm"]),
    finishedDepthMm: sidecarBox.finishedDepthMm ?? optionalNumber(attr["data-finished-depth-mm"]),
    finishedHeightMm: sidecarBox.finishedHeightMm ?? optionalNumber(attr["data-finished-height-mm"]),
    spotLayerName: attr["data-spot-layer"],
    creaseLayerName: attr["data-crease-layer"],
    draft: attr["data-draft"] === "true",
  };
  if (result.box.draft) {
    warnings.push({ code: "draft", message: "This dieline is marked as a draft; a person should check it before production." });
  }

  // Index ids, reject transforms (geometry must be in board millimetres).
  const ids = new Map<string, INode>();
  walk(root, (node) => {
    const id = node.attributes.id;
    if (id) {
      if (ids.has(id)) errors.push({ code: "duplicate-id", message: `The id "${id}" is used more than once.` });
      ids.set(id, node);
    }
    if (node.attributes.transform) {
      errors.push({
        code: "transform",
        message: `Element ${id ? `"${id}"` : `<${node.name}>`} has a transform. Flatten transforms so coordinates are board millimetres.`,
      });
    }
    if (node.name === "image") {
      warnings.push({ code: "raster-in-dieline", message: "The dieline contains an <image>; dielines should be geometry only." });
    }
  });

  const board: Rect = { x: 0, y: 0, width: result.boardWidthMm, height: result.boardHeightMm };
  const groups = [...ids.entries()].filter(([id, node]) => id.startsWith("panel-") && node.name === "g");
  if (groups.length === 0) {
    errors.push({ code: "no-panels", message: "No panel groups found. Each panel needs <g id=\"panel-{name}\">." });
  }
  const names = new Set(groups.map(([id]) => id.slice("panel-".length)));
  const claimed = new Set<string>();

  for (const [groupId, group] of groups) {
    const name = groupId.slice("panel-".length);
    const issue = (code: string, message: string) => errors.push({ code, message, panel: name });
    if (!NAME.test(name)) {
      issue("panel-name", `Panel name "${name}" must be lower case letters, digits, "_" or "-".`);
      continue;
    }
    const side = options.sidecar?.panels?.[name] ?? {};
    const inside = new Map<string, INode>();
    walk(group, (node) => {
      if (node.attributes.id) inside.set(node.attributes.id, node);
    });

    const dataRole = group.attributes["data-role"];
    let role: PanelRole | null = side.role ?? (isPanelRole(dataRole) ? dataRole : null);
    if (!role && dataRole) issue("panel-role", `Unknown data-role "${dataRole}".`);
    if (!role) role = roleFromName(name);
    if (!role) {
      role = "other";
      warnings.push({ code: "panel-role-missing", message: "No data-role; using \"other\".", panel: name });
    }

    const unprinted = side.unprinted ?? group.attributes["data-unprinted"] === "true";
    const facing = side.printFacing ?? group.attributes["data-print-facing"] ?? "outside";
    if (facing !== "outside" && facing !== "inside") issue("print-facing", `data-print-facing must be "outside" or "inside".`);
    const bleedMm = side.bleedMm ?? optionalNumber(group.attributes["data-bleed-mm"]) ?? options.defaultBleedMm;
    const safeMm = side.safeMm ?? optionalNumber(group.attributes["data-safe-mm"]) ?? options.defaultSafeMm;
    const rotationDeg = side.rotationDeg ?? optionalNumber(group.attributes["data-rotation"]) ?? 0;
    if (!(bleedMm >= 0)) issue("bleed-value", "data-bleed-mm must be a number of millimetres.");
    if (!(safeMm >= 0)) issue("safe-value", "data-safe-mm must be a number of millimetres.");
    if (![0, 90, 180, 270].includes(rotationDeg)) issue("rotation", "data-rotation must be 0, 90, 180 or 270.");

    const cutId = `cut-${name}`;
    const bleedId = `bleed-${name}`;
    const safeId = `safe-${name}`;
    for (const id of [cutId, bleedId, safeId]) claimed.add(id);
    const cutNode = inside.get(cutId);
    const cut = cutNode ? elementBounds(cutNode) : null;
    if (!cutNode) {
      issue("cut-missing", `Missing #${cutId} inside #${groupId}.`);
      continue;
    }
    if (!cut) {
      issue("cut-unmeasurable", `#${cutId} must be a closed path, rect or polygon.`);
      continue;
    }
    if (board.width > 0 && !rectInside(cut, board)) issue("cut-outside-board", `#${cutId} extends beyond the board.`);

    const foldPathIds = [...inside.keys()].filter((id) => id.startsWith(`fold-${name}-`)).sort();
    foldPathIds.forEach((id) => claimed.add(id));

    const bleedNode = inside.get(bleedId);
    const safeNode = inside.get(safeId);
    if (!unprinted) {
      // Brief section 3: bleed is bleedMm beyond the cut, safe is safeMm inside it.
      const bleed = bleedNode ? elementBounds(bleedNode) : null;
      const safe = safeNode ? elementBounds(safeNode) : null;
      if (!bleedNode) issue("bleed-missing", `Missing #${bleedId}; printed panels need a bleed path.`);
      else if (!bleed) issue("bleed-unmeasurable", `#${bleedId} must be a closed shape.`);
      else if (!rectsClose(bleed, offsetRect(cut, bleedMm))) {
        issue("bleed-mismatch", `#${bleedId} must sit ${bleedMm} mm beyond the cut line on every side (±${MM_TOLERANCE} mm).`);
      } else if (board.width > 0 && !rectInside(bleed, board)) {
        warnings.push({ code: "bleed-outside-board", message: `#${bleedId} extends beyond the board.`, panel: name });
      }
      if (!safeNode) issue("safe-missing", `Missing #${safeId}; printed panels need a safe-zone path.`);
      else if (!safe) issue("safe-unmeasurable", `#${safeId} must be a closed shape.`);
      else if (!rectsClose(safe, offsetRect(cut, -safeMm))) {
        issue("safe-mismatch", `#${safeId} must sit ${safeMm} mm inside the cut line on every side (±${MM_TOLERANCE} mm).`);
      }
      if (cut.width <= 2 * safeMm || cut.height <= 2 * safeMm) issue("safe-empty", "The safe zone has no area left.");
    }

    // Neighbours: data-neighbour-{edge}="name" (+ optional -notes), or the sidecar.
    let neighbours: PanelNeighbour[] = side.neighbours ?? [];
    if (!side.neighbours) {
      neighbours = EDGES.flatMap((edge: Edge) => {
        const panelName = group.attributes[`data-neighbour-${edge}`];
        if (!panelName) return [];
        const notes = group.attributes[`data-neighbour-${edge}-notes`];
        return [notes ? { panelName, edge, notes } : { panelName, edge }];
      });
    }
    for (const neighbour of neighbours) {
      if (!names.has(neighbour.panelName)) {
        issue("neighbour-unknown", `Neighbour "${neighbour.panelName}" on the ${neighbour.edge} edge is not a panel in this file.`);
      }
      if (!EDGES.includes(neighbour.edge)) issue("neighbour-edge", `Neighbour edge "${neighbour.edge}" is not valid.`);
    }

    const sideways = rotationDeg === 90 || rotationDeg === 270;
    result.panels.push({
      role,
      name,
      widthMm: roundMm(sideways ? cut.height : cut.width),
      heightMm: roundMm(sideways ? cut.width : cut.height),
      bleedMm,
      safeMm,
      xMm: roundMm(cut.x),
      yMm: roundMm(cut.y),
      rotationDeg,
      svgGroupId: groupId,
      cutPathId: cutId,
      foldPathIds,
      bleedPathId: bleedNode ? bleedId : "",
      safePathId: safeNode ? safeId : "",
      printFacing: facing === "inside" ? "inside" : "outside",
      neighbours,
      unprinted,
    });
  }

  for (const id of ids.keys()) {
    if (/^(cut|bleed|safe|fold)-/.test(id) && !claimed.has(id)) {
      warnings.push({ code: "orphan-line", message: `#${id} is not inside a matching panel group and was ignored.` });
    }
  }
  for (const name of Object.keys(options.sidecar?.panels ?? {})) {
    if (!names.has(name)) warnings.push({ code: "sidecar-unknown", message: `The sidecar mentions "${name}", which is not in the SVG.` });
  }
  if (result.panels.length > 0 && result.panels.every((panel) => panel.unprinted)) {
    errors.push({ code: "nothing-printed", message: "Every panel is marked unprinted." });
  }
  return result;
}
