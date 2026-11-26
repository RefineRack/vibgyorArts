import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  FirebaseObjectStorage,
  LocalObjectStorage,
  MemoryObjectStorage,
  StorageArtworkRepository,
  artworkConfig,
  createObjectStorage,
  getText,
  type Box,
  type ObjectStorage,
} from "@/lib/artwork";

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function local() {
  const dir = mkdtempSync(path.join(tmpdir(), "artwork-"));
  dirs.push(dir);
  return new LocalObjectStorage(dir);
}

describe.each<[string, () => ObjectStorage]>([
  ["memory", () => new MemoryObjectStorage()],
  ["local", local],
])("%s object storage", (_, make) => {
  it("stores, lists and deletes objects", async () => {
    const storage = make();
    await storage.put("a/b/one.txt", "one");
    await storage.put("a/two.bin", new Uint8Array([1, 2, 3]));
    await storage.put("c/three.txt", "three");
    expect(await getText(storage, "a/b/one.txt")).toBe("one");
    expect([...((await storage.get("a/two.bin")) ?? [])]).toEqual([1, 2, 3]);
    expect(await storage.list("a/")).toEqual(["a/b/one.txt", "a/two.bin"]);
    expect(await storage.exists("c/three.txt")).toBe(true);
    await storage.delete("c/three.txt");
    expect(await storage.exists("c/three.txt")).toBe(false);
    expect(await storage.get("missing.txt")).toBeNull();
  });

  it("refuses keys that escape the store", async () => {
    const storage = make();
    await expect(storage.put("../evil", "x")).rejects.toThrow(/Invalid storage key/);
    await expect(storage.put("/abs", "x")).rejects.toThrow(/Invalid storage key/);
  });
});

describe("Firebase object storage", () => {
  it("prefixes keys and maps the bucket API", async () => {
    const files = new Map<string, Uint8Array>();
    const bucket = {
      file: (name: string) => ({
        save: async (data: Uint8Array) => void files.set(name, data),
        download: async (): Promise<[Uint8Array]> => [files.get(name) ?? new Uint8Array()],
        exists: async (): Promise<[boolean]> => [files.has(name)],
        delete: async () => void files.delete(name),
      }),
      getFiles: async ({ prefix }: { prefix: string }): Promise<[{ name: string }[]]> => [
        [...files.keys()].filter((key) => key.startsWith(prefix)).map((name) => ({ name })),
      ],
    };
    const storage = new FirebaseObjectStorage("bucket", "artwork", async () => bucket);
    await storage.put("jobs/1/a.png", "png");
    expect([...files.keys()]).toEqual(["artwork/jobs/1/a.png"]);
    expect(await getText(storage, "jobs/1/a.png")).toBe("png");
    expect(await storage.list("jobs/")).toEqual(["jobs/1/a.png"]);
    expect(await storage.get("nope")).toBeNull();
  });
});

describe("storage config", () => {
  it("uses Firebase when a bucket is configured, otherwise a local folder", () => {
    expect(artworkConfig({ NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "x.appspot.com" }).storage.driver).toBe("firebase");
    expect(artworkConfig({}).storage.driver).toBe("local");
    expect(createObjectStorage(artworkConfig({ ARTWORK_STORAGE: "memory" }))).toBeInstanceOf(MemoryObjectStorage);
  });

  it("applies the brief's defaults", () => {
    const config = artworkConfig({});
    expect(config.print).toMatchObject({ bleedMm: 3, safeMm: 3, cutLayerName: "CutContour", creaseLayerName: "Crease", cmykProfile: "FOGRA39" });
    expect(config.generation.dpi).toBe(300);
    expect(config.gemini.model).toBe("gemini-3-pro-image");
  });
});

describe("storage-backed repository", () => {
  it("round-trips boxes by id and SKU", async () => {
    const repo = new StorageArtworkRepository(new MemoryObjectStorage());
    const box = { id: "b1", sku: "SKU-1", name: "Box", metadata: {} } as Box;
    await repo.saveBox(box);
    expect(await repo.getBox("b1")).toEqual(box);
    expect(await repo.findBoxBySku("sku-1")).toEqual(box);
    expect(await repo.findBoxBySku("other")).toBeNull();
  });
});
