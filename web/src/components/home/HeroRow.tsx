"use client";

import Link from "next/link";
import { CoverImage } from "../CoverImage";
import { usePlayerStore } from "../../store/usePlayerStore";
import type { HeroItem } from "../../lib/useHomeFeed";
import type { CatalogTrack } from "../../lib/catalog";

/**
 * Fila VIP: el contenido promocionado desde el panel de control.
 *
 * Cada tarjeta usa el color dominante REAL de su portada, extraído en el
 * servidor. El degradado va de ese color a transparente, que es lo que hace
 * que la tarjeta parezca una extensión de la carátula en vez de una caja
 * de color pegada al lado.
 *
 * Si una portada todavía no tiene color calculado se usa un gris neutro en
 * vez de inventar uno: un degradado al azar que no pega con la imagen se ve
 * peor que no tener degradado.
 */

const FALLBACK_COLOR = "#2a2a2e";

/** Días que le quedan a una campaña, para el aviso de "termina pronto". */
function daysLeft(endsAt: string | null): number | null {
  if (!endsAt) return null;
  const ms = new Date(endsAt).getTime() - Date.now();
  return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000);
}

interface HeroRowProps {
  items: HeroItem[];
}

export function HeroRow({ items }: HeroRowProps) {
  const play = usePlayerStore((s) => s.play);

  if (items.length === 0) return null;

  // Cola de reproducción de la fila: darle al play en una tarjeta encadena
  // con las siguientes, como cualquier otra fila.
  const queue = items.map((item) => item.track as CatalogTrack);

  return (
    <section aria-label="Destacados">
      <h2 className="mb-4 text-xl font-bold sm:text-2xl">Destacado</h2>

      {/* `snap` para que el desplazamiento se detenga alineado con cada
          tarjeta en vez de a mitad de camino. */}
      <div className="scrollbar-thin flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2">
        {items.map((item, index) => {
          const color = item.track.dominantColor ?? FALLBACK_COLOR;
          const remaining = daysLeft(item.endsAt);

          return (
            <article
              key={item.promotionId}
              className="group relative w-[min(100%,26rem)] shrink-0 snap-start overflow-hidden rounded-xl"
              style={{ background: `linear-gradient(120deg, ${color} 0%, ${color}66 55%, transparent 100%)` }}
            >
              <div className="flex items-center gap-4 p-4 backdrop-blur-[1px]">
                <CoverImage src={item.track.coverUrl} alt={item.track.title} size={104} rounded="rounded-lg" />

                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-white/70">Destacado</p>
                  <p className="mt-1 line-clamp-2 text-lg font-extrabold leading-tight">{item.track.title}</p>
                  <Link
                    href={`/artists/${item.track.artist.id}`}
                    className="mt-0.5 block truncate text-sm text-white/80 hover:underline"
                  >
                    {item.track.artist.name}
                  </Link>
                  {remaining !== null && remaining <= 2 && (
                    <p className="mt-1 text-[11px] font-semibold text-white/70">
                      {remaining === 0 ? "Termina hoy" : `Termina en ${remaining} día(s)`}
                    </p>
                  )}
                </div>

                <button
                  onClick={() => play(item.track as CatalogTrack, queue.slice(index))}
                  aria-label={`Reproducir ${item.track.title}`}
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand text-black shadow-lg transition-transform hover:scale-110"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

/** Esqueleto con la misma forma que la tarjeta real, para no dar un salto al cargar. */
export function HeroRowSkeleton() {
  return (
    <section>
      <div className="mb-4 h-7 w-32 animate-pulse rounded bg-white/10" />
      <div className="flex gap-4 overflow-hidden">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="h-[136px] w-[min(100%,26rem)] shrink-0 animate-pulse rounded-xl bg-white/5" />
        ))}
      </div>
    </section>
  );
}
