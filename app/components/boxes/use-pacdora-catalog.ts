"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { BoxModel, BoxPage } from "@/lib/pacdora-models";

async function fetchBoxes(page: number) {
  const response = await fetch(`/api/pacdora/models?page=${page}`);
  if (!response.ok) throw new Error("Could not load boxes");
  return (await response.json()) as BoxPage;
}

export function usePacdoraCatalog(sentinelRef: RefObject<HTMLDivElement | null>) {
  const [boxes, setBoxes] = useState<BoxModel[]>([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const loadingPage = useRef(false);

  const loadPage = useCallback(async (nextPage: number) => {
    if (loadingPage.current) return;
    loadingPage.current = true;
    setStatus((current) => (nextPage === 1 ? "loading" : current));
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
      setStatus("ready");
    } catch {
      setStatus("error");
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
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || status === "error") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadPage(page + 1);
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadPage, page, sentinelRef, status]);

  return { boxes, page, total, hasMore, status, loadPage };
}
