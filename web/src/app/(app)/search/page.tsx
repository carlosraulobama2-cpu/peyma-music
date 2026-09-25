"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../../../lib/AuthProvider";
import { usePlayerStore } from "../../../store/usePlayerStore";
import { search, type SearchResults } from "../../../lib/search";
import { fetchTracksByGenre } from "../../../lib/catalog";
import { MediaCard, MediaCardSkeleton } from "../../../components/home/MediaCard";
import { TrackList } from "../../../components/TrackList";
import { ExploreCategories } from "../../../components/ExploreCategories";
import { ArtistRow } from "../../../components/home/ArtistRow";
import { MediaCarousel } from "../../../components/home/MediaCarousel";

const EMPTY: SearchResults = { tracks: [], artists: [], albums: [], playlists: [] };

function SearchPageContent() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const play = usePlayerStore((s) => s.play);

  /**
   * Filtro por categoría, desde la cuadrícula de "Explorar todo".
   *
   * Son dos parámetros porque hay dos vocabularios: `primaryGenre` es el
   * enum cerrado de `Track.genre` y `genre` son las etiquetas libres del
   * artista. El backend los filtra distinto, así que mezclarlos en uno
   * devolvería resultados vacíos para la mitad de las tarjetas.
   */
  const searchParams = useSearchParams();
  const primaryGenre = searchParams.get("primaryGenre");
  const genreTag = searchParams.get("genre");
  const mood = searchParams.get("mood");
  const activeCategory = primaryGenre ?? genreTag ?? mood;

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [searching, setSearching] = useState(false);
  /**
   * Resultados de la categoría y CUÁL está cargada.
   *
   * Guardar la categoría junto a sus resultados permite derivar "está
   * cargando" comparándola con la de la URL, en vez de un `setState`
   * síncrono dentro del efecto —que arranca un render en cascada.
   */
  const [categoryData, setCategoryData] = useState<{ category: string; tracks: SearchResults } | null>(null);

  useEffect(() => {
    if (!isLoading && !user) router.replace("/login");
  }, [isLoading, user, router]);

  // Debounce de 300ms: sin esto cada tecla dispara 3 peticiones al backend.
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) return;

    const timer = setTimeout(() => {
      setSearching(true);
      search(trimmed)
        .then(setResults)
        .catch(() => setResults(EMPTY))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Resultados de una categoría. Van en su propio efecto porque dependen
  // de la URL, no de lo que se escribe.
  useEffect(() => {
    if (!activeCategory) return;
    let cancelled = false;

    fetchTracksByGenre(
      primaryGenre ? { primaryGenre } : mood ? { mood } : { genre: genreTag! },
    )
      .then((tracks) => {
        if (!cancelled) setCategoryData({ category: activeCategory, tracks: { tracks, artists: [], albums: [], playlists: [] } });
      })
      .catch(() => {
        if (!cancelled) setCategoryData({ category: activeCategory, tracks: EMPTY });
      });

    return () => {
      cancelled = true;
    };
  }, [activeCategory, primaryGenre, genreTag, mood]);

  if (isLoading || !user) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <p className="text-sm text-muted">Cargando…</p>
      </main>
    );
  }

  // Derivado en render (no en un efecto): con la búsqueda vacía no se
  // muestran los resultados viejos, sin tener que limpiarlos por setState.
  // Lo que se escribe manda sobre el filtro de categoría: si el usuario
  // empieza a teclear, quiere buscar, no seguir viendo el género.
  const categoryReady = categoryData?.category === activeCategory;
  const visible = query.trim()
    ? results
    : activeCategory && categoryReady
      ? categoryData.tracks
      : EMPTY;

  // "Cargando" se deriva: o se está buscando texto, o la categoría de la
  // URL todavía no coincide con la que hay cargada.
  const isBusy = searching || Boolean(activeCategory && !query.trim() && !categoryReady);
  const hasResults =
    visible.tracks.length > 0 || visible.artists.length > 0 || visible.albums.length > 0 || visible.playlists.length > 0;

  return (
    <main className="flex-1 flex flex-col pb-32">

      <div className="flex flex-col gap-10 px-6 py-8 sm:px-10">
        <div className="relative w-full max-w-2xl">
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            className="pointer-events-none absolute left-6 top-1/2 h-6 w-6 -translate-y-1/2 text-muted"
          >
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="¿Qué quieres reproducir?"
            className="w-full rounded-full border border-white/15 bg-surface py-5 pl-16 pr-6 text-base outline-none transition-colors focus:border-brand"
          />
        </div>

        {/* Cuadrícula de categorías, debajo del buscador. Sólo cuando no
            hay búsqueda activa: mientras se busca, lo que importa son los
            resultados. */}
        {!query.trim() && !activeCategory && <ExploreCategories />}

        {activeCategory && !query.trim() && (
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-bold capitalize sm:text-2xl">{activeCategory}</h2>
            <button
              onClick={() => router.push("/search")}
              className="rounded-full border border-white/25 px-3 py-1 text-xs font-semibold transition-colors hover:border-white"
            >
              Quitar filtro
            </button>
          </div>
        )}

        {isBusy && (
          <div className="flex gap-2">
            {[...Array(5)].map((_, i) => (
              <MediaCardSkeleton key={i} />
            ))}
          </div>
        )}

        {!isBusy && query.trim() && !hasResults && (
          <p className="text-sm text-muted">No encontramos nada para &ldquo;{query.trim()}&rdquo;.</p>
        )}

        {!isBusy && visible.tracks.length > 0 && (
          <section>
            <h2 className="mb-4 text-xl font-bold sm:text-2xl">Canciones</h2>
            <TrackList tracks={visible.tracks} />
          </section>
        )}

        {!isBusy && visible.artists.length > 0 && (
          // Misma fila redonda que Inicio: un artista se ve igual en toda
          // la web, y cada tarjeta es un enlace a su perfil.
          <ArtistRow
            title="Artistas"
            artists={visible.artists.map((artist) => ({
              id: artist.id,
              name: artist.name,
              imageUrl: artist.imageUrl,
              isVerified: artist.isVerified,
              subtitle: `${artist.monthlyListeners.toLocaleString("es")} oyentes mensuales`,
            }))}
          />
        )}

        {!isBusy && visible.albums.length > 0 && (
          <MediaCarousel title="Álbumes">
            {visible.albums.map((album) => (
              <MediaCard
                key={album.id}
                title={album.title}
                subtitle={album.artist.name}
                coverUrl={album.coverUrl}
                onPlay={() => {
                  const track = visible.tracks.find((t) => t.album.id === album.id);
                  if (track) play(track, visible.tracks);
                }}
              />
            ))}
          </MediaCarousel>
        )}

        {!isBusy && visible.playlists.length > 0 && (
          <MediaCarousel title="Playlists">
            {visible.playlists.map((playlist) => (
              <MediaCard
                key={playlist.id}
                title={playlist.title}
                subtitle={`${playlist.ownerName} · ${playlist.trackCount} canción(es)`}
                coverUrl={playlist.coverUrl ?? ""}
                onPlay={() => router.push(`/playlists/${playlist.id}`)}
              />
            ))}
          </MediaCarousel>
        )}
      </div>
    </main>
  );
}

/**
 * `useSearchParams` obliga a una frontera de Suspense.
 *
 * Next prerenderiza esta ruta en el build, y en ese momento no existen los
 * parámetros de la URL. Sin el Suspense la compilación falla; con él, la
 * parte estática se genera igual y la que depende de la URL se resuelve en
 * el cliente.
 */
export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <main className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted">Cargando…</p>
        </main>
      }
    >
      <SearchPageContent />
    </Suspense>
  );
}
