"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { AppShell } from "@/app/components/shell/app-shell";
import { findSavedBox, useSavedBoxes } from "@/app/components/boxes/use-saved-boxes";
import { preparePacdoraScene, type PreparedScene } from "@/lib/artwork/prepare-scene";
import { formatSize } from "@/lib/box-dimensions";
import { dielinePanels, dielineSvg, drawDielineGuide, shrinkProductPhoto } from "@/lib/dieline-art";
import { isDielineScene, type DielineScene } from "@/lib/dieline-types";
import { type BoxModel } from "@/lib/pacdora-models";
import { createSavedBox } from "@/lib/saved-boxes";
import type { SavedBox } from "@/lib/saved-boxes";
import { BoxScene } from "./box-scene";
import { Slider } from "./slider";

const ZOOM_LIMIT = 12;

type Opened = {
  name: string;
  length: number;
  width: number;
  height: number;
  scene: DielineScene;
  artwork: string | null;
};

function modelFromParams(params: URLSearchParams): BoxModel | null {
  const modelId = params.get("modelId") ?? "";
  if (!/^[0-9]{6}$/.test(modelId)) return null;
  const number = (name: string) => {
    const value = Number(params.get(name));
    return Number.isFinite(value) ? value : 0;
  };
  return {
    modelId,
    name: params.get("name")?.trim() || modelId,
    image: params.get("image") ?? "",
    length: number("length"),
    width: number("width"),
    height: number("height"),
    thickness: number("thickness") || 0.4,
  };
}

function openedFromSaved(box: SavedBox): Opened {
  return {
    name: box.name,
    length: box.length,
    width: box.width,
    height: box.height,
    scene: box.scene,
    artwork: box.artwork || null,
  };
}

function PipelineNote({ prepared }: { prepared: PreparedScene | null }) {
  if (!prepared) return null;
  const printed = prepared.panels.filter((panel) => !panel.unprinted);
  const failed = prepared.errors.length > 0;
  return (
    <aside className="va-pipeline" aria-live="polite">
      {failed ? (
        <p>The Pacdora scene could not be turned into a panel dieline yet. The 3D studio still works; artwork stays on the full sheet until a cleaned SVG is registered.</p>
      ) : prepared.draft ? (
        <p>
          No cleaned panel SVG is registered for this box, so a draft dieline was made from the Pacdora scene ({printed.length}{" "}
          printed panel{printed.length === 1 ? "" : "s"}). Check the panel roles, bleed and safe zone before production artwork
          is generated.
        </p>
      ) : (
        <p>This box has a structured panel dieline ready for per-panel artwork.</p>
      )}
    </aside>
  );
}

function StageView({
  opened,
  onOpenedChange,
  talking,
  notice,
}: {
  opened: Opened;
  onOpenedChange: (next: Opened) => void;
  talking: boolean;
  notice?: string;
}) {
  const [fold, setFold] = useState(1);
  const [zoom, setZoom] = useState(0);
  const [artStatus, setArtStatus] = useState<"idle" | "working" | "error">("idle");
  const [artError, setArtError] = useState("");
  const prepared = useMemo(() => {
    try {
      return preparePacdoraScene(opened.scene, { name: opened.name });
    } catch {
      return null;
    }
  }, [opened.scene, opened.name]);
  const size = formatSize(opened);

  function changeZoom(next: number) {
    setZoom(Math.max(-ZOOM_LIMIT, Math.min(ZOOM_LIMIT, next)));
  }

  function changeFold(next: number) {
    setFold(Math.min(1, Math.max(0, next)));
  }

  async function onProductPhoto(file: File | undefined) {
    if (!file || artStatus === "working") return;
    setArtStatus("working");
    setArtError("");
    try {
      const product = await shrinkProductPhoto(file);
      const guide = drawDielineGuide(opened.scene);
      if (!guide) throw new Error("This box has no panels to print.");
      const response = await fetch("/api/artwork", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guide,
          product,
          svg: dielineSvg(opened.scene),
          panels: dielinePanels(opened.scene),
        }),
        signal: AbortSignal.timeout(60000),
      });
      const body = (await response.json()) as { image?: string; error?: string };
      if (!response.ok || !body.image) throw new Error(body.error || "The wrap was not created.");
      onOpenedChange({ ...opened, artwork: body.image });
      setArtStatus("idle");
    } catch (error) {
      setArtError(error instanceof Error && error.name !== "TimeoutError" ? error.message : "The wrap was not created.");
      setArtStatus("error");
    }
  }

  return (
    <AppShell title={opened.name} backHref="/boxes" talking={talking || artStatus === "working"} lockPortrait>
      <section className="va-stage">
        <div className="va-zoom-bar">
          <div className="va-zoom">
            <button type="button" aria-label="Zoom out" onClick={() => changeZoom(zoom - 1)} disabled={zoom <= -ZOOM_LIMIT}>
              −
            </button>
            <Slider label="Zoom" min={-ZOOM_LIMIT} max={ZOOM_LIMIT} step={1} value={zoom} origin={0} onChange={changeZoom} />
            <button type="button" aria-label="Zoom in" onClick={() => changeZoom(zoom + 1)} disabled={zoom >= ZOOM_LIMIT}>
              +
            </button>
          </div>
        </div>
        <div className="va-view">
          <BoxScene
            key={opened.scene.modelId}
            scene={opened.scene}
            fold={fold}
            zoom={zoom}
            artwork={opened.artwork}
            onZoom={changeZoom}
          />
        </div>
        <div className="va-dock">
          {notice ? <p className="va-form-error">{notice}</p> : null}
          <PipelineNote prepared={prepared} />
          <label className="va-art">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={artStatus === "working"}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                void onProductPhoto(file);
              }}
            />
            <span>{artStatus === "working" ? "Designing the wrap…" : "Change the reference"}</span>
          </label>
          {artError ? <p className="va-form-error">{artError}</p> : null}
          <p className="va-hint">Drag to turn the box</p>
          {size ? <p className="va-size">{size}</p> : null}
          <div className="va-fold">
            <span>Open</span>
            <Slider label="Open or close the box" min={0} max={1} step={0.01} value={fold} onChange={changeFold} />
            <span>Closed</span>
          </div>
        </div>
      </section>
    </AppShell>
  );
}

function ReferenceStudio({ box }: { box: BoxModel }) {
  const [draftName, setDraftName] = useState(box.name);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [opened, setOpened] = useState<Opened | null>(null);
  const [artWorking, setArtWorking] = useState(false);
  const savingRef = useRef(false);

  async function openWithReference(file: File | undefined) {
    if (!file || savingRef.current) return;
    const name = draftName.trim() || box.name;
    savingRef.current = true;
    setSaving(true);
    setSaveError("");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 60000);
    let openedStage = false;
    try {
      const product = await shrinkProductPhoto(file);
      const query = new URLSearchParams({
        modelId: box.modelId,
        length: String(box.length),
        width: String(box.width),
        height: String(box.height),
        thickness: String(box.thickness),
      });
      const sceneResponse = await fetch(`/api/pacdora/scene?${query}`, { signal: controller.signal });
      const sceneBody = (await sceneResponse.json()) as { error?: string };
      if (!sceneResponse.ok) throw new Error(sceneBody.error || "This box did not open.");
      if (!isDielineScene(sceneBody)) throw new Error("This box did not open.");

      setOpened({
        name,
        length: box.length,
        width: box.width,
        height: box.height,
        scene: sceneBody,
        artwork: null,
      });
      openedStage = true;
      setArtWorking(true);

      const guide = drawDielineGuide(sceneBody);
      if (!guide) throw new Error("This box has no panels to print.");
      const artResponse = await fetch("/api/artwork", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guide,
          product,
          svg: dielineSvg(sceneBody),
          panels: dielinePanels(sceneBody),
        }),
        signal: controller.signal,
      });
      const artBody = (await artResponse.json()) as { image?: string; error?: string };
      if (!artResponse.ok || !artBody.image) throw new Error(artBody.error || "The wrap was not created.");
      if (sceneBody.modelId !== box.modelId) throw new Error("This box did not open.");
      setOpened((current) => (current ? { ...current, artwork: artBody.image ?? null } : current));
      setArtWorking(false);
      await createSavedBox({
        name,
        modelId: box.modelId,
        image: box.image,
        length: box.length,
        width: box.width,
        height: box.height,
        thickness: box.thickness,
        scene: sceneBody,
        artwork: artBody.image,
      });
    } catch (error) {
      const message = error instanceof Error && error.name !== "AbortError" ? error.message : "This box did not open.";
      if (openedStage) {
        setArtWorking(false);
        setSaveError(message);
      } else {
        setSaveError(message);
      }
    } finally {
      window.clearTimeout(timeout);
      savingRef.current = false;
      setSaving(false);
    }
  }

  if (opened) {
    return <StageView opened={opened} onOpenedChange={setOpened} talking={saving || artWorking} notice={saveError} />;
  }

  return (
    <AppShell title="Reference" backHref="/boxes" talking={saving} lockPortrait>
      <section className="va-name">
        <div className="va-reference">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {box.image ? <img src={box.image} alt="" /> : null}
          <p className="va-lead">Name this box, then add a reference image. The print is wrapped on this box and saved with it.</p>
          <label htmlFor="box-name">Box name</label>
          <input
            id="box-name"
            value={draftName}
            maxLength={80}
            autoComplete="off"
            disabled={saving}
            onChange={(event) => setDraftName(event.target.value)}
          />
          <label className="va-art">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={saving}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                void openWithReference(file);
              }}
            />
            <span>{saving ? "Opening…" : "Add a reference image"}</span>
          </label>
          {saveError ? <p className="va-form-error">{saveError}</p> : null}
        </div>
      </section>
    </AppShell>
  );
}

function SavedStudio({ savedId }: { savedId: string }) {
  const saved = useSavedBoxes();
  const box = findSavedBox(saved.boxes, savedId);
  const [opened, setOpened] = useState<Opened | null>(null);
  const current = opened && box && opened.scene === box.scene ? opened : box ? openedFromSaved(box) : null;

  if (saved.status === "loading") {
    return (
      <AppShell title="Box" backHref="/boxes" lockPortrait>
        <div className="va-scene-status">
          <p>Opening this box…</p>
        </div>
      </AppShell>
    );
  }

  if (!current) {
    return (
      <AppShell title="Box" backHref="/boxes" lockPortrait>
        <div className="va-scene-error">
          <p>{saved.status === "error" ? saved.error : "This box did not open."}</p>
          <Link href="/boxes">Back to boxes</Link>
        </div>
      </AppShell>
    );
  }

  return <StageView key={savedId} opened={current} onOpenedChange={setOpened} talking={false} />;
}

export function Studio() {
  const params = useSearchParams();
  const savedId = params.get("saved");
  const paramModel = modelFromParams(params);

  if (savedId) return <SavedStudio savedId={savedId} />;
  if (paramModel) return <ReferenceStudio key={paramModel.modelId} box={paramModel} />;

  return (
    <AppShell title="Studio" backHref="/boxes" lockPortrait>
      <section className="va-name">
        <div className="va-empty">
          <p>Choose a box to open it in the studio.</p>
          <Link href="/boxes">Your boxes</Link>
        </div>
      </section>
    </AppShell>
  );
}
