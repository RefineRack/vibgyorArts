import { describe, expect, it } from "vitest";
import { GeminiImageGenerator, ImageGenerationError, artworkConfig, solidPng } from "@/lib/artwork";
import { interactionImage } from "@/lib/gemini-interactions";

const settings = () => artworkConfig({ GEMINI_API_KEY: "test-key" }).gemini;
const request = { prompt: "panel prompt", aspectRatio: "9:16", imageSize: "2K", widthPx: 898, heightPx: 1489 };

function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  };
  return { calls, impl };
}

describe("GeminiImageGenerator", () => {
  it("asks for one panel at the chosen ratio and size, and reads the image back", async () => {
    const data = Buffer.from(solidPng(1536, 2752, "#112233")).toString("base64");
    const { calls, impl } = fakeFetch(200, { id: "int-1", steps: [{ content: [{ type: "image", mime_type: "image/png", data }] }] });
    const result = await new GeminiImageGenerator(settings(), impl).generate(request);
    expect(result).toMatchObject({ mimeType: "image/png", widthPx: 1536, heightPx: 2752, model: "gemini-3-pro-image" });
    expect(result.metadata.interactionId).toBe("int-1");
    const body = JSON.parse(String(calls[0].init.body));
    expect(calls[0].url).toBe("https://generativelanguage.googleapis.com/v1beta/interactions");
    expect(body).toEqual({
      model: "gemini-3-pro-image",
      input: [{ type: "text", text: "panel prompt" }],
      response_format: { type: "image", mime_type: "image/jpeg", aspect_ratio: "9:16", image_size: "2K" },
    });
    expect((calls[0].init.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-key");
  });

  it("marks rate limits as retryable and bad requests as final", async () => {
    const limited = new GeminiImageGenerator(settings(), fakeFetch(429, { error: { message: "slow down" } }).impl);
    await expect(limited.generate(request)).rejects.toMatchObject({ retryable: true, status: 429, message: "slow down" });
    const bad = new GeminiImageGenerator(settings(), fakeFetch(400, { error: { message: "bad ratio" } }).impl);
    const error = await bad.generate(request).catch((caught) => caught);
    expect(error).toBeInstanceOf(ImageGenerationError);
    expect(error.retryable).toBe(false);
  });

  it("needs an API key", () => {
    expect(() => new GeminiImageGenerator(artworkConfig({}).gemini)).toThrow(/GEMINI_API_KEY/);
  });
});

describe("interactionImage", () => {
  it("returns the last image block, as the studio route expects", () => {
    expect(
      interactionImage({
        steps: [{ content: [{ type: "image", data: "a" }] }, { summary: [{ type: "image", data: "b", mime_type: "image/png" }] }],
      }),
    ).toEqual({ data: "b", mime: "image/png" });
    expect(interactionImage({ steps: [{ content: [{ type: "text", text: "no" }] }] })).toBeNull();
  });
});
