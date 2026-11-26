import type { DielinePanel } from "@/lib/dieline-art";

export const maxDuration = 60;

const IMAGE_LIMIT = 2_000_000;

function imageData(value: unknown) {
  if (typeof value !== "string" || !/^data:image\/(?:png|jpeg|webp);base64,/.test(value)) {
    return null;
  }
  if (value.length > IMAGE_LIMIT) return null;
  return value;
}

function panels(value: unknown): DielinePanel[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 80) return null;
  const list: DielinePanel[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const panel = item as { name?: unknown; width?: unknown; height?: unknown };
    if (typeof panel.name !== "string" || panel.name.length === 0 || panel.name.length > 40) return null;
    if (typeof panel.width !== "number" || typeof panel.height !== "number") return null;
    if (panel.width <= 0 || panel.height <= 0 || panel.width > 5000 || panel.height > 5000) return null;
    list.push({ name: panel.name, width: panel.width, height: panel.height });
  }
  return list;
}

function promptFor(svg: string, panelList: DielinePanel[]) {
  const sizes = panelList.map((panel) => `${panel.name} ${panel.width} x ${panel.height} mm`).join("\n");
  const vector = svg.length > 0 && svg.length <= 20000 ? svg : "The first image is the dieline.";
  return [
    "The first image is a flat packaging dieline. Tan panels are the printable faces. White gaps are not paper.",
    "The second image is the product that goes inside the box.",
    "Paint packaging artwork onto the tan panels only. Keep every panel in the same position, size, and outline.",
    "Keep the white gaps blank. Do not draw a 3D box, a shadow, a table, or a background.",
    "Make the product recognizable on the largest panels.",
    "The same dieline, as SVG paths in millimetres with y pointing down:",
    vector,
    "Panel sizes:",
    sizes,
  ].join("\n");
}

const MODEL = "gemini-3-pro-image";

function splitDataUrl(value: string) {
  const match = value.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return null;
  return { mime: match[1], data: match[2] };
}

function imageBlock(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const block = value as { type?: unknown; data?: unknown; mime_type?: unknown };
  if (block.type !== "image" || typeof block.data !== "string" || block.data.length === 0) return null;
  const mime = typeof block.mime_type === "string" ? block.mime_type : "image/jpeg";
  return { data: block.data, mime };
}

function generatedImage(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const steps = (payload as { steps?: unknown }).steps;
  if (!Array.isArray(steps)) return null;
  let found: { data: string; mime: string } | null = null;
  for (const step of steps) {
    if (!step || typeof step !== "object") continue;
    const record = step as { content?: unknown; summary?: unknown };
    const blocks = [
      ...(Array.isArray(record.content) ? record.content : []),
      ...(Array.isArray(record.summary) ? record.summary : []),
    ];
    for (const block of blocks) {
      const image = imageBlock(block);
      if (image) found = image;
    }
  }
  return found;
}

export async function POST(request: Request) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return Response.json(
      { error: "Add GEMINI_API_KEY to .env.local and restart the dev server." },
      { status: 500 },
    );
  }

  let body: { guide?: unknown; product?: unknown; svg?: unknown; panels?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "The wrap was not created." }, { status: 400 });
  }

  const guide = imageData(body.guide);
  const product = imageData(body.product);
  const panelList = panels(body.panels);
  const svg = typeof body.svg === "string" ? body.svg : "";
  const guideImage = guide ? splitDataUrl(guide) : null;
  const productImage = product ? splitDataUrl(product) : null;
  if (!guideImage || !productImage || !panelList) {
    return Response.json({ error: "The wrap was not created." }, { status: 400 });
  }

  let response: Response;
  try {
    response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: {
        "x-goog-api-key": key,
        "Content-Type": "application/json",
        "Api-Revision": "2026-05-20",
      },
      body: JSON.stringify({
        model: MODEL,
        input: [
          { type: "text", text: promptFor(svg, panelList) },
          { type: "image", mime_type: guideImage.mime, data: guideImage.data },
          { type: "image", mime_type: productImage.mime, data: productImage.data },
        ],
        response_format: {
          type: "image",
          mime_type: "image/jpeg",
          image_size: "1K",
        },
      }),
      signal: AbortSignal.timeout(55000),
    });
  } catch {
    return Response.json({ error: "The wrap was not created." }, { status: 502 });
  }

  const payload = await response.json().catch(() => null);
  const image = generatedImage(payload);
  if (response.ok && image) {
    return Response.json({ image: `data:${image.mime};base64,${image.data}` });
  }

  const geminiMessage =
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    payload.error &&
    typeof payload.error === "object" &&
    "message" in payload.error &&
    typeof payload.error.message === "string"
      ? payload.error.message.slice(0, 240)
      : "";
  console.error("[artwork]", { status: response.status, model: MODEL, message: geminiMessage });
  const message =
    response.status === 401 || response.status === 403
      ? "The Gemini API key was rejected."
      : geminiMessage || "The wrap was not created.";
  return Response.json({ error: message }, { status: response.ok ? 502 : response.status });
}
