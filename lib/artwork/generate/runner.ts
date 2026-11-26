import { randomUUID } from "node:crypto";
import type { ArtworkConfig } from "@/lib/artwork/config";
import { BriefValidationError, validateBrief } from "@/lib/artwork/brief";
import type { ArtworkRepository } from "@/lib/artwork/records/repository";
import type { ObjectStorage } from "@/lib/artwork/storage/object-storage";
import type { Asset, Generation, Job, Panel } from "@/lib/artwork/types";
import { composePanelPrompt, type PromptOverrides } from "@/lib/artwork/prompt/compose-prompt";
import { mapWithConcurrency } from "@/lib/artwork/generate/concurrency";
import { ImageGenerationError, type ImageGenerator } from "@/lib/artwork/generate/image-generator";
import { readImageInfo } from "@/lib/artwork/generate/image-info";
import { coverCropFraction, effectiveDpi, panelImageSpec } from "@/lib/artwork/generate/sizing";

// Phase 2 job runner: one raster per printed panel, with retries and a
// concurrency cap. Each panel is idempotent: a panel that already has a
// succeeded (not rejected) generation is skipped, so a rerun only regenerates
// failed or rejected panels. Compose, QA and export are later phases.

export interface RunGenerationInput {
  jobId: string;
  repo: ArtworkRepository;
  storage: ObjectStorage;
  generator: ImageGenerator;
  config: ArtworkConfig;
  /** Unprinted panels to generate anyway (brief override). */
  includeUnprinted?: string[];
  /** Restrict the run to these panel names. */
  onlyPanels?: string[];
  prompt?: PromptOverrides;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
}

export type PanelRunStatus = "succeeded" | "failed" | "skipped_unprinted" | "skipped_existing";

export interface PanelRunResult {
  panelName: string;
  status: PanelRunStatus;
  generations: Generation[];
  asset?: Asset;
}

export interface RunGenerationResult {
  job: Job;
  panels: PanelRunResult[];
}

const EXTENSIONS: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

export async function runPanelGeneration(input: RunGenerationInput): Promise<RunGenerationResult> {
  const { repo, storage, generator, config } = input;
  const now = input.now ?? (() => new Date());
  const sleep = input.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  // 1. Load dieline + panel records
  const job = await repo.getJob(input.jobId);
  if (!job) throw new Error(`Job ${input.jobId} was not found.`);
  if (["approved", "exported"].includes(job.status)) throw new Error(`Job ${job.id} is ${job.status}; it cannot be regenerated.`);
  const box = await repo.getBox(job.boxId);
  if (!box) throw new Error(`Box ${job.boxId} was not found.`);
  const panels = await repo.listPanels(box.id);

  // 2. Validate brief
  const issues = await validateBrief(job.brief, panels, repo);
  if (issues.length > 0) throw new BriefValidationError(issues);

  await repo.saveJob({ ...job, status: "generating", updatedAt: now().toISOString() });
  const history = await repo.listGenerations(job.id);
  const include = new Set(input.includeUnprinted ?? []);
  const only = input.onlyPanels ? new Set(input.onlyPanels) : null;

  const generatePanel = async (panel: Panel, lastAttempt: number): Promise<PanelRunResult> => {
    // a–b. trim/bleed/safe and target pixels at 300 DPI including bleed
    const spec = panelImageSpec(panel, config.generation.dpi);
    // c. prompt from the template
    const { prompt, templateVersion } = composePanelPrompt(box, job, panel, input.prompt, panels);
    const generations: Generation[] = [];

    for (let tries = 1; tries <= config.generation.maxAttempts; tries += 1) {
      const generation: Generation = {
        id: randomUUID(),
        jobId: job.id,
        panelId: panel.id,
        attempt: lastAttempt + tries,
        model: generator.model,
        prompt,
        aspectRatio: spec.aspectRatio,
        widthPx: spec.widthPx,
        heightPx: spec.heightPx,
        status: "queued",
        createdAt: now().toISOString(),
      };
      await repo.saveGeneration(generation);
      generations.push(generation);
      let retryable = true;
      try {
        // d. call the model at that aspect ratio / size
        const image = await generator.generate({
          prompt,
          aspectRatio: spec.requestedAspectRatio,
          imageSize: spec.imageSize,
          widthPx: spec.widthPx,
          heightPx: spec.heightPx,
        });
        const info = readImageInfo(image.data);
        if (!info) throw new ImageGenerationError("The generated image could not be read.", true);
        // e. store raster Asset + Generation
        const ext = EXTENSIONS[info.mimeType] ?? "bin";
        const path = `jobs/${job.id}/panels/${panel.name}/attempt-${generation.attempt}.${ext}`;
        await storage.put(path, image.data, { contentType: info.mimeType });
        const dpi = effectiveDpi(info.widthPx, info.heightPx, spec.bleedWidthMm, spec.bleedHeightMm);
        const asset: Asset = {
          id: randomUUID(),
          jobId: job.id,
          kind: "panel_raster",
          mimeType: info.mimeType,
          path,
          widthPx: info.widthPx,
          heightPx: info.heightPx,
          dpi: Math.floor(dpi * 10) / 10,
          colourSpace: "rgb",
          isVector: false,
          metadata: {
            generationId: generation.id,
            panelId: panel.id,
            panelName: panel.name,
            model: image.model,
            promptTemplateVersion: templateVersion,
            targetWidthPx: spec.widthPx,
            targetHeightPx: spec.heightPx,
            requestedAspectRatio: spec.requestedAspectRatio,
            requestedImageSize: spec.imageSize,
            // Read by the phase 4 QA gates (DPI blocker, >2% crop warning).
            meetsTargetDpi: dpi >= config.generation.dpi - 0.5,
            coverCropFraction: coverCropFraction(info.widthPx / info.heightPx, spec.bleedWidthMm / spec.bleedHeightMm),
            upscaleRequired: spec.upscaleRequired,
            response: image.metadata,
          },
        };
        await repo.saveAsset(asset);
        const done: Generation = { ...generation, model: image.model, status: "succeeded", outputAssetId: asset.id };
        await repo.saveGeneration(done);
        generations[generations.length - 1] = done;
        return { panelName: panel.name, status: "succeeded", generations, asset };
      } catch (error) {
        retryable = error instanceof ImageGenerationError ? error.retryable : true;
        const failed: Generation = { ...generation, status: "failed", error: (error as Error).message.slice(0, 500) };
        await repo.saveGeneration(failed);
        generations[generations.length - 1] = failed;
      }
      if (!retryable) break;
      if (tries < config.generation.maxAttempts) await sleep(config.generation.retryDelayMs * tries);
    }
    return { panelName: panel.name, status: "failed", generations };
  };

  // 3. For each printed panel, with a concurrency cap
  const targets = panels.filter((panel) => !only || only.has(panel.name));
  const results = await mapWithConcurrency(targets, config.generation.concurrency, async (panel): Promise<PanelRunResult> => {
    if (panel.unprinted && !include.has(panel.name)) return { panelName: panel.name, status: "skipped_unprinted", generations: [] };
    const previous = history.filter((item) => item.panelId === panel.id);
    if (previous.some((item) => item.status === "succeeded")) {
      return { panelName: panel.name, status: "skipped_existing", generations: [] };
    }
    return generatePanel(panel, previous.reduce((max, item) => Math.max(max, item.attempt), 0));
  });

  // TODO(Phase 3/4): compose and QA move the job on to qa_failed or pending_review.
  // Until then the job stays in "generating" once its rasters exist.
  const latest = (await repo.getJob(job.id)) ?? job;
  return { job: latest, panels: results };
}

/** Marks a panel's current raster as rejected so the next run regenerates it (brief section 7, human review). */
export async function rejectPanelGeneration(repo: ArtworkRepository, jobId: string, panelId: string) {
  const generations = await repo.listGenerations(jobId);
  for (const generation of generations.filter((item) => item.panelId === panelId && item.status === "succeeded")) {
    await repo.saveGeneration({ ...generation, status: "rejected" });
  }
}
