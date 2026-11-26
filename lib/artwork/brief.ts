import type { ArtworkRepository } from "@/lib/artwork/records/repository";
import { isPanelRole, type JobBrief, type Panel } from "@/lib/artwork/types";

// Pipeline step 2: validate the brief before any model call (brief section 5).

export interface BriefIssue {
  field: string;
  message: string;
}

export class BriefValidationError extends Error {
  constructor(readonly issues: BriefIssue[]) {
    super(`The brief is not valid:\n${issues.map((issue) => `- ${issue.field}: ${issue.message}`).join("\n")}`);
    this.name = "BriefValidationError";
  }
}

const HEX = /^#[0-9a-f]{6}$/i;

export async function validateBrief(brief: JobBrief, panels: Panel[], repo: ArtworkRepository): Promise<BriefIssue[]> {
  const issues: BriefIssue[] = [];
  const names = new Set(panels.map((panel) => panel.name));
  if (!brief.styleDescriptor?.trim()) issues.push({ field: "styleDescriptor", message: "Describe the style." });
  brief.palette.forEach((colour, index) => {
    if (!colour.name?.trim()) issues.push({ field: `palette[${index}].name`, message: "Each colour needs a name." });
    if (!HEX.test(colour.hex)) issues.push({ field: `palette[${index}].hex`, message: `"${colour.hex}" is not a #RRGGBB colour.` });
    if (colour.cmyk && (colour.cmyk.length !== 4 || colour.cmyk.some((value) => !(value >= 0 && value <= 100)))) {
      issues.push({ field: `palette[${index}].cmyk`, message: "CMYK values must be four numbers from 0 to 100." });
    }
  });
  brief.mustIncludeText.forEach((item, index) => {
    if (!item.copy?.trim()) issues.push({ field: `mustIncludeText[${index}].copy`, message: "Copy cannot be empty." });
    for (const hint of item.panelHints ?? []) {
      if (!isPanelRole(hint)) issues.push({ field: `mustIncludeText[${index}].panelHints`, message: `"${hint}" is not a panel role.` });
    }
  });
  for (const [index, id] of brief.logoAssetIds.entries()) {
    const asset = await repo.getAsset(id);
    if (!asset) issues.push({ field: `logoAssetIds[${index}]`, message: `Asset ${id} was not found.` });
    else if (asset.kind !== "logo_vector" || !asset.isVector) {
      issues.push({ field: `logoAssetIds[${index}]`, message: `Asset ${id} is not a vector logo.` });
    }
  }
  // TODO(Q10): finishing is only checked for consistency here; whether varnish/foil
  // plates ship in the first press PDF is decided in phase 5.
  const { foil, spotColours } = brief.finishing;
  for (const name of foil?.panelNames ?? []) {
    if (!names.has(name)) issues.push({ field: "finishing.foil.panelNames", message: `"${name}" is not a panel on this box.` });
  }
  for (const spot of spotColours ?? []) {
    for (const name of spot.panelNames) {
      if (!names.has(name)) issues.push({ field: "finishing.spotColours", message: `"${name}" is not a panel on this box.` });
    }
  }
  return issues;
}
