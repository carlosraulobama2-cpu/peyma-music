"use client";

import Link from "next/link";
import { CoverImage } from "../CoverImage";

interface MediaCardProps {
  title: string;
  subtitle: string;
  coverUrl: string | null;
  onPlay: () => void;
  /**
   * Abre el menú de opciones (⋮ o clic derecho). Si no se pasa, la tarjeta
   * no muestra el botón: hay sitios donde no hay acciones que ofrecer.
   */
  onOpenMenu?: (position: { x: number; y: number }) => void;
  /**
   * Si se pasa, el subtítulo (el nombre del artista) se convierte en
   * enlace a su perfil.
   */
  artistId?: string;
}

/**
 * Tarjeta de carrusel.
 *
 * La tarjeta NO es un único `<button>`, aunque sería más corto: dentro hay
 * un segundo botón (el ⋮) y un botón dentro de otro es HTML inválido — el
 * navegador decide cuál recibe el clic y no siempre igual. El contenedor es
 * un `<div>` y cada acción tiene su propio botón.
 */
export function MediaCard({ title, subtitle, coverUrl, onPlay, onOpenMenu, artistId }: MediaCardProps) {
  return (
    <div
      onContextMenu={
        onOpenMenu
          ? (event) => {
              event.preventDefault();
              onOpenMenu({ x: event.clientX, y: event.clientY });
            }
          : undefined
      }
      className="group relative flex w-40 flex-shrink-0 snap-start flex-col gap-3 rounded-md p-3 transition-all duration-300 ease-in-out hover:bg-[#282828] sm:w-44"
    >
      <button onClick={onPlay} aria-label={`Reproducir ${title}`} className="text-left">
        <span className="relative block aspect-square w-full overflow-hidden rounded-md shadow-lg">
          <CoverImage src={coverUrl} alt={title} size={176} rounded="rounded-none" className="h-full w-full" />
          <span
            aria-hidden
            className="absolute bottom-2 right-2 flex h-10 w-10 translate-y-2 items-center justify-center rounded-full bg-brand text-black opacity-0 shadow-xl transition-all duration-300 ease-in-out group-hover:translate-y-0 group-hover:opacity-100 group-hover:scale-105"
          >
            ▶
          </span>
        </span>
      </button>

      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{title}</p>
        {artistId ? (
          // El nombre del artista lleva a su perfil. Va FUERA del botón de
          // reproducir (un enlace dentro de un botón es HTML inválido) y
          // por eso la tarjeta no es un único elemento pulsable.
          <Link
            href={`/artists/${artistId}`}
            className="block truncate text-xs text-muted transition-colors hover:text-foreground hover:underline"
          >
            {subtitle}
          </Link>
        ) : (
          <p className="truncate text-xs text-muted">{subtitle}</p>
        )}
      </div>

      {onOpenMenu && (
        <button
          onClick={(event) => {
            event.stopPropagation();
            const rect = event.currentTarget.getBoundingClientRect();
            // Se ancla al botón y no al puntero: pulsado con teclado no hay
            // coordenadas de ratón, y el menú saldría en la esquina.
            onOpenMenu({ x: rect.left, y: rect.bottom });
          }}
          aria-label={`Más opciones para ${title}`}
          className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-sm opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
        >
          ⋮
        </button>
      )}
    </div>
  );
}

export function MediaCardSkeleton() {
  return (
    <div className="flex w-40 flex-shrink-0 flex-col gap-3 p-3 sm:w-44">
      <div className="aspect-square w-full animate-pulse rounded-md bg-surface-raised" />
      <div className="h-3.5 w-3/4 animate-pulse rounded bg-surface-raised" />
      <div className="h-3 w-1/2 animate-pulse rounded bg-surface-raised" />
    </div>
  );
}
