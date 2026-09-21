"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CoverImage } from "./CoverImage";
import { usePlayerStore } from "../store/usePlayerStore";
import type { CatalogPlaylist } from "../lib/catalog";
import type { FollowedArtist } from "../lib/library";

const MIN_WIDTH = 280;
const MAX_WIDTH = 420;
const WIDTH_KEY = "peyma-sidebar-width";

type Filter = "all" | "playlists" | "artists";

interface LibrarySidebarProps {
  playlists: CatalogPlaylist[];
  artists: FollowedArtist[];
  loading: boolean;
}

/** Ecualizador animado sobre la portada del ítem que está sonando. */
function NowPlayingBars() {
  return (
    <span aria-label="Reproduciendo" className="flex h-3 items-end gap-[2px]">
      {[0, 1, 2].map((i) => (
        <span key={i} className="w-[3px] animate-[eqbar_0.9s_ease-in-out_infinite] bg-brand" style={{ animationDelay: `${i * 0.15}s`, height: "100%" }} />
      ))}
    </span>
  );
}

export function LibrarySidebar({ playlists, artists, loading }: LibrarySidebarProps) {
  const pathname = usePathname();
  const currentTrack = usePlayerStore((s) => s.currentTrack);

  const [width, setWidth] = useState(MIN_WIDTH);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [pinned, setPinned] = useState<Set<string>>(new Set());
  const draggingRef = useRef(false);

  useEffect(() => {
    const stored = Number(window.localStorage.getItem(WIDTH_KEY));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ancho persistido en localStorage (sistema externo)
    if (stored >= MIN_WIDTH && stored <= MAX_WIDTH) setWidth(stored);
  }, []);

  // El arrastre escucha en `window`, no en el divisor: si el puntero se mueve
  // rápido y sale del elemento, sin esto el redimensionado se cortaría.
  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (!draggingRef.current) return;
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, event.clientX));
      setWidth(next);
    };
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.userSelect = "";
      window.localStorage.setItem(WIDTH_KEY, String(width));
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [width]);

  const startDrag = useCallback(() => {
    draggingRef.current = true;
    // Sin esto, arrastrar selecciona texto de toda la página.
    document.body.style.userSelect = "none";
  }, []);

  const togglePin = (id: string) => {
    setPinned((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const q = query.trim().toLowerCase();
  const items = [
    ...(filter === "artists" ? [] : playlists.map((p) => ({ id: p.id, title: p.title, coverUrl: p.coverUrl, href: `/playlists/${p.id}`, kind: "Playlist", round: false }))),
    ...(filter === "playlists" ? [] : artists.map((a) => ({ id: a.id, title: a.name, coverUrl: a.imageUrl, href: `/artists/${a.id}`, kind: "Artista", round: true }))),
  ]
    .filter((item) => !q || item.title.toLowerCase().includes(q))
    // Los fijados primero, conservando el orden relativo del resto.
    .sort((a, b) => Number(pinned.has(b.id)) - Number(pinned.has(a.id)));

  return (
    <aside style={{ width }} className="relative hidden flex-shrink-0 flex-col gap-4 border-r border-white/5 bg-surface py-4 lg:flex">
      <div className="flex items-center justify-between px-4">
        <h2 className="text-sm font-bold text-muted">Tu biblioteca</h2>
      </div>

      {/* Accesos que antes sólo estaban en la cabecera o en otra página.
          La barra lateral es lo que se ve siempre: tener aquí "crear" y
          "subir" ahorra ir a Biblioteca sólo para pulsar un botón. */}
      <nav className="flex flex-col gap-0.5 px-2">
        <Link
          href="/library"
          className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm font-semibold text-muted transition-colors hover:bg-white/5 hover:text-foreground"
        >
          <span aria-hidden className="text-base leading-none">＋</span>
          Crear playlist
        </Link>
        <Link
          href="/subir"
          className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm font-semibold text-muted transition-colors hover:bg-white/5 hover:text-foreground"
        >
          <span aria-hidden className="text-base leading-none">↑</span>
          Subir una canción
        </Link>
        <Link
          href="/artista"
          className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm font-semibold text-muted transition-colors hover:bg-white/5 hover:text-foreground"
        >
          <span aria-hidden className="text-base leading-none">🎤</span>
          Perfil de artista
        </Link>
        <Link
          href="/perfil"
          className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm font-semibold text-muted transition-colors hover:bg-white/5 hover:text-foreground"
        >
          <span aria-hidden className="text-base leading-none">⚙</span>
          Ajustes
        </Link>
      </nav>

      <div className="mx-4 border-t border-white/5" />

      <div className="flex gap-2 px-4">
        {([["all", "Todo"], ["playlists", "Playlists"], ["artists", "Artistas"]] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            aria-pressed={filter === id}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-all duration-300 ${
              filter === id ? "bg-foreground text-background" : "bg-white/10 hover:bg-white/20"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="px-4">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar en tu biblioteca"
          aria-label="Buscar en tu biblioteca"
          className="w-full rounded-md border border-white/10 bg-black/20 px-3 py-2 text-xs outline-none transition-colors focus:border-brand"
        />
      </div>

      <nav className="scrollbar-thin flex-1 overflow-y-auto px-2">
        {loading ? (
          <ul className="flex flex-col gap-1 px-2">
            {[...Array(6)].map((_, i) => (
              <li key={i} className="h-12 animate-pulse rounded-md bg-white/5" />
            ))}
          </ul>
        ) : items.length === 0 ? (
          <p className="px-2 py-4 text-xs text-muted">{q ? "Nada coincide con tu búsqueda." : "Tu biblioteca está vacía."}</p>
        ) : (
          <ul className="flex flex-col">
            {items.map((item) => {
              const isActive = pathname === item.href;
              const isSounding = Boolean(currentTrack) && item.kind === "Artista" && currentTrack?.artist.id === item.id;
              return (
                <li key={item.id} className="group relative">
                  <Link
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-md px-2 py-2 transition-colors ${isActive ? "bg-white/10" : "hover:bg-white/5"}`}
                  >
                    <CoverImage src={item.coverUrl} alt={item.title} size={40} rounded={item.round ? "rounded-full" : "rounded"} glow={false} />
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-sm font-semibold ${isSounding ? "text-brand" : ""}`}>{item.title}</span>
                      <span className="block truncate text-xs text-muted">
                        {pinned.has(item.id) && <span aria-label="Fijado">📌 </span>}
                        {item.kind}
                      </span>
                    </span>
                    {isSounding && <NowPlayingBars />}
                  </Link>
                  <button
                    onClick={() => togglePin(item.id)}
                    aria-label={pinned.has(item.id) ? `Dejar de fijar ${item.title}` : `Fijar ${item.title}`}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    {pinned.has(item.id) ? "📌" : "📍"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </nav>

      <div
        onPointerDown={startDrag}
        role="separator"
        aria-orientation="vertical"
        aria-label="Redimensionar biblioteca"
        className="absolute right-0 top-0 h-full w-1 cursor-col-resize bg-transparent transition-colors hover:bg-brand/40"
      />
    </aside>
  );
}
