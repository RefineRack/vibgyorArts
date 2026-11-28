"use client";

import { useRef } from "react";
import { AppShell } from "@/app/components/shell/app-shell";
import { BoxCard } from "@/app/components/boxes/box-card";
import { studioModelHref } from "@/app/components/boxes/studio-links";
import { usePacdoraCatalog } from "@/app/components/boxes/use-pacdora-catalog";

export function BrowseView() {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const { boxes, page, total, hasMore, status, loadPage } = usePacdoraCatalog(sentinelRef);
  const lead =
    total > 0
      ? `${total.toLocaleString()} styles. Pick a box, add a reference image, and open it in 3D.`
      : "Pick a box, add a reference image, and open it in 3D.";

  return (
    <AppShell title="Pacdora" backHref="/boxes">
      <section className="va-catalog">
        <p className="va-lead">{lead}</p>
        {status === "error" && boxes.length === 0 ? (
          <div className="va-empty">
            <p>The box library did not load.</p>
            <button type="button" onClick={() => void loadPage(1)}>
              Try again
            </button>
          </div>
        ) : (
          <div className="va-grid">
            {boxes.map((box) => (
              <BoxCard
                key={box.modelId}
                href={studioModelHref(box)}
                name={box.name}
                length={box.length}
                width={box.width}
                height={box.height}
                image={box.image}
              />
            ))}
            {status === "loading"
              ? Array.from({ length: 6 }, (_, index) => <div className="va-card va-skeleton" key={`skeleton-${index}`} />)
              : null}
          </div>
        )}
        {status === "error" && boxes.length > 0 ? (
          <button className="va-more" type="button" onClick={() => void loadPage(page + 1)}>
            Load more boxes
          </button>
        ) : null}
        {hasMore ? <div ref={sentinelRef} className="va-sentinel" /> : null}
      </section>
    </AppShell>
  );
}
