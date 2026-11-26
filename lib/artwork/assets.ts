import { randomUUID } from "node:crypto";
import { parseSync, type INode } from "svgson";
import type { ArtworkRepository } from "@/lib/artwork/records/repository";
import type { ObjectStorage } from "@/lib/artwork/storage/object-storage";
import type { Asset } from "@/lib/artwork/types";

// Vector logo intake. Logos must stay true vectors (brief section 3), so an
// SVG that embeds a raster <image> is refused.

function hasRaster(node: INode): boolean {
  return node.name === "image" || node.children.some(hasRaster);
}

export async function registerLogoSvg(input: {
  svg: string;
  name: string;
  storage: ObjectStorage;
  repo: ArtworkRepository;
  jobId?: string;
}): Promise<Asset> {
  let root: INode;
  try {
    root = parseSync(input.svg);
  } catch {
    throw new Error("The logo SVG could not be parsed.");
  }
  if (root.name !== "svg") throw new Error("The logo file is not an SVG.");
  if (hasRaster(root)) throw new Error("The logo SVG embeds a raster image; supply a true vector logo.");
  const id = randomUUID();
  const path = `logos/${id}.svg`;
  await input.storage.put(path, input.svg, { contentType: "image/svg+xml" });
  const asset: Asset = {
    id,
    jobId: input.jobId,
    kind: "logo_vector",
    mimeType: "image/svg+xml",
    path,
    colourSpace: "n/a",
    isVector: true,
    metadata: { name: input.name, viewBox: root.attributes.viewBox ?? null },
  };
  await input.repo.saveAsset(asset);
  return asset;
}
