"use client";

import { useCallback } from "react";
import Link from "next/link";
import { useCatalogSection } from "../../../lib/useCatalogSection";
import { fetchTopAlbums, type TopAlbum } from "../../../lib/catalog";
import { CoverImage } from "../../../components/CoverImage";

/**
 * Top 100 álbumes — reproducciones reales de los últimos 28 días. A
 * propósito NO incluye sencillos (álbumes autogenerados de una sola pista
 * al publicar sin elegir álbum): ver backend/src/services/trending.ts.
 */
export default function TopAlbumesPage() {
  const { items: albums, loading } = useCatalogSection<TopAlbum>(useCallback(() => fetchTopAlbums(100), []));

  return (
    <main className="flex-1 px-6 py-8 pb-32 sm:px-10">
      <header className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Ranking global</p>
        <h1 className="mt-1 text-4xl font-extrabold tracking-tight sm:text-5xl">Top 100 álbumes</h1>
        <p className="mt-2 text-sm text-muted">
          Los álbumes más escuchados de los últimos 28 días. Los sencillos no compiten acá.
        </p>
      </header>

      {loading ? (
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="aspect-square animate-pulse rounded-lg bg-white/5" />
          ))}
        </div>
      ) : albums.length === 0 ? (
        <p className="text-sm text-muted">
          Todavía no hay suficientes reproducciones para armar un ranking de álbumes. Volvé pronto.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
          {albums.map((album) => (
            <Link key={album.id} href={`/artists/${album.artist.id}`} className="group relative">
              <span className="absolute left-2 top-2 z-10 rounded-full bg-black/70 px-2 py-0.5 text-xs font-bold text-white backdrop-blur">
                #{album.rank}
              </span>
              <CoverImage src={album.coverUrl} alt={album.title} size={200} rounded="rounded-lg" />
              <p className="mt-2 truncate text-sm font-semibold group-hover:underline">{album.title}</p>
              <p className="truncate text-xs text-muted">{album.artist.name}</p>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
