import type { GeneratedImage, ImageGenerator, ImageRequest } from "@/lib/artwork/generate/image-generator";
import { solidPng } from "@/lib/artwork/generate/image-info";

// Test double: returns solid-colour PNGs of the exact requested pixel size.

export class FakeImageGenerator implements ImageGenerator {
  readonly model = "fake-solid-colour";
  readonly requests: ImageRequest[] = [];

  constructor(
    private readonly options: {
      colour?: string;
      /** Throw this error for the first N calls (to exercise retries). */
      failures?: Error[];
      /** Return a different size from the one requested. */
      size?: (request: ImageRequest) => { widthPx: number; heightPx: number };
    } = {},
  ) {}

  async generate(request: ImageRequest): Promise<GeneratedImage> {
    this.requests.push(request);
    const failure = this.options.failures?.shift();
    if (failure) throw failure;
    const { widthPx, heightPx } = this.options.size?.(request) ?? request;
    return {
      data: solidPng(widthPx, heightPx, this.options.colour ?? "#1F4D3A"),
      mimeType: "image/png",
      widthPx,
      heightPx,
      model: this.model,
      metadata: { fake: true },
    };
  }
}
