"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { http } from "./httpClient";
import type { CatalogTrack } from "./catalog";

const PAGE_SIZE = 20;

interface Paginated {
  tracks: CatalogTrack[];
  pagination: { page: number; totalPages: number };
}

/**
 * Carga páginas de catálogo a medida que el centinela entra en pantalla.
 *
 * Devuelve un **callback ref** (`observeSentinel`) y no un objeto de ref: así el
 * componente no toca `.current` durante el render, y además el observer se
 * engancha justo cuando el nodo aparece y se limpia cuando desaparece.
 *
 * El margen de 400px hace que la página siguiente llegue antes de que el
 * usuario toque el final y vea un hueco vacío.
 */
export function useInfiniteTracks() {
  const [tracks, setTracks] = useState<CatalogTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const pageRef = useRef(0);
  // Evita que dos disparos del observer pidan la misma página a la vez.
  const inFlightRef = useRef(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const hasMoreRef = useRef(true);

  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  const loadMore = useCallback(async () => {
    if (inFlightRef.current || !hasMoreRef.current) return;
    inFlightRef.current = true;
    setLoading(true);
    try {
      const nextPage = pageRef.current + 1;
      const res = await http.get<Paginated>(`/tracks?page=${nextPage}&limit=${PAGE_SIZE}`);
      pageRef.current = nextPage;
      setTracks((prev) => {
        // El catálogo puede cambiar entre páginas; se filtran repetidos por id.
        const seen = new Set(prev.map((t) => t.id));
        return [...prev, ...res.tracks.filter((t) => !seen.has(t.id))];
      });
      setHasMore(nextPage < res.pagination.totalPages);
    } catch {
      setHasMore(false);
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }, []);

  const observeSentinel = useCallback(
    (node: HTMLDivElement | null) => {
      observerRef.current?.disconnect();
      if (!node) return;

      const observer = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting) void loadMore();
        },
        { rootMargin: "400px" },
      );
      observer.observe(node);
      observerRef.current = observer;
    },
    [loadMore],
  );

  useEffect(() => () => observerRef.current?.disconnect(), []);

  return { tracks, loading, hasMore, observeSentinel };
}
