import { readFileSync } from "node:fs";
import path from "node:path";
import {
  MemoryObjectStorage,
  StorageArtworkRepository,
  artworkConfig,
  createJob,
  registerDieline,
  registerLogoSvg,
  type JobBrief,
} from "@/lib/artwork";

export const FIXTURES = path.resolve(__dirname, "../../fixtures/artwork");

export function fixture(name: string) {
  return readFileSync(path.join(FIXTURES, name), "utf8");
}

export const tuckEndSvg = () => fixture("tuck-end.svg");

export function testConfig() {
  const config = artworkConfig({ ARTWORK_STORAGE: "memory" });
  config.generation.retryDelayMs = 0;
  return config;
}

export function sampleBrief(): { customerName: string; brandName: string; brief: JobBrief } {
  return JSON.parse(fixture("sample-brief.json"));
}

export async function setup(options: { withLogo?: boolean } = {}) {
  const storage = new MemoryObjectStorage();
  const repo = new StorageArtworkRepository(storage);
  const config = testConfig();
  const registered = await registerDieline({ svg: tuckEndSvg(), storage, repo, config, now: () => new Date("2026-11-26T10:00:00Z") });
  const sample = sampleBrief();
  if (options.withLogo !== false) {
    const logo = await registerLogoSvg({ svg: fixture("logo.svg"), name: "Sample logo", storage, repo });
    sample.brief.logoAssetIds = [logo.id];
  }
  const job = await createJob(repo, { boxId: registered.box.id, ...sample });
  return { storage, repo, config, ...registered, job };
}

/** Swaps one attribute value in the fixture to build a mutant. */
export function mutate(svg: string, from: string, to: string) {
  if (!svg.includes(from)) throw new Error(`Fixture does not contain ${from}`);
  return svg.replace(from, to);
}
