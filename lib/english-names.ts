import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const CACHE_PATH = path.join(process.cwd(), ".cache", "english-names.json");
const PAGE_SIZE = 60;
const CATALOG = "https://api.pacdora.com/open/v1/models";

type CacheFile = {
  version: 1;
  names: Record<string, string>;
};

type CatalogItem = {
  modelId?: unknown;
  showName?: unknown;
};

let memory: Map<string, string> | null = null;
let loading: Promise<Map<string, string>> | null = null;

function readCache() {
  try {
    const parsed = JSON.parse(readFileSync(CACHE_PATH, "utf8")) as CacheFile;
    if (parsed.version === 1 && parsed.names && Object.keys(parsed.names).length > 0) {
      return new Map(Object.entries(parsed.names));
    }
  } catch {
    // A missing cache means the English catalog still needs to be read.
  }
  return null;
}

function writeCache(names: Map<string, string>) {
  const file: CacheFile = { version: 1, names: Object.fromEntries(names) };
  mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  writeFileSync(CACHE_PATH, JSON.stringify(file));
}

function remember(names: Map<string, string>, items: CatalogItem[]) {
  for (const item of items) {
    const modelId =
      typeof item.modelId === "number"
        ? String(item.modelId).padStart(6, "0")
        : typeof item.modelId === "string"
          ? item.modelId
          : "";
    const showName = typeof item.showName === "string" ? item.showName.trim() : "";
    if (/^[0-9]{6}$/.test(modelId) && showName) names.set(modelId, showName);
  }
}

async function fetchPage(page: number) {
  const url = new URL(CATALOG);
  url.searchParams.set("mockupNameKey", "box-mockups");
  url.searchParams.set("current", String(page));
  url.searchParams.set("pageSize", String(PAGE_SIZE));
  const response = await fetch(url, {
    headers: { appId: "app_id123", appKey: "app_key123" },
    cache: "no-store",
  });
  const body = (await response.json()) as { code?: number; data?: CatalogItem[]; total?: number };
  if (!response.ok || body.code !== 200 || !Array.isArray(body.data)) {
    throw new Error("English catalog did not load");
  }
  return { items: body.data, total: typeof body.total === "number" ? body.total : body.data.length };
}

async function loadCatalog() {
  const names = new Map<string, string>();
  const first = await fetchPage(1);
  remember(names, first.items);
  const pages = Math.ceil(first.total / PAGE_SIZE);
  const queue = Array.from({ length: Math.max(0, pages - 1) }, (_, index) => index + 2);
  async function worker() {
    while (queue.length > 0) {
      const page = queue.shift();
      if (!page) return;
      const result = await fetchPage(page);
      remember(names, result.items);
    }
  }
  await Promise.all(Array.from({ length: 6 }, () => worker()));
  writeCache(names);
  return names;
}

export function englishNames() {
  if (memory) return Promise.resolve(memory);
  const cached = readCache();
  if (cached) {
    memory = cached;
    return Promise.resolve(cached);
  }
  loading ??= loadCatalog()
    .then((names) => {
      memory = names;
      return names;
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}
