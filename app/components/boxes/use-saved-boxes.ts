"use client";

import { useEffect, useState } from "react";
import { DEMO_SAVED_BOXES, demoBoxesEnabled } from "@/lib/demo-boxes";
import { firebaseMessage, loadSavedBoxes, type SavedBox } from "@/lib/saved-boxes";

export type SavedBoxesState = {
  boxes: SavedBox[];
  status: "loading" | "ready" | "error";
  error: string;
  retry: () => void;
};

export function useSavedBoxes(): SavedBoxesState {
  const [boxes, setBoxes] = useState<SavedBox[]>(demoBoxesEnabled() ? DEMO_SAVED_BOXES : []);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(demoBoxesEnabled() ? "ready" : "loading");
  const [error, setError] = useState("Your boxes did not load.");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (demoBoxesEnabled()) return;
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      void loadSavedBoxes()
        .then((list) => {
          if (cancelled) return;
          setBoxes(list);
          setStatus("ready");
        })
        .catch((caught: unknown) => {
          if (cancelled) return;
          setError(firebaseMessage(caught));
          setStatus("error");
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [attempt]);

  return {
    boxes,
    status,
    error,
    retry: () => {
      setStatus("loading");
      setAttempt((value) => value + 1);
    },
  };
}

export function findSavedBox(boxes: SavedBox[], id: string) {
  return boxes.find((box) => box.id === id) ?? null;
}
