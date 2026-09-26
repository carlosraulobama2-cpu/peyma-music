"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { http } from "../lib/httpClient";

/**
 * Cuadrícula de categorías de la pestaña Buscar.
 *
 * Cada tarjeta lleva el color real que el curador eligió en el panel y,
 * cuando el ritmo tiene catálogo, la portada de una de sus canciones
 * asomando en la esquina — como en Spotify.
 *
 * El servidor sólo envía categorías CON contenido, así que aquí todas
 * navegan. Antes se mostraban también las vacías, atenuadas: sobre el fondo
 * oscuro se veían casi negras y parecían un error de carga.
 */

interface GenreCard {
  id: string;
  name: string;
  label: string;
  slug: string;
  color: string;
  coverUrl: string | null;
  trackCount: number;
  /** Con qué parámetro filtrar: son tres vocabularios distintos. */
  filter: "primaryGenre" | "genre" | "mood";
}

export function ExploreCategories() {
  const router = useRouter();
  const [genres, setGenres] = useState<GenreCard[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    http
      .get<{ genres: GenreCard[] }>("/genres")
      .then((res) => {
        if (!cancelled) setGenres(res.genres);
      })
      // Sin categorías la pestaña sigue sirviendo para buscar: no se
      // muestra un error por esto.
      .catch(() => {
        if (!cancelled) setGenres([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="mt-10">
      <h2 className="mb-4 text-xl font-bold sm:text-2xl">Explorar todo</h2>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {/* Rankings globales, fijos — no dependen de si hay géneros con catálogo. */}
        <Link
          href="/top-canciones"
          title="Ver Top 100 canciones"
          className="relative flex aspect-[16/9] flex-col justify-between overflow-hidden rounded-lg bg-gradient-to-br from-amber-500 to-orange-700 p-3 text-left transition-transform hover:scale-[1.03]"
        >
          <span className="relative z-10 block text-base font-extrabold leading-tight text-white drop-shadow">
            Top 100 canciones
          </span>
          <span className="relative z-10 block text-[11px] font-semibold text-white/70">Ranking global</span>
        </Link>
        <Link
          href="/top-albumes"
          title="Ver Top 100 álbumes"
          className="relative flex aspect-[16/9] flex-col justify-between overflow-hidden rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-700 p-3 text-left transition-transform hover:scale-[1.03]"
        >
          <span className="relative z-10 block text-base font-extrabold leading-tight text-white drop-shadow">
            Top 100 álbumes
          </span>
          <span className="relative z-10 block text-[11px] font-semibold text-white/70">Ranking global</span>
        </Link>

        {genres === null
          ? [...Array(8)].map((_, i) => (
              <div key={i} className="aspect-[16/9] animate-pulse rounded-lg bg-surface-raised" />
            ))
          : genres.map((genre) => (
                <button
                  key={genre.id}
                  onClick={() =>
                    router.push(`/search?${genre.filter}=${encodeURIComponent(genre.slug)}`)
                  }
                  title={`Ver ${genre.label}`}
                  className="relative aspect-[16/9] overflow-hidden rounded-lg p-3 text-left transition-transform hover:scale-[1.03]"
                  style={{ backgroundColor: genre.color }}
                >
                  <span className="relative z-10 block text-base font-extrabold leading-tight text-white drop-shadow">
                    {genre.label}
                  </span>
                  <span className="relative z-10 mt-0.5 block text-[11px] font-semibold text-white/70">
                    {genre.trackCount} canción{genre.trackCount === 1 ? "" : "es"}
                  </span>

                  {genre.coverUrl && (
                    // Portada girada asomando por la esquina, como Spotify.
                    // `alt=""` porque es decorativa: el nombre del género ya
                    // está en el texto y un lector de pantalla no necesita
                    // oír dos veces lo mismo.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={genre.coverUrl}
                      alt=""
                      aria-hidden
                      className="absolute -bottom-2 -right-3 h-[62%] w-auto rotate-[25deg] rounded shadow-lg"
                    />
                  )}
                </button>
              ))}
      </div>
    </section>
  );
}
