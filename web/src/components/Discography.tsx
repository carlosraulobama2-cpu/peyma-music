"use client";

import { useMemo, useState } from "react";
import { MediaCard } from "./home/MediaCard";
import { MediaCarousel } from "./home/MediaCarousel";
import type { DiscographyAlbum } from "../lib/artists";

type Category = "all" | "albums" | "singles";

/**
 * El backend no guarda un tipo de lanzamiento (álbum / EP / sencillo), así
 * que se deriva del número real de pistas — el mismo criterio que usa la
 * industria. Es una heurística, no un dato inventado: si mañana se agrega
 * una columna `albumType`, esto se reemplaza por ella.
 */
function isSingle(album: DiscographyAlbum): boolean {
  return album.trackCount > 0 && album.trackCount <= 2;
}

const TABS: { id: Category; label: string }[] = [
  { id: "all", label: "Todo" },
  { id: "albums", label: "Álbumes" },
  { id: "singles", label: "Sencillos y EPs" },
];

interface DiscographyProps {
  albums: DiscographyAlbum[];
  onPlayAlbum: (album: DiscographyAlbum) => void;
}

export function Discography({ albums, onPlayAlbum }: DiscographyProps) {
  const [category, setCategory] = useState<Category>("all");

  const visible = useMemo(() => {
    if (category === "albums") return albums.filter((a) => !isSingle(a));
    if (category === "singles") return albums.filter(isSingle);
    return albums;
  }, [albums, category]);

  // Sólo se ofrecen las pestañas si de verdad hay de los dos tipos; con un
  // único tipo, un filtro que siempre devuelve lo mismo sólo estorba.
  const hasBoth = albums.some(isSingle) && albums.some((a) => !isSingle(a));

  if (albums.length === 0) return null;

  return (
    <section>
      {hasBoth && (
        <div className="mb-4 flex gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setCategory(tab.id)}
              aria-pressed={category === tab.id}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-all duration-300 ease-in-out ${
                category === tab.id ? "bg-foreground text-background" : "bg-white/10 hover:bg-white/20"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      <MediaCarousel title="Discografía">
        {visible.map((album) => (
          <MediaCard
            key={album.id}
            title={album.title}
            subtitle={`${album.releaseYear} · ${isSingle(album) ? "Sencillo" : "Álbum"}`}
            coverUrl={album.coverUrl}
            onPlay={() => onPlayAlbum(album)}
          />
        ))}
      </MediaCarousel>
    </section>
  );
}
