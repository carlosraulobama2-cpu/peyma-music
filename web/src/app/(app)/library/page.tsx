"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../lib/AuthProvider";
import { useCatalogSection } from "../../../lib/useCatalogSection";
import { fetchLikedTracks, createPlaylist } from "../../../lib/library";
import { useLibrary } from "../../../lib/libraryContext";
import { toast } from "../../../store/useToastStore";
import type { CatalogTrack } from "../../../lib/catalog";
import { MediaCard, MediaCardSkeleton } from "../../../components/home/MediaCard";
import { MediaCarousel } from "../../../components/home/MediaCarousel";
import { TrackList } from "../../../components/TrackList";

type Tab = "playlists" | "liked" | "artists";

const TABS: { id: Tab; label: string }[] = [
  { id: "playlists", label: "Playlists" },
  { id: "liked", label: "Me gusta" },
  { id: "artists", label: "Artistas" },
];

export default function LibraryPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  const [tab, setTab] = useState<Tab>("playlists");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) router.replace("/login");
  }, [isLoading, user, router]);

  const { playlists, artists, loading: libraryLoading, addPlaylist } = useLibrary();
  const liked = useCatalogSection<CatalogTrack>(useCallback(() => fetchLikedTracks(50), []));

  const handleCreatePlaylist = async () => {
    const title = window.prompt("Nombre de la playlist", `Mi playlist n.º ${playlists.length + 1}`);
    if (!title?.trim()) return;
    setCreating(true);
    try {
      const { playlist } = await createPlaylist(title.trim());
      addPlaylist(playlist);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo crear la playlist.");
    } finally {
      setCreating(false);
    }
  };

  if (isLoading || !user) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <p className="text-sm text-muted">Cargando…</p>
      </main>
    );
  }


  return (
    <main className="flex-1 flex flex-col pb-32">

      <div className="flex flex-col gap-8 px-6 py-8 sm:px-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-3xl font-bold tracking-tight">Tu biblioteca</h1>
          <button
            onClick={handleCreatePlaylist}
            disabled={creating}
            className="rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-black transition-all duration-300 ease-in-out hover:scale-105 hover:bg-brand-hover disabled:opacity-50"
          >
            {creating ? "Creando…" : "+ Crear playlist"}
          </button>
        </div>

        <div className="flex gap-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? "page" : undefined}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-all duration-300 ease-in-out ${
                tab === t.id ? "bg-foreground text-background" : "bg-white/10 text-foreground hover:bg-white/20"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "playlists" &&
          (libraryLoading ? (
            <div className="flex gap-2">
              {[...Array(5)].map((_, i) => (
                <MediaCardSkeleton key={i} />
              ))}
            </div>
          ) : playlists.length === 0 ? (
            <p className="text-sm text-muted">Todavía no tienes playlists. Creá la primera con el botón de arriba.</p>
          ) : (
            <MediaCarousel title={`${playlists.length} playlist${playlists.length === 1 ? "" : "s"}`}>
              {playlists.map((playlist) => (
                <MediaCard key={playlist.id} title={playlist.title} subtitle="Playlist" coverUrl={playlist.coverUrl} onPlay={() => router.push(`/playlists/${playlist.id}`)} />
              ))}
            </MediaCarousel>
          ))}

        {tab === "liked" &&
          (liked.loading ? (
            <p className="text-sm text-muted">Cargando…</p>
          ) : liked.items.length === 0 ? (
            <p className="text-sm text-muted">Todavía no marcaste ninguna canción como favorita.</p>
          ) : (
            <TrackList tracks={liked.items} />
          ))}

        {tab === "artists" &&
          (libraryLoading ? (
            <div className="flex gap-2">
              {[...Array(5)].map((_, i) => (
                <MediaCardSkeleton key={i} />
              ))}
            </div>
          ) : artists.length === 0 ? (
            <p className="text-sm text-muted">Todavía no sigues a ningún artista.</p>
          ) : (
            <MediaCarousel title={`${artists.length} artista${artists.length === 1 ? "" : "s"}`}>
              {artists.map((artist) => (
                <MediaCard
                  key={artist.id}
                  title={artist.name}
                  subtitle={`${artist.monthlyListeners.toLocaleString("es")} oyentes mensuales`}
                  coverUrl={artist.imageUrl}
                  onPlay={() => router.push(`/artists/${artist.id}`)}
                />
              ))}
            </MediaCarousel>
          ))}
      </div>
    </main>
  );
}
