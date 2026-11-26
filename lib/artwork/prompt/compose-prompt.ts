import type { Box, Job, Panel } from "@/lib/artwork/types";
import { formatMm, safeSizeMm } from "@/lib/artwork/dieline/geometry";
import {
  DEFAULT_LOGO_PLACEMENTS,
  DEFAULT_TEXT_ROLES,
  PANEL_LAYOUT_INSTRUCTIONS,
  TEXT_POSITIONS,
  type BriefText,
  type SlotPlacement,
} from "@/lib/artwork/prompt/layout";
import { PROMPT_TEMPLATE_VERSION, renderTemplate } from "@/lib/artwork/prompt/template";

export interface PromptOverrides {
  /** Per panel name: replaces the role's layout instruction. */
  layoutInstructions?: Record<string, string>;
  /** Per panel name: replaces the role's logo placements. */
  placements?: Record<string, SlotPlacement[]>;
}

export interface PanelPrompt {
  prompt: string;
  templateVersion: string;
  variables: Record<string, string>;
  /** Copy the composer will later set as vector type on this panel. */
  texts: BriefText[];
}

function record<T>(value: unknown): Record<string, T> {
  return value && typeof value === "object" ? (value as Record<string, T>) : {};
}

export function textsForPanel(job: Job, panel: Panel): BriefText[] {
  return job.brief.mustIncludeText.filter((item) => {
    const roles = item.panelHints && item.panelHints.length > 0 ? item.panelHints : DEFAULT_TEXT_ROLES[item.role];
    return roles.includes(panel.role);
  });
}

function logoPlacements(box: Box, panel: Panel, overrides: PromptOverrides): SlotPlacement[] {
  return (
    overrides.placements?.[panel.name] ??
    record<SlotPlacement[]>(box.metadata.placements)[panel.role] ??
    DEFAULT_LOGO_PLACEMENTS[panel.role] ??
    []
  );
}

function reservedSlots(box: Box, job: Job, panel: Panel, texts: BriefText[], overrides: PromptOverrides) {
  const safeWidth = safeSizeMm(panel).widthMm;
  const lines: string[] = [];
  if (job.brief.logoAssetIds.length > 0) {
    for (const slot of logoPlacements(box, panel, overrides).filter((item) => item.kind === "logo")) {
      const width = slot.widthFraction ? `, ~${formatMm(Math.round(safeWidth * slot.widthFraction))} mm wide` : "";
      lines.push(`- Logo, ${slot.position}${width}, inside safe zone`);
    }
  }
  const seen = new Set<string>();
  for (const text of texts) {
    if (seen.has(text.role)) continue;
    seen.add(text.role);
    const label = { brand: "Brand name", product: "Product name", variant: "Variant line", legal: "Legal line", other: "Copy" }[text.role];
    lines.push(`- ${label}, ${TEXT_POSITIONS[text.role]}, inside safe zone`);
  }
  return lines.length > 0 ? lines.join("\n") : "- None on this panel; keep the composition even";
}

function finishingNotes(job: Job, panel: Panel) {
  const { coating, foil, spotColours } = job.brief.finishing;
  const notes: string[] = [];
  if (coating && coating !== "none") notes.push(`${coating === "uv_spot" ? "spot UV" : coating === "uv" ? "UV" : "aqueous"} coating`);
  if (foil) {
    notes.push(
      foil.panelNames.includes(panel.name)
        ? `${foil.colour} foil on this panel; leave a calm, uncluttered area where it will sit${foil.notes ? ` (${foil.notes})` : ""}`
        : `${foil.colour} foil elsewhere on the box`,
    );
  }
  for (const spot of spotColours ?? []) {
    if (spot.panelNames.includes(panel.name)) notes.push(`spot colour ${spot.name}${spot.pantone ? ` (${spot.pantone})` : ""} on this panel`);
  }
  return notes.length > 0 ? notes.join("; ") : "none";
}

function neighbourDescription(panel: Panel, boxPanels: Panel[]) {
  if (panel.neighbours.length === 0) return "none";
  const unprinted = new Set(boxPanels.filter((item) => item.unprinted).map((item) => item.name));
  return panel.neighbours
    .map((neighbour) => {
      const along = neighbour.edge === "left" || neighbour.edge === "right" ? "height" : "width";
      const notes = neighbour.notes ? ` (${neighbour.notes})` : "";
      if (unprinted.has(neighbour.panelName)) {
        return `${neighbour.edge} edge meets unprinted panel '${neighbour.panelName}'${notes}; no continuity needed there`;
      }
      return `${neighbour.edge} edge meets panel '${neighbour.panelName}' along the ${along}${notes}; background should feel wrap-around`;
    })
    .join("; ");
}

/**
 * Builds the exact prompt for one panel from the section 6 template. Pure and
 * deterministic. Pass the box's other panels so unprinted neighbours are described as such.
 */
export function composePanelPrompt(
  box: Box,
  job: Job,
  panel: Panel,
  overrides: PromptOverrides = {},
  boxPanels: Panel[] = [],
): PanelPrompt {
  const safe = safeSizeMm(panel);
  const texts = textsForPanel(job, panel);
  const palette = job.brief.palette.map((colour) => `- ${colour.name} ${colour.hex.toUpperCase()}`).join("\n") || "- No fixed palette";
  const layout =
    overrides.layoutInstructions?.[panel.name] ??
    record<string>(box.metadata.layoutInstructions)[panel.role] ??
    PANEL_LAYOUT_INSTRUCTIONS[panel.role];
  const variables: Record<string, string> = {
    "panel.role": panel.role,
    "panel.name": panel.name,
    "panel.widthMm": formatMm(panel.widthMm),
    "panel.heightMm": formatMm(panel.heightMm),
    "panel.bleedMm": formatMm(panel.bleedMm),
    "panel.safeMm": formatMm(panel.safeMm),
    "panel.printFacing": panel.printFacing,
    safeWidthMm: formatMm(safe.widthMm),
    safeHeightMm: formatMm(safe.heightMm),
    "job.brandName": job.brandName,
    "brief.styleDescriptor": job.brief.styleDescriptor,
    palette_bullets: palette,
    finishing_notes: finishingNotes(job, panel),
    panel_layout_instruction: layout,
    reserved_slots: reservedSlots(box, job, panel, texts, overrides),
    text_inventory: texts.length > 0 ? texts.map((text) => `"${text.copy}"`).join(", ") : "none",
    neighbour_description: neighbourDescription(panel, boxPanels),
    "brief.continuityNotes": job.brief.continuityNotes?.trim() || "none",
  };
  return { prompt: renderTemplate(variables), templateVersion: PROMPT_TEMPLATE_VERSION, variables, texts };
}
