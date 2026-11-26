// ImageGenerator port (brief section 8). The pipeline only talks to this
// interface, so the model can be swapped and tests never call a live API.

export interface ImageRequest {
  prompt: string;
  /** Supported ratio the model is asked for, e.g. "2:3". */
  aspectRatio: string;
  /** Size tier for the model, e.g. "2K". */
  imageSize: string;
  /** Target pixels on the bleed box at 300 DPI. */
  widthPx: number;
  heightPx: number;
  seed?: string;
  signal?: AbortSignal;
}

export interface GeneratedImage {
  data: Uint8Array;
  mimeType: string;
  widthPx: number;
  heightPx: number;
  model: string;
  /** Response metadata worth keeping for audit (ids, usage, finish reason). */
  metadata: Record<string, unknown>;
}

export interface ImageGenerator {
  readonly model: string;
  generate(request: ImageRequest): Promise<GeneratedImage>;
}

export class ImageGenerationError extends Error {
  constructor(message: string, readonly retryable: boolean, readonly status?: number) {
    super(message);
    this.name = "ImageGenerationError";
  }
}
