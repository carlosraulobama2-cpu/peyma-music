"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../../lib/AuthProvider";
import { usePlayerStore } from "../../../../store/usePlayerStore";
import { fetchPlaylist, removeTrackFromPlaylist, type PlaylistDetail } from "../../../../lib/playlists";
import { CoverImage } from "../../../../components/CoverImage";
import { TrackList } from "../../../../components/TrackList";

function formatTotalDuration(tracks: { duration: number }[]): string {
  const total = tracks.reduce((sum, t) => sum + t.duration, 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.round((total % 3600) / 60);
  return hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`;
}

export default function PlaylistPage({ params }: PageProps<"/playlists/[id]">) {
  const { id } = use(params);
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const play = usePlayerStore((s) => s.play);

  const [playlist, setPlaylist] = useState<PlaylistDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoading && !user) router.replace("/login");
  }, [isLoading, user, router]);

  const load = useCallback(() => {
    fetchPlaylist(id)
      .then(setPlaylist)
      .catch(() => setPlaylist(null))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRemove = async (trackId: string) => {
    if (!playlist) return;
    const previous = playlist.tracks;
    setPlaylist({ ...playlist, tracks: previous.filter((t) => t.id !== trackId) });
    try {
      await removeTrackFromPlaylist(playlist.id, trackId);
    } catch {
      setPlaylist((prev) => (prev ? { ...prev, tracks: previous } : prev));
    }
  };

  if (isLoading || !user || loading) {
    return (
      <main className="flex-1 flex flex-col">
        <div className="px-6 py-8 sm:px-10">
          <div className="h-48 w-full animate-pulse rounded-2xl bg-surface" />
        </div>
      </main>
    );
  }

  if (!playlist) {
    return (
      <main className="flex-1 flex flex-col">
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted">No encontramos esta playlist.</p>
        </div>
      </main>
    );
  }

  const isOwner = playlist.ownerId === user.id;

  return (
    <main className="flex-1 flex flex-col pb-32">

      <section className="relative overflow-hidden px-6 pb-8 pt-10 sm:px-10">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{ background: "radial-gradient(700px circle at 15% -20%, rgba(29,185,84,0.18), transparent 60%)" }}
        />
        <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-end">
          <CoverImage src={playlist.coverUrl} alt={playlist.title} size={192} rounded="rounded-md" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-muted">Playlist</p>
            <h1 className="mt-2 text-4xl font-extrabold tracking-tight sm:text-6xl">{playlist.title}</h1>
            {playlist.description && <p className="mt-3 text-sm text-muted">{playlist.description}</p>}
            <p className="mt-4 text-sm text-muted">
              {playlist.ownerName} · {playlist.tracks.length} canci{playlist.tracks.length === 1 ? "ón" : "ones"}
              {playlist.tracks.length > 0 && ` · ${formatTotalDuration(playlist.tracks)}`}
            </p>
          </div>
        </div>

        <div className="mt-8">
          <button
            onClick={() => playlist.tracks.length > 0 && play(playlist.tracks[0], playlist.tracks)}
            disabled={playlist.tracks.length === 0}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-brand text-xl text-black shadow-2xl transition-all duration-300 ease-in-out hover:scale-105 hover:bg-brand-hover disabled:opacity-40 disabled:hover:scale-100"
            aria-label="Reproducir"
          >
            ▶
          </button>
        </div>
      </section>

      <div className="px-6 pb-8 sm:px-10">
        {playlist.tracks.length === 0 ? (
          <p className="text-sm text-muted">Esta playlist todavía no tiene canciones.</p>
        ) : (
          <TrackList tracks={playlist.tracks} numbered onRemove={isOwner ? handleRemove : undefined} />
        )}
      </div>
    </main>
  );
}
