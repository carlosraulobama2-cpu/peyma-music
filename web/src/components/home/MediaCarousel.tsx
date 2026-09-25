"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";

const SCROLL_STEP = 400;

interface MediaCarouselProps {
  title: string;
  subtitle?: string;
  /** Si se pasa, el título se convierte en enlace a la sección completa. */
  href?: string;
  /**
   * Ícono simbólico de la sección, con un halo de su propio color — sin
   * esto, diez carruseles seguidos (Novedades, Para ti, cada género…) se
   * leían como el mismo título repetido. Cada sección ahora se distingue
   * de un vistazo, igual que en la app.
   */
  icon?: LucideIcon;
  accentColor?: string;
  children: ReactNode;
}

/**
 * Carrusel horizontal con flechas, scroll snap y arrastre con el ratón.
 *
 * Las flechas se ocultan en los extremos midiendo el scroll real en vez de
 * contar tarjetas: así funciona igual con 3 elementos que con 50, y no hay
 * que avisarle al componente cuántos hijos tiene.
 */
export function MediaCarousel({ title, subtitle, href, icon: Icon, accentColor = "#1DB954", children }: MediaCarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateArrows = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    // -4px de tolerancia: el redondeo subpíxel hace que scrollLeft nunca llegue exacto al final.
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    updateArrows();
    // ResizeObserver además del listener de scroll: si cambia el ancho del
    // panel (sidebar redimensionado), las flechas tienen que recalcularse.
    const observer = new ResizeObserver(updateArrows);
    observer.observe(el);
    el.addEventListener("scroll", updateArrows, { passive: true });
    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", updateArrows);
    };
  }, [updateArrows]);

  const scrollBy = (delta: number) => trackRef.current?.scrollBy({ left: delta, behavior: "smooth" });

  return (
    <section className="group/carousel relative">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {Icon && (
            <span
              className="flex size-7 shrink-0 items-center justify-center rounded-lg"
              style={{ backgroundColor: `${accentColor}22` }}
            >
              <Icon size={15} color={accentColor} strokeWidth={2.25} />
            </span>
          )}
          <div className="min-w-0">
            <h2 className="truncate text-xl font-bold tracking-tight sm:text-2xl">
              {href ? (
                <Link href={href} className="hover:underline">
                  {title}
                </Link>
              ) : (
                title
              )}
            </h2>
            {subtitle && <p className="truncate text-sm text-muted">{subtitle}</p>}
          </div>
        </div>
        <div className="flex shrink-0 gap-2 opacity-0 transition-opacity duration-300 group-hover/carousel:opacity-100">
          <button
            onClick={() => scrollBy(-SCROLL_STEP)}
            disabled={!canScrollLeft}
            aria-label="Desplazar a la izquierda"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-sm transition-all hover:bg-black/80 disabled:cursor-not-allowed disabled:opacity-30"
          >
            ‹
          </button>
          <button
            onClick={() => scrollBy(SCROLL_STEP)}
            disabled={!canScrollRight}
            aria-label="Desplazar a la derecha"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-sm transition-all hover:bg-black/80 disabled:cursor-not-allowed disabled:opacity-30"
          >
            ›
          </button>
        </div>
      </div>

      <div
        ref={trackRef}
        className="no-scrollbar flex snap-x snap-mandatory gap-2 overflow-x-auto scroll-smooth pb-2"
      >
        {children}
      </div>
    </section>
  );
}
