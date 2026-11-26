import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isDielineScene, type DielineScene } from "@/lib/dieline-types";
import { PacdoraRequestError, pacdoraGet } from "@/lib/pacdora-server";

export type SceneInput = {
  modelId: string;
  length: number;
  width: number;
  height: number;
  thickness: number;
};

const SIZE_TYPE = "die-cut";
const BLEED = "3";
const CACHE_PATH = path.join(process.cwd(), ".cache", "dieline-scenes.json");

type CacheEntry = {
  requestId: string;
  scene: DielineScene | null;
};

type SceneCache = {
  version: 1;
  entries: Record<string, CacheEntry>;
};

let memory: SceneCache | null = null;

export function sceneKey(input: SceneInput) {
  const dimension = (value: number) => String(Math.round(value * 100) / 100);
  const thickness = (value: number) => String(Math.round(value * 10000) / 10000);
  return [
    input.modelId,
    dimension(input.length),
    dimension(input.width),
    dimension(input.height),
    thickness(input.thickness),
    SIZE_TYPE,
    BLEED,
  ].join("|");
}

function loadCache() {
  if (memory) return memory;
  try {
    const parsed = JSON.parse(readFileSync(CACHE_PATH, "utf8")) as SceneCache;
    if (parsed.version === 1 && parsed.entries) {
      memory = parsed;
      return memory;
    }
  } catch {
    // A missing cache only means the next scene request is new.
  }
  memory = { version: 1, entries: {} };
  return memory;
}

function saveCache() {
  const cache = loadCache();
  mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  writeFileSync(CACHE_PATH, JSON.stringify(cache));
}

function rememberRequest(key: string) {
  const cache = loadCache();
  const existing = cache.entries[key];
  if (existing?.scene && isDielineScene(existing.scene)) return existing;
  const entry = existing?.requestId
    ? existing
    : { requestId: randomUUID(), scene: null };
  cache.entries[key] = entry;
  saveCache();
  return entry;
}

async function creditsReady() {
  const usage = await pacdoraGet("/open/v2/die-line/usage", {});
  const data = usage.data as {
    availableCredits?: number | null;
    billing?: { available?: boolean };
  };
  if (data?.billing?.available !== true) {
    throw new PacdoraRequestError({
      status: 402,
      message: "Pacdora billing is not ready",
      traceId: usage.traceId ?? null,
      errorCode: "DIELINE_V2_CREDIT_ACCOUNT_NOT_READY",
      retryAction: "none",
    });
  }
  if (typeof data.availableCredits === "number" && data.availableCredits <= 0) {
    throw new PacdoraRequestError({
      status: 402,
      message: "No Pacdora credits left",
      traceId: usage.traceId ?? null,
      errorCode: "DIELINE_V2_INSUFFICIENT_CREDITS",
      retryAction: "none",
    });
  }
}

export async function getBlankScene(input: SceneInput) {
  const key = sceneKey(input);
  const cached = loadCache().entries[key];
  if (cached?.scene && isDielineScene(cached.scene)) return cached.scene;

  const entry = rememberRequest(key);
  await creditsReady();
  try {
    const result = await pacdoraGet(
      "/open/v2/die-line/scene",
      {
        modelId: input.modelId,
        length: String(input.length),
        width: String(input.width),
        height: String(input.height),
        thickness: String(input.thickness),
        sizeType: SIZE_TYPE,
        bleed: BLEED,
      },
      entry.requestId,
    );
    if (!isDielineScene(result.data)) {
      throw new PacdoraRequestError({
        status: 502,
        message: "Pacdora rejected the request",
        traceId: result.traceId ?? null,
        errorCode: null,
        retryAction: "same_request",
      });
    }
    entry.scene = result.data;
    saveCache();
    return result.data;
  } catch (error) {
    if (error instanceof PacdoraRequestError && error.retryAction === "none") {
      delete loadCache().entries[key];
      saveCache();
    }
    throw error;
  }
}
