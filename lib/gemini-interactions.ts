// Shared reader for Gemini Interactions API responses. Used by the studio's
// /api/artwork route and the panel pipeline's Gemini adapter.

export type InteractionImage = { data: string; mime: string };

function imageBlock(value: unknown): InteractionImage | null {
  if (!value || typeof value !== "object") return null;
  const block = value as { type?: unknown; data?: unknown; mime_type?: unknown };
  if (block.type !== "image" || typeof block.data !== "string" || block.data.length === 0) return null;
  const mime = typeof block.mime_type === "string" ? block.mime_type : "image/jpeg";
  return { data: block.data, mime };
}

/** Last image in the response's steps (content or summary blocks), or output_image if present. */
export function interactionImage(payload: unknown): InteractionImage | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as { steps?: unknown; output_image?: unknown };
  let found: InteractionImage | null = null;
  if (Array.isArray(record.steps)) {
    for (const step of record.steps) {
      if (!step || typeof step !== "object") continue;
      const item = step as { content?: unknown; summary?: unknown };
      const blocks = [
        ...(Array.isArray(item.content) ? item.content : []),
        ...(Array.isArray(item.summary) ? item.summary : []),
      ];
      for (const block of blocks) {
        const image = imageBlock(block);
        if (image) found = image;
      }
    }
  }
  if (!found && record.output_image && typeof record.output_image === "object") {
    found = imageBlock({ type: "image", ...(record.output_image as object) });
  }
  return found;
}

export function interactionErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("error" in payload)) return "";
  const error = (payload as { error?: unknown }).error;
  if (!error || typeof error !== "object" || !("message" in error)) return "";
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message.slice(0, 240) : "";
}
