import { pacdoraSceneToDraftSvg } from "@/lib/artwork/dieline/pacdora";
import { parseDieline, type DielineIssue, type ParsedPanel } from "@/lib/artwork/dieline/parse";
import { artworkConfig } from "@/lib/artwork/config";
import type { DielineScene } from "@/lib/dieline-types";

// Turns a studio Pacdora scene into a canonical (draft) dieline for the
// per-panel pipeline. Pure: no storage, no network.

export interface PreparedScene {
  sku: string;
  svg: string;
  draft: boolean;
  panels: ParsedPanel[];
  errors: DielineIssue[];
  warnings: DielineIssue[];
  boardWidthMm: number;
  boardHeightMm: number;
}

export function skuForModel(modelId: string) {
  return `PD-${modelId}`;
}

export function preparePacdoraScene(
  scene: DielineScene,
  options: { sku?: string; name?: string; bleedMm?: number; safeMm?: number } = {},
): PreparedScene {
  const config = artworkConfig();
  const sku = options.sku ?? skuForModel(scene.modelId);
  const svg = pacdoraSceneToDraftSvg(scene, {
    sku,
    name: options.name,
    bleedMm: options.bleedMm ?? config.print.bleedMm,
    safeMm: options.safeMm ?? config.print.safeMm,
  });
  const parsed = parseDieline(svg, {
    defaultBleedMm: config.print.bleedMm,
    defaultSafeMm: config.print.safeMm,
  });
  return {
    sku,
    svg,
    draft: true,
    panels: parsed.panels,
    errors: parsed.errors,
    warnings: parsed.warnings,
    boardWidthMm: parsed.boardWidthMm,
    boardHeightMm: parsed.boardHeightMm,
  };
}
