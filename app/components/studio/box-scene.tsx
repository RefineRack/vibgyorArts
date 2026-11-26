"use client";

import { useEffect, useRef } from "react";
import {
  Box3,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { createDielineModel } from "@/lib/dieline-mesh";
import type { DielineScene } from "@/lib/dieline-types";

type BoxSceneProps = {
  scene: DielineScene;
  fold: number;
  zoom: number;
  artwork: string | null;
  onZoom: (value: number) => void;
};

function farthestFromOrigin(box: Box3) {
  const corner = new Vector3();
  let radius = 1;
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        radius = Math.max(radius, corner.set(x, y, z).length());
      }
    }
  }
  return radius;
}

export function BoxScene({ scene, fold, zoom, artwork, onZoom }: BoxSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const foldRef = useRef(fold);
  const zoomRef = useRef(zoom);
  const onZoomRef = useRef(onZoom);
  const viewRef = useRef<{
    setFold: (value: number) => void;
    setZoom: (value: number) => void;
    setArtwork: (image: HTMLImageElement) => void;
  } | null>(null);

  useEffect(() => {
    foldRef.current = fold;
    zoomRef.current = zoom;
    onZoomRef.current = onZoom;
  }, [fold, onZoom, zoom]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const renderer = new WebGLRenderer({ antialias: true });
    renderer.setClearColor(new Color("#f4efe6"), 1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    renderer.domElement.style.touchAction = "none";
    host.replaceChildren(renderer.domElement);

    const view = new Scene();
    view.add(new HemisphereLight(0xfffaf3, 0xd9d0c2, 1.15));
    const sun = new DirectionalLight(0xffffff, 1.2);
    sun.position.set(2.2, 3.4, 4);
    view.add(sun);
    const fill = new DirectionalLight(0xe4dccd, 0.45);
    fill.position.set(-3, 1.2, -2);
    view.add(fill);

    const camera = new PerspectiveCamera(32, 1, 0.1, 5000);
    const turn = new Group();
    view.add(turn);

    const model = createDielineModel(scene);
    turn.add(model.object);
    model.setFold(1);
    model.object.updateMatrixWorld(true);
    const center = new Box3().setFromObject(model.object).getCenter(new Vector3());
    model.object.position.sub(center);

    const measure = () => {
      model.object.updateMatrixWorld(true);
      return farthestFromOrigin(new Box3().setFromObject(model.object));
    };
    const closedRadius = measure();
    model.setFold(0);
    const openRadius = measure();
    model.setFold(foldRef.current);
    turn.rotation.set(0.22, -0.6, 0);
    const fov = (32 * Math.PI) / 180;
    const distanceFor = (radius: number) => (radius / Math.tan(fov / 2)) * 1.22;
    const closedFit = distanceFor(closedRadius);
    const openFit = distanceFor(openRadius);

    const applyView = (zoomValue: number, foldValue: number) => {
      const base = openFit + (closedFit - openFit) * foldValue;
      const distance = base * Math.pow(0.86, zoomValue);
      camera.position.set(0, distance * 0.12, distance);
      camera.lookAt(0, 0, 0);
      camera.near = Math.max(0.05, distance / 200);
      camera.far = distance * 24;
      camera.updateProjectionMatrix();
    };

    const resize = () => {
      const width = host.clientWidth;
      const height = host.clientHeight;
      if (width === 0 || height === 0) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    applyView(zoomRef.current, foldRef.current);
    viewRef.current = {
      setFold: (value) => {
        model.setFold(value);
        applyView(zoomRef.current, value);
      },
      setZoom: (value) => applyView(value, foldRef.current),
      setArtwork: (image) => model.setArtwork(image),
    };

    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const canvas = renderer.domElement;

    const onPointerDown = (event: PointerEvent) => {
      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return;
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
      turn.rotation.y += dx * 0.008;
      turn.rotation.x = Math.max(-1.1, Math.min(1.1, turn.rotation.x + dy * 0.008));
    };
    const onPointerUp = () => {
      dragging = false;
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      onZoomRef.current(zoomRef.current + (event.deltaY > 0 ? -1 : 1));
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    let frame = 0;
    const draw = () => {
      frame = window.requestAnimationFrame(draw);
      renderer.render(view, camera);
    };
    draw();

    return () => {
      window.cancelAnimationFrame(frame);
      viewRef.current = null;
      observer.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
      model.dispose();
      renderer.dispose();
      canvas.remove();
    };
  }, [scene]);

  useEffect(() => {
    viewRef.current?.setFold(fold);
  }, [fold, scene]);

  useEffect(() => {
    viewRef.current?.setZoom(zoom);
  }, [zoom, scene]);

  useEffect(() => {
    if (!artwork) return;
    const image = new Image();
    image.onload = () => viewRef.current?.setArtwork(image);
    image.src = artwork;
  }, [artwork, scene]);

  return <div ref={hostRef} className="va-webgl" />;
}
