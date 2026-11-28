import { Suspense } from "react";
import { AppShell } from "@/app/components/shell/app-shell";
import { Studio } from "@/app/components/studio/studio";

function StudioFallback() {
  return (
    <AppShell title="Box" backHref="/boxes" lockPortrait>
      <div className="va-scene-status">
        <p>Opening this box…</p>
      </div>
    </AppShell>
  );
}

export default function StudioPage() {
  return (
    <Suspense fallback={<StudioFallback />}>
      <Studio />
    </Suspense>
  );
}
