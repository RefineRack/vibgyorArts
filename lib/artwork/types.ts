// Contract types for the Packdora artwork pipeline (brief section 4).
// Keep these in step with the brief; every pipeline module imports from here.

export type Mm = number; // millimetres
export type HexColour = string;

export const PANEL_ROLES = [
  "front",
  "back",
  "left",
  "right",
  "top",
  "bottom",
  "lid",
  "lid_flap",
  "dust_flap",
  "tuck_flap",
  "glue_flap",
  "base",
  "other",
] as const;

export type PanelRole = (typeof PANEL_ROLES)[number];

export type LineKind = "cut" | "fold" | "bleed" | "safe" | "perforation";

export type Edge = "top" | "right" | "bottom" | "left";

export const EDGES: readonly Edge[] = ["top", "right", "bottom", "left"];

export interface Box {
  id: string;
  sku: string; // Packdora SKU
  name: string;
  style: string; // e.g. "tuck-end", "tray-and-lid", "mailer"
  svgPath: string; // canonical dieline SVG in object storage
  boardWidthMm: Mm; // full flat width (sheet of the dieline)
  boardHeightMm: Mm;
  finishedWidthMm: Mm; // assembled box
  finishedDepthMm: Mm;
  finishedHeightMm: Mm;
  defaultBleedMm: Mm; // 3
  defaultSafeMm: Mm; // 3
  spotLayerName: string; // default "CutContour"
  creaseLayerName: string; // default "Crease"
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface PanelNeighbour {
  panelName: string;
  edge: Edge;
  notes?: string; // "wraps around spine", "shares lid hinge"
}

export interface Panel {
  id: string;
  boxId: string;
  role: PanelRole;
  name: string; // stable key used in SVG, e.g. "front"
  widthMm: Mm; // trim (cut) size, not including bleed
  heightMm: Mm;
  bleedMm: Mm;
  safeMm: Mm;
  // Position of the trim box on the dieline, origin top-left of the board
  xMm: Mm;
  yMm: Mm;
  rotationDeg: number; // 0 | 90 | 180 | 270 typically
  // SVG element IDs in the canonical file
  svgGroupId: string; // e.g. "panel-front"
  cutPathId: string;
  foldPathIds: string[];
  bleedPathId: string;
  safePathId: string;
  printFacing: "outside" | "inside";
  neighbours: PanelNeighbour[];
  unprinted: boolean; // glue flaps often stay unprinted
}

export type JobStatus =
  | "draft"
  | "generating"
  | "qa_failed"
  | "pending_review"
  | "approved"
  | "exported"
  | "rejected";

export interface Job {
  id: string;
  boxId: string;
  customerName: string;
  brandName: string;
  // Structured brief used to build prompts
  brief: JobBrief;
  status: JobStatus;
  // TODO(Q4): who signs off (one approver or a chain) is unconfirmed; one approver for now.
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type TextRole = "brand" | "product" | "variant" | "legal" | "other";

export interface JobBrief {
  styleDescriptor: string; // "minimal luxury, matte, botanical"
  palette: { name: string; hex: HexColour; cmyk?: [number, number, number, number] }[];
  mustIncludeText: Array<{
    copy: string;
    role: TextRole;
    panelHints?: PanelRole[]; // where it should appear
  }>;
  logoAssetIds: string[]; // vector assets
  referenceAssetIds: string[]; // mood / product photos, not for print
  finishing: {
    coating?: "none" | "aqueous" | "uv" | "uv_spot";
    foil?: { colour: string; panelNames: string[]; notes?: string };
    spotColours?: { name: string; pantone?: string; panelNames: string[] }[];
  };
  continuityNotes?: string; // "pattern wraps front to left side"
}

export interface Generation {
  id: string;
  jobId: string;
  panelId: string;
  attempt: number;
  model: string; // e.g. "gemini-3-pro-image" (TODO(Q2): confirm)
  prompt: string; // exact prompt sent
  aspectRatio: string; // "w:h" from panel trim + bleed
  widthPx: number;
  heightPx: number;
  seed?: string;
  status: "queued" | "succeeded" | "failed" | "rejected";
  error?: string;
  outputAssetId?: string; // raster from the model
  createdAt: string;
}

export type AssetKind =
  | "dieline_svg"
  | "logo_vector"
  | "font_file"
  | "panel_raster"
  | "vectorised_illustration"
  | "composed_svg"
  | "press_pdf"
  | "mockup_png"
  | "qa_report"
  | "reference";

export interface Asset {
  id: string;
  jobId?: string;
  kind: AssetKind;
  mimeType: string;
  path: string; // object storage key
  widthPx?: number;
  heightPx?: number;
  dpi?: number;
  colourSpace?: "rgb" | "cmyk" | "spot" | "n/a";
  isVector: boolean;
  metadata: Record<string, unknown>;
}

export function isPanelRole(value: unknown): value is PanelRole {
  return typeof value === "string" && (PANEL_ROLES as readonly string[]).includes(value);
}
