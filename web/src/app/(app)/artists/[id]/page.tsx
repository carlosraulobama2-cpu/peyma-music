"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../../lib/AuthProvider";
import { usePlayerStore } from "../../../../store/usePlayerStore";
import { fetchArtist, toggleFollow, type ArtistProfile } from "../../../../lib/artists";
import { CoverImage } from "../../../../components/CoverImage";
import { TrackList } from "../../../../components/TrackList";
import { Discography } from "../../../../components/Discography";

const numberFormat = new Intl.NumberFormat("es");

export default function ArtistPage({ params }: PageProps<"/artists/[id]">) {
  const { id } = use(params);
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const play = usePlayerStore((s) => s.play);

  const [artist, setArtist] = useState<ArtistProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [followPending, setFollowPending] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) router.replace("/login");
  }, [isLoading, user, router]);

  const load = useCallback(() => {
    fetchArtist(id)
      .then(setArtist)
      .catch(() => setArtist(null))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleFollow = async () => {
    if (!artist || followPending) return;
    const optimistic = !artist.isFollowing;
    setArtist({ ...artist, isFollowing: optimistic, followers: artist.followers + (optimistic ? 1 : -1) });
    setFollowPending(true);
    try {
      const { isFollowing } = await toggleFollow(artist.id);
      setArtist((prev) => (prev ? { ...prev, isFollowing } : prev));
    } catch {
      setArtist((prev) =>
        prev ? { ...prev, isFollowing: !optimistic, followers: prev.followers + (optimistic ? -1 : 1) } : prev,
      );
    } finally {
      setFollowPending(false);
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

  if (!artist) {
    return (
      <main className="flex-1 flex flex-col">
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted">No encontramos este artista.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col pb-32">

      <section className="relative overflow-hidden px-6 pb-8 pt-10 sm:px-10">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{ background: "radial-gradient(700px circle at 15% -20%, rgba(29,185,84,0.22), transparent 60%)" }}
        />
        <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-end">
          <CoverImage src={artist.imageUrl} alt={artist.name} size={192} rounded="rounded-full" />
          <div className="min-w-0">
            {/* El check sólo aparece si un administrador lo otorgó de verdad
                (Artist.isVerified). Antes estaba fijo en el código y lo
                mostraban TODOS los artistas, lo que lo dejaba sin significado. */}
            {artist.isVerified && (
              <p className="flex items-center gap-2 text-sm font-semibold text-muted">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="#3d91f4" aria-label="Artista verificado">
                  <path d="M12 2l2.4 2.4 3.4-.6.6 3.4L21 9.6 18.4 12 21 14.4l-2.6 2.4-.6 3.4-3.4-.6L12 22l-2.4-2.4-3.4.6-.6-3.4L3 14.4 5.6 12 3 9.6l2.6-2.4.6-3.4 3.4.6L12 2Z" />
                  <path d="m10.8 15.2-2.9-2.9 1.3-1.3 1.6 1.6 4-4 1.3 1.3-5.3 5.3Z" fill="#fff" />
                </svg>
                Artista verificado
              </p>
            )}
            <h1 className="mt-2 text-5xl font-extrabold tracking-tight sm:text-7xl">{artist.name}</h1>
            <p className="mt-4 text-sm text-muted">
              {numberFormat.format(artist.monthlyListeners)} oyentes mensuales ·{" "}
              {numberFormat.format(artist.followers)} seguidor{artist.followers === 1 ? "" : "es"}
            </p>
          </div>
        </div>

        <div className="mt-8 flex items-center gap-4">
          <button
            onClick={() => artist.popularTracks.length > 0 && play(artist.popularTracks[0], artist.popularTracks)}
            disabled={artist.popularTracks.length === 0}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-brand text-xl text-black shadow-2xl transition-all duration-300 ease-in-out hover:scale-105 hover:bg-brand-hover disabled:opacity-40 disabled:hover:scale-100"
            aria-label="Reproducir"
          >
            ▶
          </button>
          <button
            onClick={handleFollow}
            disabled={followPending}
            className={`rounded-full border px-6 py-2 text-sm font-bold transition-all duration-300 ease-in-out disabled:opacity-50 ${
              artist.isFollowing ? "border-white text-foreground" : "border-white/30 text-foreground hover:border-white"
            }`}
          >
            {artist.isFollowing ? "Siguiendo" : "Seguir"}
          </button>
        </div>
      </section>

      <div className="flex flex-col gap-10 px-6 pb-8 sm:px-10">
        {artist.popularTracks.length > 0 && (
          <section>
            <h2 className="mb-4 text-xl font-bold sm:text-2xl">Populares</h2>
            <TrackList tracks={artist.popularTracks.slice(0, 10)} numbered />
          </section>
        )}

        <Discography
          albums={artist.albums}
          onPlayAlbum={(album) => {
            const track = artist.popularTracks.find((t) => t.album.id === album.id);
            if (track) play(track, artist.popularTracks);
          }}
        />

        {artist.bio && (
          <section className="rounded-2xl border border-white/10 bg-surface p-8">
            <h2 className="text-xl font-bold">Sobre {artist.name}</h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">{artist.bio}</p>
            {artist.genres.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-2">
                {artist.genres.map((genre) => (
                  <span key={genre} className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">
                    {genre}
                  </span>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
