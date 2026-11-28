"use client";

import { dielinePreview } from "@/lib/dieline-preview";
import type { DielineScene } from "@/lib/dieline-types";

export function DielineThumbnail({ scene, title }: { scene: DielineScene; title: string }) {
  const preview = dielinePreview(scene);
  if (!preview) return <div className="va-thumb" aria-hidden />;
  return (
    <div className="va-thumb">
      <svg
        className="va-dieline"
        viewBox={preview.viewBox}
        role="img"
        aria-label={`Dieline preview of ${title}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {preview.paths.map((path, index) => (
          <path key={`${path.kind}-${index}`} className={path.kind === "cut" ? "va-cut" : "va-crease"} d={path.d} />
        ))}
      </svg>
    </div>
  );
}
