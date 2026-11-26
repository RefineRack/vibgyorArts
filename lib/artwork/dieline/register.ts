import { randomUUID } from "node:crypto";
import type { ArtworkConfig } from "@/lib/artwork/config";
import type { ArtworkRepository } from "@/lib/artwork/records/repository";
import type { ObjectStorage } from "@/lib/artwork/storage/object-storage";
import type { Asset, Box, Panel } from "@/lib/artwork/types";
import { parseDieline, type DielineIssue, type DielineSidecar } from "@/lib/artwork/dieline/parse";

// "Register this Packdora SVG": validate, store the canonical file, upsert Box + Panels.
// TODO(Q3): the number of SKUs in v1 and who cleans the supplied SVGs are unconfirmed.

export class DielineValidationError extends Error {
  constructor(readonly errors: DielineIssue[], readonly warnings: DielineIssue[]) {
    super(`The dieline is not valid:\n${errors.map((issue) => `- ${issue.panel ? `[${issue.panel}] ` : ""}${issue.message}`).join("\n")}`);
    this.name = "DielineValidationError";
  }
}

export interface RegisterDielineInput {
  svg: string;
  sidecar?: DielineSidecar;
  /** Values that win over anything encoded in the file. */
  overrides?: Partial<Pick<Box, "sku" | "name" | "style" | "finishedWidthMm" | "finishedDepthMm" | "finishedHeightMm">>;
  storage: ObjectStorage;
  repo: ArtworkRepository;
  config: ArtworkConfig;
  now?: () => Date;
}

export interface RegisterDielineResult {
  box: Box;
  panels: Panel[];
  warnings: DielineIssue[];
  created: boolean;
}

export function dielineKey(sku: string) {
  return `dielines/${encodeURIComponent(sku.trim())}.svg`;
}

export async function registerDieline(input: RegisterDielineInput): Promise<RegisterDielineResult> {
  const { config, repo, storage } = input;
  const parsed = parseDieline(input.svg, {
    defaultBleedMm: config.print.bleedMm,
    defaultSafeMm: config.print.safeMm,
    sidecar: input.sidecar,
  });
  const errors = [...parsed.errors];
  const warnings = [...parsed.warnings];
  const sku = (input.overrides?.sku ?? parsed.box.sku ?? "").trim();
  if (!sku) errors.push({ code: "sku-missing", message: "No SKU given. Add data-sku on <svg> or pass one when registering." });
  if (errors.length > 0) throw new DielineValidationError(errors, warnings);

  const finished = {
    finishedWidthMm: input.overrides?.finishedWidthMm ?? parsed.box.finishedWidthMm ?? 0,
    finishedDepthMm: input.overrides?.finishedDepthMm ?? parsed.box.finishedDepthMm ?? 0,
    finishedHeightMm: input.overrides?.finishedHeightMm ?? parsed.box.finishedHeightMm ?? 0,
  };
  if (Object.values(finished).some((value) => !(value > 0))) {
    warnings.push({ code: "finished-size-missing", message: "Finished width, depth and height are not all set." });
  }

  const now = (input.now ?? (() => new Date()))().toISOString();
  const existing = await repo.findBoxBySku(sku);
  const svgPath = dielineKey(sku);
  await storage.put(svgPath, input.svg, { contentType: "image/svg+xml" });

  const assetId = typeof existing?.metadata.dielineAssetId === "string" ? existing.metadata.dielineAssetId : randomUUID();
  const box: Box = {
    id: existing?.id ?? randomUUID(),
    sku,
    name: input.overrides?.name ?? parsed.box.name ?? existing?.name ?? sku,
    style: input.overrides?.style ?? parsed.box.style ?? existing?.style ?? "unknown",
    svgPath,
    boardWidthMm: parsed.boardWidthMm,
    boardHeightMm: parsed.boardHeightMm,
    ...finished,
    defaultBleedMm: config.print.bleedMm,
    defaultSafeMm: config.print.safeMm,
    spotLayerName: parsed.box.spotLayerName ?? config.print.cutLayerName,
    creaseLayerName: parsed.box.creaseLayerName ?? config.print.creaseLayerName,
    metadata: { ...(existing?.metadata ?? {}), dielineAssetId: assetId, draft: parsed.box.draft },
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  const previous = new Map((existing ? await repo.listPanels(existing.id) : []).map((panel) => [panel.name, panel.id]));
  const panels: Panel[] = parsed.panels.map((panel) => ({ ...panel, id: previous.get(panel.name) ?? randomUUID(), boxId: box.id }));

  const asset: Asset = {
    id: assetId,
    kind: "dieline_svg",
    mimeType: "image/svg+xml",
    path: svgPath,
    colourSpace: "n/a",
    isVector: true,
    metadata: { boxId: box.id, sku },
  };
  await repo.saveAsset(asset);
  await repo.saveBox(box);
  await repo.savePanels(box.id, panels);
  return { box, panels, warnings, created: !existing };
}
