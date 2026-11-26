import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

// Object storage port. Firebase Storage is the production adapter; the memory
// and local-folder adapters keep tests and scripts free of network calls.

export interface PutOptions {
  contentType?: string;
  metadata?: Record<string, string>;
}

export interface ObjectStorage {
  put(key: string, data: Uint8Array | string, options?: PutOptions): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  exists(key: string): Promise<boolean>;
  /** Keys that start with the prefix, sorted. */
  list(prefix: string): Promise<string[]>;
  delete(key: string): Promise<void>;
}

export function assertKey(key: string) {
  if (!key || key.startsWith("/") || key.includes("\\") || key.split("/").some((part) => part === ".." || part === "")) {
    throw new Error(`Invalid storage key: ${key}`);
  }
}

function toBytes(data: Uint8Array | string) {
  return typeof data === "string" ? new TextEncoder().encode(data) : data;
}

export async function getText(storage: ObjectStorage, key: string) {
  const bytes = await storage.get(key);
  return bytes ? new TextDecoder().decode(bytes) : null;
}

export async function getJson<T>(storage: ObjectStorage, key: string): Promise<T | null> {
  const text = await getText(storage, key);
  return text === null ? null : (JSON.parse(text) as T);
}

export async function putJson(storage: ObjectStorage, key: string, value: unknown) {
  await storage.put(key, JSON.stringify(value, null, 2), { contentType: "application/json" });
}

export class MemoryObjectStorage implements ObjectStorage {
  readonly objects = new Map<string, { data: Uint8Array; options: PutOptions }>();

  async put(key: string, data: Uint8Array | string, options: PutOptions = {}) {
    assertKey(key);
    this.objects.set(key, { data: new Uint8Array(toBytes(data)), options });
  }

  async get(key: string) {
    assertKey(key);
    return this.objects.get(key)?.data ?? null;
  }

  async exists(key: string) {
    assertKey(key);
    return this.objects.has(key);
  }

  async list(prefix: string) {
    return [...this.objects.keys()].filter((key) => key.startsWith(prefix)).sort();
  }

  async delete(key: string) {
    assertKey(key);
    this.objects.delete(key);
  }
}

export class LocalObjectStorage implements ObjectStorage {
  constructor(private readonly root: string) {}

  private file(key: string) {
    assertKey(key);
    return path.join(this.root, ...key.split("/"));
  }

  async put(key: string, data: Uint8Array | string) {
    const file = this.file(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, toBytes(data));
  }

  async get(key: string) {
    try {
      return new Uint8Array(await readFile(this.file(key)));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async exists(key: string) {
    try {
      return (await stat(this.file(key))).isFile();
    } catch {
      return false;
    }
  }

  async list(prefix: string) {
    const keys: string[] = [];
    const walk = async (dir: string, base: string) => {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const key = base ? `${base}/${entry.name}` : entry.name;
        if (entry.isDirectory()) await walk(path.join(dir, entry.name), key);
        else keys.push(key);
      }
    };
    await walk(this.root, "");
    return keys.filter((key) => key.startsWith(prefix)).sort();
  }

  async delete(key: string) {
    await rm(this.file(key), { force: true });
  }
}
