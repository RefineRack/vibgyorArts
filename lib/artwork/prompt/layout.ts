import type { JobBrief, PanelRole, TextRole } from "@/lib/artwork/types";

// Role maps used by the prompt composer. Both are defaults: a box can override
// them in Box.metadata.layoutInstructions / Box.metadata.placements, and a job
// run can override them again (brief section 6, derived helpers).
// TODO(Q6): default logo placements per role are unconfirmed; these are a first pass.

export const PANEL_LAYOUT_INSTRUCTIONS: Record<PanelRole, string> = {
  front: "hero face, primary visual focus",
  back: "supporting face; calmer continuation of the front with room for product and legal copy",
  left: "side panel; continuation of the pattern with modest detail",
  right: "side panel; continuation of the pattern with modest detail",
  top: "top closure seen from above; simple, balanced pattern",
  bottom: "base of the box; quiet, low-detail pattern",
  lid: "lid face, secondary hero; strong but simple visual",
  lid_flap: "small flap; plain continuation of the lid background",
  dust_flap: "small hidden flap; plain background colour or texture only",
  tuck_flap: "tuck flap, mostly hidden; plain background colour or texture only",
  glue_flap: "glue area; plain background only",
  base: "base of the box; quiet, low-detail pattern",
  other: "secondary panel; continuation of the box background",
};

export interface SlotPlacement {
  kind: "logo" | "text";
  /** For text slots, which copy role the slot is for. */
  textRole?: TextRole;
  position: string;
  /** Approximate width as a fraction of the safe-zone width. */
  widthFraction?: number;
}

export const DEFAULT_LOGO_PLACEMENTS: Partial<Record<PanelRole, SlotPlacement[]>> = {
  front: [{ kind: "logo", position: "top centre", widthFraction: 0.5 }],
  lid: [{ kind: "logo", position: "centre", widthFraction: 0.5 }],
  top: [{ kind: "logo", position: "centre", widthFraction: 0.4 }],
  back: [{ kind: "logo", position: "bottom centre", widthFraction: 0.25 }],
};

export const TEXT_POSITIONS: Record<TextRole, string> = {
  brand: "upper third",
  product: "lower third",
  variant: "below the product name",
  legal: "bottom edge inside safe zone",
  other: "lower third",
};

/** Where copy without panelHints goes. */
export const DEFAULT_TEXT_ROLES: Record<TextRole, PanelRole[]> = {
  brand: ["front", "lid"],
  product: ["front", "lid"],
  variant: ["front", "lid"],
  legal: ["back", "bottom", "base"],
  other: ["front", "lid"],
};

export type BriefText = JobBrief["mustIncludeText"][number];
