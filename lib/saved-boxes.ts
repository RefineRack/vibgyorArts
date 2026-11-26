import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  addDoc,
  collection,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  type Firestore,
} from "firebase/firestore";
import { isDielineScene, type DielineScene } from "@/lib/dieline-types";

export type SavedBox = {
  id: string;
  name: string;
  modelId: string;
  image: string;
  length: number;
  width: number;
  height: number;
  thickness: number;
  scene: DielineScene;
};

export type SavedBoxDraft = Omit<SavedBox, "id">;

const COLLECTION = "savedBoxes";

function firebaseApp(): FirebaseApp | null {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
  if (!apiKey || !authDomain || !projectId || !appId) return null;

  return (
    getApps()[0] ??
    initializeApp({
      apiKey,
      authDomain,
      projectId,
      appId,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    })
  );
}

function database(): Firestore | null {
  const app = firebaseApp();
  return app ? getFirestore(app) : null;
}

// Firestore cannot store an array inside an array. Fold stages are a list of
// frames, so each stage is saved as a map and restored before the viewer runs.
export function sceneForStore(scene: DielineScene) {
  return {
    schemaVersion: scene.schemaVersion,
    modelId: scene.modelId,
    unit: scene.unit,
    thickness: scene.thickness,
    faces: scene.faces,
    hinges: scene.hinges,
    stages: scene.stages.map((frames) => ({ frames })),
    orientation: scene.orientation,
    support: scene.support,
  };
}

export function sceneFromStore(value: unknown): DielineScene | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as { stages?: unknown };
  if (!Array.isArray(raw.stages)) return null;
  const stages = raw.stages.map((stage) => {
    if (Array.isArray(stage)) return stage;
    if (stage && typeof stage === "object" && "frames" in stage && Array.isArray(stage.frames)) {
      return stage.frames;
    }
    return null;
  });
  if (stages.some((stage) => stage === null)) return null;
  const scene = { ...raw, stages };
  return isDielineScene(scene) ? scene : null;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function savedBox(id: string, data: Record<string, unknown>): SavedBox | null {
  const scene = sceneFromStore(data.scene);
  const length = asNumber(data.length);
  const width = asNumber(data.width);
  const height = asNumber(data.height);
  const thickness = asNumber(data.thickness);
  if (
    !scene ||
    typeof data.name !== "string" ||
    typeof data.modelId !== "string" ||
    typeof data.image !== "string" ||
    length === null ||
    width === null ||
    height === null ||
    thickness === null
  ) {
    return null;
  }
  return {
    id,
    name: data.name,
    modelId: data.modelId,
    image: data.image,
    length,
    width,
    height,
    thickness,
    scene,
  };
}

function createdMillis(value: unknown) {
  if (value instanceof Timestamp) return value.toMillis();
  return Number.MAX_SAFE_INTEGER;
}

const FIREBASE_WAIT_MS = 8000;

const FIRESTORE_SETUP = "Firestore refused this. Enable billing for the Firebase project and deploy the public rules, then try again.";

export function firebaseMessage(error: unknown) {
  const text = error instanceof Error ? error.message : "";
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (
    text.toLowerCase().includes("billing") ||
    code.includes("permission-denied") ||
    text.toLowerCase().includes("permission") ||
    text.includes("did not answer")
  ) {
    return FIRESTORE_SETUP;
  }
  if (error instanceof Error && error.message && error.name !== "AbortError") return error.message;
  return "This box was not saved.";
}

function boxesFromSnapshot(snapshot: { docs: { id: string; data: () => Record<string, unknown> }[] }) {
  return snapshot.docs
    .map((item) => ({
      box: savedBox(item.id, item.data()),
      created: createdMillis(item.data().createdAt),
    }))
    .filter((item): item is { box: SavedBox; created: number } => item.box !== null)
    .sort((a, b) => b.created - a.created)
    .map((item) => item.box);
}

export function loadSavedBoxes() {
  const db = database();
  if (!db) return Promise.reject(new Error("Firebase is not configured"));

  return new Promise<SavedBox[]>((resolve, reject) => {
    let unsubscribe = () => {};
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error(FIRESTORE_SETUP));
    }, FIREBASE_WAIT_MS);
    unsubscribe = onSnapshot(
      collection(db, COLLECTION),
      (snapshot) => {
        clearTimeout(timer);
        unsubscribe();
        resolve(boxesFromSnapshot(snapshot));
      },
      (error) => {
        clearTimeout(timer);
        unsubscribe();
        reject(error);
      },
    );
  });
}

export async function createSavedBox(draft: SavedBoxDraft) {
  const db = database();
  if (!db) throw new Error("Firebase is not configured");
  const write = addDoc(collection(db, COLLECTION), {
    name: draft.name,
    modelId: draft.modelId,
    image: draft.image,
    length: draft.length,
    width: draft.width,
    height: draft.height,
    thickness: draft.thickness,
    scene: sceneForStore(draft.scene),
    createdAt: serverTimestamp(),
  });
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(
      () => reject(new Error(FIRESTORE_SETUP)),
      FIREBASE_WAIT_MS,
    );
  });
  const ref = await Promise.race([write, timeout]);
  return ref.id;
}
