import { interactionErrorMessage, interactionImage } from "@/lib/gemini-interactions";
import type { ArtworkConfig } from "@/lib/artwork/config";
import { ImageGenerationError, type GeneratedImage, type ImageGenerator, type ImageRequest } from "@/lib/artwork/generate/image-generator";
import { readImageInfo } from "@/lib/artwork/generate/image-info";

// Gemini Image adapter (server only; GEMINI_API_KEY never reaches the browser).
// Same Interactions endpoint and model id as the existing /api/artwork route.
// One request per printed panel; never the whole dieline (brief section 5).
// TODO(Q2): confirm model id, AI Studio vs Vertex, and whether exact pixel sizes
// can be requested. Today the API takes an aspect ratio and a 1K/2K/4K tier.

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export class GeminiImageGenerator implements ImageGenerator {
  readonly model: string;

  constructor(
    private readonly settings: ArtworkConfig["gemini"],
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init),
  ) {
    if (!settings.apiKey) throw new Error("GEMINI_API_KEY is not set.");
    this.model = settings.model;
  }

  async generate(request: ImageRequest): Promise<GeneratedImage> {
    const timeout = AbortSignal.timeout(this.settings.timeoutMs);
    const signal = request.signal ? AbortSignal.any([request.signal, timeout]) : timeout;
    let response: Response;
    try {
      response = await this.fetchImpl(this.settings.endpoint, {
        method: "POST",
        headers: {
          "x-goog-api-key": this.settings.apiKey ?? "",
          "Content-Type": "application/json",
          "Api-Revision": this.settings.apiRevision,
        },
        body: JSON.stringify({
          model: this.model,
          input: [{ type: "text", text: request.prompt }],
          response_format: {
            type: "image",
            mime_type: "image/jpeg",
            aspect_ratio: request.aspectRatio,
            image_size: request.imageSize,
          },
        }),
        signal,
      });
    } catch (error) {
      throw new ImageGenerationError(`Gemini could not be reached: ${(error as Error).message}`, true);
    }

    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message = interactionErrorMessage(payload) || `Gemini returned HTTP ${response.status}`;
      const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
      throw new ImageGenerationError(message, retryable, response.status);
    }
    const image = interactionImage(payload);
    if (!image) throw new ImageGenerationError("Gemini returned no image.", true, response.status);
    const data = new Uint8Array(Buffer.from(image.data, "base64"));
    const info = readImageInfo(data);
    if (!info) throw new ImageGenerationError("Gemini returned an image that could not be read.", true, response.status);
    const id = payload && typeof payload === "object" && "id" in payload ? (payload as { id?: unknown }).id : undefined;
    const usage = payload && typeof payload === "object" && "usage" in payload ? (payload as { usage?: unknown }).usage : undefined;
    return {
      data,
      mimeType: info.mimeType,
      widthPx: info.widthPx,
      heightPx: info.heightPx,
      model: this.model,
      metadata: {
        interactionId: typeof id === "string" ? id : null,
        usage: usage ?? null,
        requestedAspectRatio: request.aspectRatio,
        requestedImageSize: request.imageSize,
      },
    };
  }
}
