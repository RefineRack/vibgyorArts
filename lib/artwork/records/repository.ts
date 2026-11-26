import type { Asset, Box, Generation, Job, Panel } from "@/lib/artwork/types";
import { getJson, putJson, type ObjectStorage } from "@/lib/artwork/storage/object-storage";

// Persistence port for the section 4 records. The brief allows "Postgres,
// SQLite or equivalent"; v1 stores each record as a JSON document in object
// storage so the pipeline needs nothing beyond Firebase Storage.
// TODO(Q1): move to Firestore or a SQL store if Ashwin prefers a database.

export interface ArtworkRepository {
  getBox(id: string): Promise<Box | null>;
  findBoxBySku(sku: string): Promise<Box | null>;
  saveBox(box: Box): Promise<void>;
  listPanels(boxId: string): Promise<Panel[]>;
  /** Replaces the full panel set of a box. */
  savePanels(boxId: string, panels: Panel[]): Promise<void>;
  getJob(id: string): Promise<Job | null>;
  saveJob(job: Job): Promise<void>;
  listGenerations(jobId: string): Promise<Generation[]>;
  saveGeneration(generation: Generation): Promise<void>;
  getAsset(id: string): Promise<Asset | null>;
  saveAsset(asset: Asset): Promise<void>;
}

function skuKey(sku: string) {
  return encodeURIComponent(sku.trim().toLowerCase());
}

export class StorageArtworkRepository implements ArtworkRepository {
  constructor(private readonly storage: ObjectStorage, private readonly root = "records") {}

  private key(...parts: string[]) {
    return [this.root, ...parts].join("/");
  }

  getBox(id: string) {
    return getJson<Box>(this.storage, this.key("boxes", `${id}.json`));
  }

  async findBoxBySku(sku: string) {
    const index = await getJson<{ boxId: string }>(this.storage, this.key("box-sku", `${skuKey(sku)}.json`));
    return index ? this.getBox(index.boxId) : null;
  }

  async saveBox(box: Box) {
    await putJson(this.storage, this.key("boxes", `${box.id}.json`), box);
    await putJson(this.storage, this.key("box-sku", `${skuKey(box.sku)}.json`), { boxId: box.id });
  }

  async listPanels(boxId: string) {
    return (await getJson<Panel[]>(this.storage, this.key("panels", `${boxId}.json`))) ?? [];
  }

  async savePanels(boxId: string, panels: Panel[]) {
    await putJson(this.storage, this.key("panels", `${boxId}.json`), panels);
  }

  getJob(id: string) {
    return getJson<Job>(this.storage, this.key("jobs", `${id}.json`));
  }

  async saveJob(job: Job) {
    await putJson(this.storage, this.key("jobs", `${job.id}.json`), job);
  }

  async listGenerations(jobId: string) {
    const keys = await this.storage.list(this.key("generations", jobId) + "/");
    const records = await Promise.all(keys.map((key) => getJson<Generation>(this.storage, key)));
    return records
      .filter((record): record is Generation => record !== null)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.attempt - b.attempt);
  }

  async saveGeneration(generation: Generation) {
    await putJson(this.storage, this.key("generations", generation.jobId, `${generation.id}.json`), generation);
  }

  getAsset(id: string) {
    return getJson<Asset>(this.storage, this.key("assets", `${id}.json`));
  }

  async saveAsset(asset: Asset) {
    await putJson(this.storage, this.key("assets", `${asset.id}.json`), asset);
  }
}
