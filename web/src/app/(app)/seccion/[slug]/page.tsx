"use client";

import { use, useCallback } from "react";
import Link from "next/link";
import { usePlayerStore } from "../../../../store/usePlayerStore";
import { useCatalogSection } from "../../../../lib/useCatalogSection";
import { fetchEditorialSection, type EditorialSection } from "../../../../lib/editorial";
import { CoverImage } from "../../../../components/CoverImage";
import { TrackList } from "../../../../components/TrackList";

/**
 * Página de una sección de la portada: /seccion/lo-nuevo.
 *
 * Existe porque las secciones ya tenían slug pero no había ningún sitio al
 * que llevaran: el enlace estaba roto desde que se creó el modelo.
 *
 * A diferencia del carrusel de Inicio, aquí se ve la sección ENTERA: las
 * pistas como lista reproducible y los álbumes y artistas como cuadrícula.
 */
/**
 * `params` se tipa a mano y no con `PageProps<…>`: ese tipo lo genera Next
 * al compilar, así que una ruta recién creada todavía no figura ahí y el
 * chequeo de tipos falla antes del primer build.
 */
export default function SectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const play = usePlayerStore((s) => s.play);

  const section = useCatalogSection<EditorialSection>(
    useCallback(async () => {
      const found = await fetchEditorialSection(slug);
      // `useCatalogSection` trabaja con listas; una sección suelta se envuelve
      // en un array de uno para reutilizar su manejo de carga y error.
      return found ? [found] : [];
    }, [slug]),
  );

  const data = section.items[0];

  if (section.loading) {
    return (
      <main className="flex-1 px-6 py-8 pb-32 sm:px-10">
        <div className="h-10 w-64 animate-pulse rounded bg-white/10" />
        <div className="mt-8 flex flex-col gap-2">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded bg-white/5" />
          ))}
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-20 pb-32">
        <h1 className="text-2xl font-bold">Esta sección no existe</h1>
        <p className="text-sm text-muted">
          Puede que se haya despublicado desde el panel, o que el enlace esté mal escrito.
        </p>
        <Link href="/dashboard" className="rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-black">
          Volver a Inicio
        </Link>
      </main>
    );
  }

  const hasTracks = data.tracks.length > 0;

  return (
    <main className="flex-1 px-6 py-8 pb-32 sm:px-10">
      <header className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Sección</p>
        <h1 className="mt-1 text-4xl font-extrabold tracking-tight sm:text-5xl">{data.title}</h1>
        {data.subtitle && <p className="mt-2 text-sm text-muted">{data.subtitle}</p>}
      </header>

      {hasTracks && (
        <>
          <button
            onClick={() => play(data.tracks[0]!, data.tracks)}
            className="mb-6 rounded-full bg-brand px-8 py-3 text-base font-bold text-black transition-transform hover:scale-105"
          >
            Reproducir
          </button>
          <TrackList tracks={data.tracks} numbered />
        </>
      )}

      {data.albums.length > 0 && (
        <section className={hasTracks ? "mt-10" : ""}>
          <h2 className="mb-4 text-xl font-bold">Álbumes</h2>
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
            {data.albums.map((album) => (
              <Link key={album.id} href={`/artists/${album.artist.id}`} className="group">
                <CoverImage src={album.coverUrl} alt={album.title} size={200} rounded="rounded-lg" />
                <p className="mt-2 truncate text-sm font-semibold group-hover:underline">{album.title}</p>
                <p className="truncate text-xs text-muted">{album.artist.name}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {data.artists.length > 0 && (
        <section className={hasTracks || data.albums.length > 0 ? "mt-10" : ""}>
          <h2 className="mb-4 text-xl font-bold">Artistas</h2>
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-6">
            {data.artists.map((artist) => (
              <Link key={artist.id} href={`/artists/${artist.id}`} className="group text-center">
                <CoverImage src={artist.imageUrl} alt={artist.name} size={160} rounded="rounded-full" />
                <p className="mt-2 truncate text-sm font-semibold group-hover:underline">{artist.name}</p>
                {artist.isVerified && <p className="truncate text-xs text-sky-400">Verificado</p>}
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
