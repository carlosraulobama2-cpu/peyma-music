"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { fetchMyPlaylistsFull, fetchFollowedArtists, type FollowedArtist } from "../lib/library";
import { LibraryContext } from "../lib/libraryContext";
import type { CatalogPlaylist } from "../lib/catalog";
import { AppHeader } from "./AppHeader";
import { LibrarySidebar } from "./LibrarySidebar";
import { NowPlayingPanel } from "./NowPlayingPanel";
import { MobileNav } from "./MobileNav";
import { useUiStore } from "../store/useUiStore";

/**
 * Shell de 3 zonas: sidebar de biblioteca · contenido con su propio scroll ·
 * player deck (montado aparte, en el layout raíz, para que no se desmonte
 * al navegar entre rutas).
 *
 * La biblioteca se carga UNA vez acá y se comparte por contexto con el
 * sidebar y con `/library`.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const [playlists, setPlaylists] = useState<CatalogPlaylist[]>([]);
  const [artists, setArtists] = useState<FollowedArtist[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([fetchMyPlaylistsFull(50), fetchFollowedArtists(50)])
      .then(([p, a]) => {
        if (cancelled) return;
        if (p.status === "fulfilled") setPlaylists(p.value);
        if (a.status === "fulfilled") setArtists(a.value);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isNowPlayingOpen = useUiStore((s) => s.isNowPlayingOpen);
  const closeNowPlaying = useUiStore((s) => s.closeNowPlaying);

  const addPlaylist = useCallback((playlist: CatalogPlaylist) => {
    setPlaylists((prev) => [playlist, ...prev]);
  }, []);

  return (
    <LibraryContext.Provider value={{ playlists, artists, loading, addPlaylist }}>
      <div className="flex flex-1 overflow-hidden">
        <LibrarySidebar playlists={playlists} artists={artists} loading={loading} />

        {/* El scroll vive sólo acá: sidebar y player quedan fijos. */}
        <div className="scrollbar-thin flex flex-1 flex-col overflow-y-auto scroll-smooth">
          <AppHeader />
          {children}
        </div>

        {isNowPlayingOpen && <NowPlayingPanel onClose={closeNowPlaying} />}
        <MobileNav />
      </div>
    </LibraryContext.Provider>
  );
}
