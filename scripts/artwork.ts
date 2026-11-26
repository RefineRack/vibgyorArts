// Artwork pipeline admin script (phases 1–2).
//
//   npm run artwork -- register <dieline.svg> [--sku SKU] [--name NAME] [--style STYLE] [--sidecar panels.json]
//   npm run artwork -- inspect <SKU>
//   npm run artwork -- logo <logo.svg> [--name NAME]
//   npm run artwork -- generate <SKU> <brief.json> [--logo ASSET_ID ...] [--gemini]
//
// Storage follows ARTWORK_STORAGE (firebase | local | memory); scripts default to
// the local folder .artwork-data/ unless a Firebase bucket is configured.
// `generate` uses the fake solid-colour generator unless --gemini is given.

import { readFileSync } from "node:fs";
import {
  DielineValidationError,
  FakeImageGenerator,
  GeminiImageGenerator,
  StorageArtworkRepository,
  artworkConfig,
  boardBleedRect,
  createJob,
  createObjectStorage,
  registerDieline,
  registerLogoSvg,
  runPanelGeneration,
  type DielineSidecar,
  type JobBrief,
} from "@/lib/artwork";

function flags(args: string[]) {
  const positional: string[] = [];
  const named: Record<string, string[]> = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) positional.push(arg);
    else if (args[index + 1] && !args[index + 1].startsWith("--")) (named[arg.slice(2)] ??= []).push(args[++index]);
    else (named[arg.slice(2)] ??= []).push("true");
  }
  return { positional, named, one: (name: string) => named[name]?.[0] };
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const { positional, named, one } = flags(rest);
  const config = artworkConfig();
  const storage = createObjectStorage(config);
  const repo = new StorageArtworkRepository(storage);

  if (command === "register") {
    if (!positional[0]) throw new Error("Usage: register <dieline.svg>");
    const sidecar = one("sidecar") ? (JSON.parse(readFileSync(one("sidecar")!, "utf8")) as DielineSidecar) : undefined;
    const result = await registerDieline({
      svg: readFileSync(positional[0], "utf8"),
      sidecar,
      overrides: { sku: one("sku"), name: one("name"), style: one("style") },
      storage,
      repo,
      config,
    });
    console.log(`${result.created ? "Registered" : "Updated"} ${result.box.sku} (${result.box.id}), board ${result.box.boardWidthMm} × ${result.box.boardHeightMm} mm`);
    console.table(
      result.panels.map((panel) => ({
        name: panel.name,
        role: panel.role,
        trim: `${panel.widthMm} × ${panel.heightMm} mm`,
        at: `${panel.xMm}, ${panel.yMm}`,
        bleed: panel.bleedMm,
        safe: panel.safeMm,
        unprinted: panel.unprinted,
        neighbours: panel.neighbours.map((item) => `${item.edge}:${item.panelName}`).join(" "),
      })),
    );
    for (const warning of result.warnings) console.warn(`Warning: ${warning.panel ? `[${warning.panel}] ` : ""}${warning.message}`);
    return;
  }

  if (command === "inspect") {
    const box = positional[0] ? await repo.findBoxBySku(positional[0]) : null;
    if (!box) throw new Error(`No box registered for SKU ${positional[0] ?? "(none)"}.`);
    const panels = await repo.listPanels(box.id);
    console.log(JSON.stringify({ box, panels: panels.map((panel) => ({ ...panel, bleedBoxOnBoard: boardBleedRect(panel) })) }, null, 2));
    return;
  }

  if (command === "logo") {
    if (!positional[0]) throw new Error("Usage: logo <logo.svg>");
    const asset = await registerLogoSvg({ svg: readFileSync(positional[0], "utf8"), name: one("name") ?? positional[0], storage, repo });
    console.log(`Logo asset ${asset.id}`);
    return;
  }

  if (command === "generate") {
    const [sku, briefFile] = positional;
    const box = sku ? await repo.findBoxBySku(sku) : null;
    if (!box || !briefFile) throw new Error("Usage: generate <SKU> <brief.json>");
    const input = JSON.parse(readFileSync(briefFile, "utf8")) as { customerName: string; brandName: string; brief: JobBrief };
    input.brief.logoAssetIds = [...(input.brief.logoAssetIds ?? []), ...(named.logo ?? [])];
    const job = await createJob(repo, { boxId: box.id, ...input });
    const generator = one("gemini") ? new GeminiImageGenerator(config.gemini) : new FakeImageGenerator();
    const result = await runPanelGeneration({ jobId: job.id, repo, storage, generator, config });
    console.log(`Job ${job.id}: ${result.job.status}`);
    console.table(
      result.panels.map((panel) => ({
        panel: panel.panelName,
        status: panel.status,
        attempts: panel.generations.length,
        raster: panel.asset?.path ?? "",
        px: panel.asset ? `${panel.asset.widthPx} × ${panel.asset.heightPx}` : "",
        dpi: panel.asset?.dpi ?? "",
      })),
    );
    return;
  }

  throw new Error("Commands: register, inspect, logo, generate. See the header of scripts/artwork.ts.");
}

main().catch((error: unknown) => {
  if (error instanceof DielineValidationError) console.error(error.message);
  else console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
