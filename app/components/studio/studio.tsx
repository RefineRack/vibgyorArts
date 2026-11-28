"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { dielinePanels, dielineSvg, drawDielineGuide, shrinkProductPhoto } from "@/lib/dieline-art";
import { isDielineScene, type DielineScene } from "@/lib/dieline-types";
import { formatSize, type BoxModel, type BoxPage } from "@/lib/pacdora-models";
import { createSavedBox, firebaseMessage, loadSavedBoxes, type SavedBox } from "@/lib/saved-boxes";
import { BoxScene } from "./box-scene";
import { Slider } from "./slider";
import { Summer } from "./summer";

const ZOOM_LIMIT = 12;

type View = "list" | "reference" | "stage";

type OpenBox = {
  name: string;
  length: number;
  width: number;
  height: number;
};

async function fetchBoxes(page: number) {
  const response = await fetch(`/api/pacdora/models?page=${page}`);
  if (!response.ok) throw new Error("Could not load boxes");
  return (await response.json()) as BoxPage;
}



export function Studio() {
  const [boxes, setBoxes] = useState<BoxModel[]>([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [listStatus, setListStatus] = useState<"loading" | "ready" | "error">("loading");
  const [saved, setSaved] = useState<SavedBox[]>([]);
  const [savedStatus, setSavedStatus] = useState<"loading" | "ready" | "error">("loading");
  const [savedError, setSavedError] = useState("Your boxes did not load.");
  const [savedAttempt, setSavedAttempt] = useState(0);
  const [view, setView] = useState<View>("list");
  const [naming, setNaming] = useState<BoxModel | null>(null);
  const [draftName, setDraftName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [opened, setOpened] = useState<OpenBox | null>(null);
  const [scene, setScene] = useState<DielineScene | null>(null);
  const [sceneStatus, setSceneStatus] = useState<"loading" | "ready" | "error">("loading");
  const [fold, setFold] = useState(1);
  const [zoom, setZoom] = useState(0);
  const [artwork, setArtwork] = useState<string | null>(null);
  const [artStatus, setArtStatus] = useState<"idle" | "working" | "error">("idle");
  const [artError, setArtError] = useState("");
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingPage = useRef(false);
  const savingRef = useRef(false);

  const loadPage = useCallback(async (nextPage: number) => {
    if (loadingPage.current) return;
    loadingPage.current = true;
    setListStatus((status) => (nextPage === 1 ? "loading" : status));
    try {
      const result = await fetchBoxes(nextPage);
      setBoxes((current) => {
        const base = nextPage === 1 ? [] : current;
        const seen = new Set(base.map((box) => box.modelId));
        const unique = result.models.filter((box) => {
          if (seen.has(box.modelId)) return false;
          seen.add(box.modelId);
          return true;
        });
        return [...base, ...unique];
      });
      setPage(result.page);
      setTotal(result.total);
      setHasMore(result.models.length > 0 && result.page * result.pageSize < result.total);
      setListStatus("ready");
    } catch {
      setListStatus("error");
    } finally {
      loadingPage.current = false;
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadPage(1);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [loadPage]);

  useEffect(() => {
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      void loadSavedBoxes()
        .then((boxes) => {
          if (cancelled) return;
          setSaved(boxes);
          setSavedStatus("ready");
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          setSavedError(firebaseMessage(error));
          setSavedStatus("error");
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [savedAttempt]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || view !== "list" || !hasMore || listStatus === "error") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        void loadPage(page + 1);
      }
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, listStatus, loadPage, page, view]);

  function changeZoom(next: number) {
    if (sceneStatus !== "ready") return;
    setZoom(Math.max(-ZOOM_LIMIT, Math.min(ZOOM_LIMIT, next)));
  }

  function changeFold(next: number) {
    if (sceneStatus !== "ready") return;
    setFold(Math.min(1, Math.max(0, next)));
  }

  function clearArtwork() {
    setArtwork(null);
    setArtStatus("idle");
    setArtError("");
  }

  function backToList() {
    setView("list");
    setScene(null);
    setNaming(null);
    setSaveError("");
    clearArtwork();
  }

  function chooseBox(box: BoxModel) {
    setNaming(box);
    setDraftName(box.name);
    setSaveError("");
    setSaving(false);
    setScene(null);
    setOpened(null);
    clearArtwork();
    setView("reference");
  }

  function openSaved(box: SavedBox) {
    setZoom(0);
    setFold(1);
    setArtwork(box.artwork || null);
    setArtStatus("idle");
    setArtError("");
    setScene(box.scene);
    setSceneStatus("ready");
    setOpened({
      name: box.name,
      length: box.length,
      width: box.width,
      height: box.height,
    });
    setView("stage");
  }

  async function openWithReference(file: File | undefined) {
    const selected = naming;
    if (!file || !selected || savingRef.current) return;
    const name = draftName.trim() || selected.name;
    savingRef.current = true;
    setSaving(true);
    setSaveError("");
    setArtError("");
    setScene(null);
    setArtwork(null);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 60000);
    let openedStage = false;
    try {
      const product = await shrinkProductPhoto(file);
      const params = new URLSearchParams({
        modelId: selected.modelId,
        length: String(selected.length),
        width: String(selected.width),
        height: String(selected.height),
        thickness: String(selected.thickness),
      });
      const sceneResponse = await fetch(`/api/pacdora/scene?${params}`, { signal: controller.signal });
      const sceneBody = (await sceneResponse.json()) as { error?: string };
      if (!sceneResponse.ok) throw new Error(sceneBody.error || "This box did not open.");
      if (!isDielineScene(sceneBody)) throw new Error("This box did not open.");

      setZoom(0);
      setFold(1);
      setArtwork(null);
      setScene(sceneBody);
      setSceneStatus("ready");
      setOpened({
        name,
        length: selected.length,
        width: selected.width,
        height: selected.height,
      });
      setView("stage");
      openedStage = true;
      setArtStatus("working");

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
      if (sceneBody.modelId !== selected.modelId) {
        throw new Error("This box did not open.");
      }
      setArtwork(artBody.image);
      setArtStatus("idle");
      await createSavedBox({
        name,
        modelId: selected.modelId,
        image: selected.image,
        length: selected.length,
        width: selected.width,
        height: selected.height,
        thickness: selected.thickness,
        scene: sceneBody,
        artwork: artBody.image,
      });
      setSavedAttempt((attempt) => attempt + 1);
    } catch (error) {
      const message = error instanceof Error && error.name !== "AbortError" ? error.message : "This box did not open.";
      if (openedStage) {
        setArtError(message);
        setArtStatus("error");
      } else {
        setSaveError(message);
      }
    } finally {
      window.clearTimeout(timeout);
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function onProductPhoto(file: File | undefined) {
    if (!file || !scene || artStatus === "working") return;
    setArtStatus("working");
    setArtError("");
    try {
      const product = await shrinkProductPhoto(file);
      const guide = drawDielineGuide(scene);
      if (!guide) throw new Error("This box has no panels to print.");
      const response = await fetch("/api/artwork", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guide,
          product,
          svg: dielineSvg(scene),
          panels: dielinePanels(scene),
        }),
        signal: AbortSignal.timeout(60000),
      });
      const body = (await response.json()) as { image?: string; error?: string };
      if (!response.ok || !body.image) throw new Error(body.error || "The wrap was not created.");
      setArtwork(body.image);
      setArtStatus("idle");
    } catch (error) {
      setArtError(error instanceof Error && error.name !== "TimeoutError" ? error.message : "The wrap was not created.");
      setArtStatus("error");
    }
  }

  const size =
    opened && opened.length > 0 && opened.width > 0 && opened.height > 0
      ? `${opened.length} × ${opened.width} × ${opened.height} mm`
      : null;
  const title = view === "stage" ? opened?.name ?? "Box" : view === "reference" ? "Reference" : "Boxes";

  return (
    <>
      <div className="va-rotate">Turn the phone upright. This studio is portrait.</div>
      <div className="va-device">
        <Summer talking={saving || artStatus === "working"} />
        <header className="va-top">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="va-logo" src="/logo.jpeg" alt="" width={40} height={40} />
          <div className="va-title">
            {view === "list" ? null : (
              <button className="va-back" type="button" onClick={backToList}>
                Boxes
              </button>
            )}
            <p className="va-brand">Vibgyor Arts</p>
            <h1>{title}</h1>
          </div>
        </header>

        <div className="va-body">
          <section className={view === "list" ? "va-catalog" : "va-catalog is-off"}>
            <h2 className="va-section">Your boxes</h2>
            {savedStatus === "error" ? (
              <div className="va-empty">
                <p>{savedError}</p>
                <button
                  type="button"
                  onClick={() => {
                    setSavedStatus("loading");
                    setSavedAttempt((attempt) => attempt + 1);
                  }}
                >
                  Try again
                </button>
              </div>
            ) : savedStatus === "ready" && saved.length === 0 ? (
              <p className="va-note">Named boxes show up here.</p>
            ) : (
              <div className="va-grid">
                {saved.map((box) => {
                  const boxSize = formatSize(box);
                  return (
                    <button
                      key={box.id}
                      className="va-card"
                      type="button"
                      onClick={() => openSaved(box)}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={box.image} alt="" />
                      <span>{box.name}</span>
                      {boxSize ? <small>{boxSize}</small> : null}
                    </button>
                  );
                })}
                {savedStatus === "loading"
                  ? Array.from({ length: 2 }, (_, index) => (
                      <div className="va-card va-skeleton" key={`saved-skeleton-${index}`} />
                    ))
                  : null}
              </div>
            )}

            <h2 className="va-section">Pacdora</h2>
            <p className="va-lead">
              Pick a box, add a reference image, and open it in 3D.
              {total > 0 ? ` ${total.toLocaleString()} styles.` : ""}
            </p>
            {listStatus === "error" && boxes.length === 0 ? (
              <div className="va-empty">
                <p>The box library did not load.</p>
                <button type="button" onClick={() => void loadPage(1)}>
                  Try again
                </button>
              </div>
            ) : (
              <div className="va-grid">
                {boxes.map((box) => {
                  const boxSize = formatSize(box);
                  return (
                    <button
                      key={box.modelId}
                      className="va-card"
                      type="button"
                      onClick={() => chooseBox(box)}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={box.image} alt="" />
                      <span>{box.name}</span>
                      {boxSize ? <small>{boxSize}</small> : null}
                    </button>
                  );
                })}
                {listStatus === "loading"
                  ? Array.from({ length: 6 }, (_, index) => (
                      <div className="va-card va-skeleton" key={`skeleton-${index}`} />
                    ))
                  : null}
              </div>
            )}
            {listStatus === "error" && boxes.length > 0 ? (
              <button className="va-more" type="button" onClick={() => void loadPage(page + 1)}>
                Load more boxes
              </button>
            ) : null}
            <div ref={sentinelRef} className="va-sentinel" />
          </section>

          <section className={view === "reference" ? "va-name" : "va-name is-off"}>
            {naming ? (
              <div className="va-reference">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={naming.image} alt="" />
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
            ) : null}
          </section>

          <section className={view === "stage" ? "va-stage" : "va-stage is-off"}>
            <div className="va-zoom-bar">
              <div className="va-zoom">
                <button
                  type="button"
                  aria-label="Zoom out"
                  onClick={() => changeZoom(zoom - 1)}
                  disabled={sceneStatus !== "ready" || zoom <= -ZOOM_LIMIT}
                >
                  −
                </button>
                <Slider
                  label="Zoom"
                  min={-ZOOM_LIMIT}
                  max={ZOOM_LIMIT}
                  step={1}
                  value={zoom}
                  origin={0}
                  onChange={changeZoom}
                />
                <button
                  type="button"
                  aria-label="Zoom in"
                  onClick={() => changeZoom(zoom + 1)}
                  disabled={sceneStatus !== "ready" || zoom >= ZOOM_LIMIT}
                >
                  +
                </button>
              </div>
            </div>
            <div className="va-view">
              {view === "stage" && scene ? (
                <BoxScene
                  key={scene.modelId}
                  scene={scene}
                  fold={fold}
                  zoom={zoom}
                  artwork={artwork}
                  onZoom={changeZoom}
                />
              ) : null}
              {sceneStatus === "loading" ? (
                <div className="va-scene-status">
                  <p>Opening this box…</p>
                </div>
              ) : null}
              {sceneStatus === "error" ? (
                <div className="va-scene-error">
                  <p>This box did not open.</p>
                </div>
              ) : null}
            </div>
            <div className="va-dock">
              <label className="va-art">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={sceneStatus !== "ready" || artStatus === "working"}
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
                <Slider
                  label="Open or close the box"
                  min={0}
                  max={1}
                  step={0.01}
                  value={fold}
                  onChange={changeFold}
                />
                <span>Closed</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
