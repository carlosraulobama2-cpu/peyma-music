"use client";

import { useCallback } from "react";
import { usePlayerStore } from "../../../store/usePlayerStore";
import { useCatalogSection } from "../../../lib/useCatalogSection";
import { fetchTrending, type TrendingTrack } from "../../../lib/catalog";
import { TrackList } from "../../../components/TrackList";

/**
 * Top 100 canciones — ranking global real, ordenado por reproducciones de
 * los últimos 7 días (mismo criterio que "Top Charts" en la app, ver
 * backend/src/services/trending.ts). Entrada desde la tarjeta de "Explorar
 * todo".
 */
export default function TopCancionesPage() {
  const play = usePlayerStore((s) => s.play);

  const { items: tracks, loading } = useCatalogSection<TrendingTrack>(
    useCallback(() => fetchTrending(100), []),
  );

  return (
    <main className="flex-1 px-6 py-8 pb-32 sm:px-10">
      <header className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Ranking global</p>
        <h1 className="mt-1 text-4xl font-extrabold tracking-tight sm:text-5xl">Top 100 canciones</h1>
        <p className="mt-2 text-sm text-muted">
          Lo más escuchado en toda la plataforma esta semana — se recalcula con reproducciones reales, no con votos.
        </p>
      </header>

      {loading ? (
        <div className="flex flex-col gap-2">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded bg-white/5" />
          ))}
        </div>
      ) : tracks.length === 0 ? (
        <p className="text-sm text-muted">
          Todavía no hay suficientes reproducciones para armar un ranking. Volvé pronto.
        </p>
      ) : (
        <>
          <button
            onClick={() => play(tracks[0]!, tracks)}
            className="mb-6 rounded-full bg-brand px-6 py-3 text-sm font-bold text-black transition-colors hover:bg-brand-hover"
          >
            ▶ Reproducir todo
          </button>
          <TrackList tracks={tracks} />
        </>
      )}
    </main>
  );
}
