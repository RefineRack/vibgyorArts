"use client";

import Link from "next/link";
import { AppShell } from "@/app/components/shell/app-shell";
import { BoxCard } from "@/app/components/boxes/box-card";
import { studioSavedHref } from "@/app/components/boxes/studio-links";
import { useSavedBoxes } from "@/app/components/boxes/use-saved-boxes";

export function BoxesView() {
  const saved = useSavedBoxes();

  return (
    <AppShell title="Boxes">
      <section className="va-catalog">
        <h2 className="va-section">Your boxes</h2>
        {saved.status === "error" ? (
          <div className="va-empty">
            <p>{saved.error}</p>
            <button type="button" onClick={saved.retry}>
              Try again
            </button>
          </div>
        ) : saved.status === "ready" && saved.boxes.length === 0 ? (
          <p className="va-note">Named boxes show up here once you pick a style from the Pacdora catalogue.</p>
        ) : (
          <div className="va-grid">
            {saved.boxes.map((box) => (
              <BoxCard
                key={box.id}
                href={studioSavedHref(box.id)}
                name={box.name}
                length={box.length}
                width={box.width}
                height={box.height}
                scene={box.scene}
              />
            ))}
            {saved.status === "loading"
              ? Array.from({ length: 2 }, (_, index) => <div className="va-card va-skeleton" key={`saved-skeleton-${index}`} />)
              : null}
          </div>
        )}

        <div className="va-section-row">
          <h2 className="va-section">Pacdora</h2>
          <Link className="va-browse" href="/boxes/browse">
            Browse all →
          </Link>
        </div>
        <p className="va-note">Browse the Pacdora catalogue to pick a style, then open it in the studio to wrap artwork.</p>
      </section>
    </AppShell>
  );
}
