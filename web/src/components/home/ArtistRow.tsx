"use client";

import Link from "next/link";
import { MediaCarousel } from "./MediaCarousel";
import { CoverImage } from "../CoverImage";

/**
 * Fila de artistas con avatar redondo.
 *
 * Reutiliza `MediaCarousel`, que ya resuelve el desplazamiento horizontal
 * con flechas, arrastre con el ratón y ajuste al soltar. Escribir un
 * segundo carrusel sólo para cambiar la forma de la imagen sería duplicar
 * esa lógica y que las dos se fueran separando.
 *
 * Cada tarjeta es un enlace, no un botón de reproducir: en un artista, lo
 * que se espera al pulsar es ir a su perfil. El play va dentro.
 */

export interface ArtistCard {
  id: string;
  name: string;
  imageUrl: string;
  isVerified?: boolean;
  /** Texto bajo el nombre: géneros, oyentes… */
  subtitle?: string;
}

interface ArtistRowProps {
  title: string;
  artists: ArtistCard[];
  href?: string;
}

export function ArtistRow({ title, artists, href }: ArtistRowProps) {
  if (artists.length === 0) return null;

  return (
    <MediaCarousel title={title} href={href}>
      {artists.map((artist) => (
        <Link
          key={artist.id}
          href={`/artists/${artist.id}`}
          className="group flex w-36 flex-shrink-0 snap-start flex-col items-center gap-3 rounded-md p-3 text-center transition-all duration-300 hover:bg-[#282828] sm:w-40"
        >
          <CoverImage
            src={artist.imageUrl}
            alt={artist.name}
            size={128}
            rounded="rounded-full"
            className="shadow-lg transition-transform duration-300 group-hover:scale-105"
          />
          <span className="min-w-0 w-full">
            <span className="flex items-center justify-center gap-1 truncate text-sm font-semibold">
              <span className="truncate">{artist.name}</span>
              {artist.isVerified && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="#3d91f4" className="shrink-0" aria-label="Verificado">
                  <path d="M12 2l2.4 2.4 3.4-.6.6 3.4L21 9.6 18.4 12 21 14.4l-2.6 2.4-.6 3.4-3.4-.6L12 22l-2.4-2.4-3.4.6-.6-3.4L3 14.4 5.6 12 3 9.6l2.6-2.4.6-3.4 3.4.6L12 2Z" />
                  <path d="m10.8 15.2-2.9-2.9 1.3-1.3 1.6 1.6 4-4 1.3 1.3-5.3 5.3Z" fill="#fff" />
                </svg>
              )}
            </span>
            <span className="block truncate text-xs text-muted">{artist.subtitle ?? "Artista"}</span>
          </span>
        </Link>
      ))}
    </MediaCarousel>
  );
}
