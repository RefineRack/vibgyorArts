// Pipeline configuration. Every default below comes from the brief; where the
// brief leaves a question open (section 9) the default carries a TODO(Q#).

export type StorageDriver = "firebase" | "local" | "memory";

export interface ArtworkConfig {
  storage: {
    driver: StorageDriver;
    /** Folder for the local driver. */
    localRoot: string;
    /** Firebase Storage bucket for the firebase driver. */
    bucket: string | null;
    /** Key prefix inside the bucket so pipeline files sit apart from anything else. */
    prefix: string;
  };
  gemini: {
    apiKey: string | null;
    // TODO(Q2): confirm the image model id with Ashwin. This is the id the
    // existing /api/artwork route already uses.
    model: string;
    endpoint: string;
    apiRevision: string;
    timeoutMs: number;
  };
  generation: {
    dpi: number;
    // TODO(Q9): max attempts, concurrency and cost ceiling per job are unconfirmed.
    maxAttempts: number;
    concurrency: number;
    retryDelayMs: number;
  };
  print: {
    bleedMm: number;
    safeMm: number;
    // TODO(Q7): confirm spot names and CMYK profile with the Heidelberg plant.
    cutLayerName: string;
    creaseLayerName: string;
    cmykProfile: string;
  };
}

export const DEFAULT_MODEL = "gemini-3-pro-image";

function positiveNumber(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function storageDriver(value: string | undefined, bucket: string | null): StorageDriver {
  if (value === "firebase" || value === "local" || value === "memory") return value;
  // TODO(Q1): Firebase Storage is assumed as the asset store because the site
  // already uses Firebase. Falls back to a local folder when no bucket is set.
  return bucket ? "firebase" : "local";
}

export function artworkConfig(env: Record<string, string | undefined> = process.env): ArtworkConfig {
  const bucket =
    env.ARTWORK_STORAGE_BUCKET?.trim() || env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim() || null;
  return {
    storage: {
      driver: storageDriver(env.ARTWORK_STORAGE?.trim(), bucket),
      localRoot: env.ARTWORK_LOCAL_ROOT?.trim() || ".artwork-data",
      bucket,
      prefix: env.ARTWORK_STORAGE_PREFIX?.trim() || "artwork",
    },
    gemini: {
      apiKey: env.GEMINI_API_KEY?.trim() || null,
      model: env.ARTWORK_GEMINI_MODEL?.trim() || DEFAULT_MODEL,
      endpoint: "https://generativelanguage.googleapis.com/v1beta/interactions",
      apiRevision: "2026-05-20",
      timeoutMs: positiveNumber(env.ARTWORK_GEMINI_TIMEOUT_MS, 120_000),
    },
    generation: {
      dpi: 300,
      maxAttempts: positiveNumber(env.ARTWORK_MAX_ATTEMPTS, 3),
      concurrency: positiveNumber(env.ARTWORK_CONCURRENCY, 2),
      retryDelayMs: positiveNumber(env.ARTWORK_RETRY_DELAY_MS, 2_000),
    },
    print: {
      bleedMm: 3,
      safeMm: 3,
      cutLayerName: "CutContour",
      creaseLayerName: "Crease",
      cmykProfile: "FOGRA39",
    },
  };
}
