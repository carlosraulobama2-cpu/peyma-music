"use client";

import Link from "next/link";
import { usePlayerStore } from "../store/usePlayerStore";
import { CoverImage } from "./CoverImage";
import { LikeButton } from "./LikeButton";

const numberFormat = new Intl.NumberFormat("es");

interface NowPlayingPanelProps {
  onClose: () => void;
}

/** Panel derecho con el detalle de lo que suena: portada grande, créditos y acciones. */
export function NowPlayingPanel({ onClose }: NowPlayingPanelProps) {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const queue = usePlayerStore((s) => s.queue);
  const queueIndex = usePlayerStore((s) => s.queueIndex);

  if (!currentTrack) return null;

  const upNext = queue[queueIndex + 1];

  return (
    <aside className="hidden w-[320px] flex-shrink-0 flex-col gap-5 overflow-y-auto border-l border-white/5 bg-surface p-4 xl:flex">
      <header className="flex items-center justify-between">
        <h2 className="truncate text-sm font-bold">{currentTrack.album.title}</h2>
        <button onClick={onClose} aria-label="Cerrar panel" className="text-muted transition-colors hover:text-foreground">
          ✕
        </button>
      </header>

      <CoverImage src={currentTrack.coverUrl} alt={currentTrack.title} size={288} rounded="rounded-lg" className="w-full" />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-xl font-bold">{currentTrack.title}</h3>
          <Link href={`/artists/${currentTrack.artist.id}`} className="truncate text-sm text-muted transition-colors hover:text-foreground hover:underline">
            {currentTrack.artist.name}
          </Link>
        </div>
        <LikeButton trackId={currentTrack.id} />
      </div>

      <section className="rounded-lg bg-surface-raised p-4">
        <h4 className="text-xs font-bold uppercase tracking-wide text-muted">Créditos</h4>
        <dl className="mt-3 flex flex-col gap-2 text-sm">
          <div>
            <dt className="text-muted">Artista</dt>
            <dd className="font-semibold">{currentTrack.artist.name}</dd>
          </div>
          <div>
            <dt className="text-muted">Álbum</dt>
            <dd className="font-semibold">{currentTrack.album.title}</dd>
          </div>
          {currentTrack.genre && (
            <div>
              <dt className="text-muted">Género</dt>
              <dd className="font-semibold">{currentTrack.genre}</dd>
            </div>
          )}
          <div>
            <dt className="text-muted">Duración</dt>
            <dd className="font-mono font-semibold">
              {Math.floor(currentTrack.duration / 60)}:{String(Math.floor(currentTrack.duration % 60)).padStart(2, "0")}
            </dd>
          </div>
        </dl>
      </section>

      {upNext && (
        <section className="rounded-lg bg-surface-raised p-4">
          <h4 className="text-xs font-bold uppercase tracking-wide text-muted">A continuación</h4>
          <div className="mt-3 flex items-center gap-3">
            <CoverImage src={upNext.coverUrl} alt={upNext.title} size={40} rounded="rounded" glow={false} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{upNext.title}</p>
              <p className="truncate text-xs text-muted">{upNext.artist.name}</p>
            </div>
          </div>
        </section>
      )}

      <p className="text-xs text-muted">
        {numberFormat.format(queue.length)} pista{queue.length === 1 ? "" : "s"} en la cola
      </p>
    </aside>
  );
}
