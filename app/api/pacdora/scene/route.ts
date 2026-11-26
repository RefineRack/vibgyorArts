import { getBlankScene } from "@/lib/dieline-scene";
import { PacdoraRequestError } from "@/lib/pacdora-server";

function dimension(value: string | null, places: number, max: number) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || number > max) return null;
  const factor = 10 ** places;
  return Math.round(number * factor) / factor;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const modelId = params.get("modelId") ?? "";
  const length = dimension(params.get("length"), 2, 5000);
  const width = dimension(params.get("width"), 2, 5000);
  const height = dimension(params.get("height"), 2, 5000);
  const thickness = dimension(params.get("thickness"), 4, 20);
  if (!/^[0-9]{6}$/.test(modelId) || length === null || width === null || height === null || thickness === null) {
    return Response.json({ error: "This box did not open." }, { status: 400 });
  }

  try {
    const scene = await getBlankScene({ modelId, length, width, height, thickness });
    return Response.json(scene);
  } catch (error) {
    const status = error instanceof PacdoraRequestError ? error.status : 502;
    const message =
      error instanceof PacdoraRequestError && error.status === 402
        ? error.message
        : "This box did not open.";
    return Response.json({ error: message }, { status });
  }
}
