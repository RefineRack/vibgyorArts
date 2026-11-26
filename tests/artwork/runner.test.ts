import { describe, expect, it } from "vitest";
import {
  BriefValidationError,
  FakeImageGenerator,
  ImageGenerationError,
  readImageInfo,
  rejectPanelGeneration,
  runPanelGeneration,
  type ImageGenerator,
  type ImageRequest,
} from "@/lib/artwork";
import { setup } from "./helpers";

describe("runPanelGeneration", () => {
  it("gives every printed panel a raster at 300 DPI and a stored prompt, skipping the glue flap", async () => {
    const env = await setup();
    const generator = new FakeImageGenerator();
    const result = await runPanelGeneration({ jobId: env.job.id, generator, ...env });

    expect(result.panels.map((panel) => [panel.panelName, panel.status])).toEqual([
      ["glue", "skipped_unprinted"],
      ["front", "succeeded"],
      ["left", "succeeded"],
    ]);
    expect(result.job.status).toBe("generating");
    expect(generator.requests.map((request) => [request.widthPx, request.heightPx])).toEqual([
      [898, 1489],
      [426, 1489],
    ]);

    const front = result.panels[1];
    const generation = front.generations[0];
    expect(generation).toMatchObject({ attempt: 1, status: "succeeded", aspectRatio: "38:63", widthPx: 898, heightPx: 1489, model: "fake-solid-colour" });
    expect(generation.prompt).toContain("- Role: front (front)");
    expect(front.asset).toMatchObject({ kind: "panel_raster", colourSpace: "rgb", isVector: false, widthPx: 898, heightPx: 1489 });
    expect(front.asset!.dpi).toBeGreaterThanOrEqual(300);
    expect(front.asset!.metadata).toMatchObject({ meetsTargetDpi: true, panelName: "front", requestedAspectRatio: "9:16" });

    const bytes = await env.storage.get(front.asset!.path);
    expect(readImageInfo(bytes!)).toEqual({ mimeType: "image/png", widthPx: 898, heightPx: 1489 });
    expect(await env.repo.getAsset(front.asset!.id)).toEqual(front.asset);
    expect((await env.repo.listGenerations(env.job.id)).filter((item) => item.status === "succeeded")).toHaveLength(2);
  });

  it("is idempotent and regenerates only rejected panels", async () => {
    const env = await setup();
    const generator = new FakeImageGenerator();
    await runPanelGeneration({ jobId: env.job.id, generator, ...env });
    const rerun = await runPanelGeneration({ jobId: env.job.id, generator, ...env });
    expect(rerun.panels.map((panel) => panel.status)).toEqual(["skipped_unprinted", "skipped_existing", "skipped_existing"]);
    expect(generator.requests).toHaveLength(2);

    const front = env.panels.find((panel) => panel.name === "front")!;
    await rejectPanelGeneration(env.repo, env.job.id, front.id);
    const regen = await runPanelGeneration({ jobId: env.job.id, generator, ...env });
    expect(regen.panels[1]).toMatchObject({ status: "succeeded" });
    expect(regen.panels[1].generations[0].attempt).toBe(2);
    expect(regen.panels[2].status).toBe("skipped_existing");
  });

  it("retries retryable failures and records each attempt", async () => {
    const env = await setup();
    const generator = new FakeImageGenerator({ failures: [new ImageGenerationError("busy", true), new ImageGenerationError("busy", true)] });
    const result = await runPanelGeneration({ jobId: env.job.id, generator, ...env, config: { ...env.config, generation: { ...env.config.generation, concurrency: 1 } } });
    const front = result.panels[1];
    expect(front.status).toBe("succeeded");
    expect(front.generations.map((item) => [item.attempt, item.status])).toEqual([
      [1, "failed"],
      [2, "failed"],
      [3, "succeeded"],
    ]);
    expect(front.generations[0].error).toBe("busy");
  });

  it("stops at the attempt cap and on final errors", async () => {
    const env = await setup();
    const failing: ImageGenerator = {
      model: "always-fails",
      generate: async () => {
        throw new ImageGenerationError("bad request", false, 400);
      },
    };
    const result = await runPanelGeneration({ jobId: env.job.id, generator: failing, ...env });
    expect(result.panels[1]).toMatchObject({ status: "failed" });
    expect(result.panels[1].generations).toHaveLength(1);

    const flaky = new FakeImageGenerator({ failures: Array.from({ length: 10 }, () => new Error("network")) });
    const capped = await runPanelGeneration({ jobId: env.job.id, generator: flaky, ...env, onlyPanels: ["left"] });
    expect(capped.panels[0].generations).toHaveLength(env.config.generation.maxAttempts);
  });

  it("respects the concurrency cap", async () => {
    const env = await setup();
    let inFlight = 0;
    let peak = 0;
    const inner = new FakeImageGenerator();
    const slow: ImageGenerator = {
      model: inner.model,
      generate: async (request: ImageRequest) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        return inner.generate(request);
      },
    };
    await runPanelGeneration({ jobId: env.job.id, generator: slow, ...env, config: { ...env.config, generation: { ...env.config.generation, concurrency: 1 } } });
    expect(peak).toBe(1);
  });

  it("generates an unprinted panel only when the brief overrides it", async () => {
    const env = await setup();
    const result = await runPanelGeneration({ jobId: env.job.id, generator: new FakeImageGenerator(), ...env, includeUnprinted: ["glue"] });
    expect(result.panels[0]).toMatchObject({ panelName: "glue", status: "succeeded" });
  });

  it("validates the brief before calling the model", async () => {
    const env = await setup();
    await env.repo.saveJob({
      ...env.job,
      brief: { ...env.job.brief, palette: [{ name: "Bad", hex: "green" }], logoAssetIds: ["missing"] },
    });
    const generator = new FakeImageGenerator();
    const error = await runPanelGeneration({ jobId: env.job.id, generator, ...env }).catch((caught) => caught);
    expect(error).toBeInstanceOf(BriefValidationError);
    expect(error.issues.map((issue: { field: string }) => issue.field)).toEqual(["palette[0].hex", "logoAssetIds[0]"]);
    expect(generator.requests).toHaveLength(0);
  });
});
