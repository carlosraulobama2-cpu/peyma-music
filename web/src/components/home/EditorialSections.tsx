"use client";

import Link from "next/link";
import { MediaCarousel } from "./MediaCarousel";
import { MediaCard, MediaCardSkeleton } from "./MediaCard";
import type { EditorialSection } from "../../lib/editorial";
import type { CatalogTrack } from "../../lib/catalog";

/**
 * Pinta las secciones que el curador definió en el panel de control.
 *
 * El backend ya devuelve cada sección resuelta y ordenada, y omite las
 * vacías, así que aquí no hay lógica de "qué mostrar": sólo cómo. La
 * decisión de qué entra en "Lo nuevo" vive en un solo sitio, y cambiarla no
 * requiere tocar ni la web ni la app.
 */

interface EditorialSectionsProps {
  sections: EditorialSection[];
  loading: boolean;
  onPlay: (track: CatalogTrack, queue: CatalogTrack[]) => void;
}

export function EditorialSections({ sections, loading, onPlay }: EditorialSectionsProps) {
  if (loading) {
    return (
      <MediaCarousel title="Cargando…">
        {[...Array(6)].map((_, i) => (
          <MediaCardSkeleton key={i} />
        ))}
      </MediaCarousel>
    );
  }

  return (
    <>
      {sections.map((section) => {
        // Una sección lleva pistas, álbumes o artistas — nunca mezcla, pero
        // se concatenan igual para no repetir tres bloques de render casi
        // idénticos.
        const cards = [
          ...section.tracks.map((track) => ({
            key: `t-${track.id}`,
            title: track.title,
            subtitle: track.artist.name,
            coverUrl: track.coverUrl,
            artistId: track.artist.id,
            onPlay: () => onPlay(track, section.tracks),
          })),
          ...section.albums.map((album) => ({
            key: `a-${album.id}`,
            title: album.title,
            subtitle: album.artist.name,
            coverUrl: album.coverUrl,
            artistId: album.artist.id,
            // Un álbum no se puede reproducir desde esta tarjeta: la sección
            // no trae sus pistas. Se deja sin acción en vez de poner un play
            // que no haga nada.
            onPlay: undefined,
          })),
          ...section.artists.map((artist) => ({
            key: `r-${artist.id}`,
            title: artist.name,
            subtitle: artist.isVerified ? "Artista verificado" : artist.genres.slice(0, 2).join(" · "),
            coverUrl: artist.imageUrl,
            artistId: artist.id,
            onPlay: undefined,
          })),
        ];

        if (cards.length === 0) return null;

        if (section.layout === "GRID") {
          return (
            <section key={section.id}>
              {/* El título lleva a la sección completa: el carrusel sólo
                  muestra las primeras piezas. */}
              <h2 className="mb-1 text-xl font-bold sm:text-2xl">
                <Link href={`/seccion/${section.slug}`} className="hover:underline">
                  {section.title}
                </Link>
              </h2>
              {section.subtitle && <p className="mb-4 text-sm text-muted">{section.subtitle}</p>}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                {cards.map((card) => (
                  <MediaCard
                    key={card.key}
                    title={card.title}
                    subtitle={card.subtitle}
                    coverUrl={card.coverUrl}
                    artistId={card.artistId}
                    onPlay={card.onPlay ?? (() => {})}
                  />
                ))}
              </div>
            </section>
          );
        }

        return (
          <MediaCarousel key={section.id} title={section.title} href={`/seccion/${section.slug}`}>
            {cards.map((card) => (
              <MediaCard
                key={card.key}
                title={card.title}
                subtitle={card.subtitle}
                coverUrl={card.coverUrl}
                artistId={card.artistId}
                onPlay={card.onPlay ?? (() => {})}
              />
            ))}
          </MediaCarousel>
        );
      })}
    </>
  );
}
