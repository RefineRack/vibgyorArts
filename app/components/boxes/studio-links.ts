import type { BoxModel } from "@/lib/pacdora-models";

export function studioSavedHref(id: string) {
  return `/studio?saved=${encodeURIComponent(id)}`;
}

export function studioModelHref(box: BoxModel) {
  const params = new URLSearchParams({
    modelId: box.modelId,
    length: String(box.length),
    width: String(box.width),
    height: String(box.height),
    thickness: String(box.thickness),
    name: box.name,
    image: box.image,
  });
  return `/studio?${params}`;
}
