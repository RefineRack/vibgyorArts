export type BoxModel = {
  modelId: string;
  name: string;
  image: string;
  length: number;
  width: number;
  height: number;
  thickness: number;
};

export type BoxPage = {
  models: BoxModel[];
  page: number;
  pageSize: number;
  total: number;
};

type UpstreamModel = {
  modelId?: unknown;
  name?: unknown;
  showName?: unknown;
  image?: unknown;
  length?: unknown;
  width?: unknown;
  height?: unknown;
  minimumThickness?: unknown;
};

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function pacdoraPreviewUrl(image: string) {
  const absolute = image.startsWith("//") ? `https:${image}` : image;
  if (!absolute.includes("cdn.pacdora.com/") || absolute.includes("/image-resize/")) {
    return absolute;
  }
  return absolute.replace(
    "cdn.pacdora.com/",
    "cdn.pacdora.com/image-resize/650xauto_outside/",
  );
}

export function toBoxModel(item: UpstreamModel): BoxModel | null {
  const modelId =
    typeof item.modelId === "string"
      ? item.modelId
      : typeof item.modelId === "number"
        ? String(item.modelId).padStart(6, "0")
        : "";
  // Scene generation accepts these six-digit ids. Longer catalog ids return 422.
  if (!/^[0-9]{6}$/.test(modelId)) return null;
  const named =
    typeof item.name === "string" && item.name.trim()
      ? item.name.trim()
      : typeof item.showName === "string"
        ? item.showName.trim()
        : modelId;
  const image = typeof item.image === "string" ? pacdoraPreviewUrl(item.image) : "";
  if (!image) return null;
  const minimum = asNumber(item.minimumThickness);
  return {
    modelId,
    name: named,
    image,
    length: asNumber(item.length),
    width: asNumber(item.width),
    height: asNumber(item.height),
    thickness: minimum > 0 ? minimum : 0.4,
  };
}

export { formatSize, formatMm, type BoxDimensions } from "@/lib/box-dimensions";
