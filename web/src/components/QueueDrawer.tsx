"use client";

import { useState } from "react";
import { usePlayerStore } from "../store/usePlayerStore";
import { CoverImage } from "./CoverImage";
import type { CatalogTrack } from "../lib/catalog";

interface QueueDrawerProps {
  queue: CatalogTrack[];
  queueIndex: number;
  onClose: () => void;
}

/**
 * Cola de reproducción, dividida en "Sonando ahora" y "A continuación".
 *
 * Se puede reordenar arrastrando y también con los botones de subir/bajar.
 * Los dos caminos existen a propósito: arrastrar es lo natural con ratón,
 * pero no funciona con teclado ni con lector de pantalla, y dejar la única
 * forma de reordenar detrás del arrastre la haría inaccesible.
 */
export function QueueDrawer({ queue, queueIndex, onClose }: QueueDrawerProps) {
  const play = usePlayerStore((s) => s.play);
  const reorderQueue = usePlayerStore((s) => s.reorderQueue);
  const removeFromQueue = usePlayerStore((s) => s.removeFromQueue);

  /** Índice absoluto de la pista que se está arrastrando. */
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

  const nowPlaying = queue[queueIndex];
  // Se conserva el índice ABSOLUTO de cada pista: el store trabaja con
  // índices sobre la cola completa, y usar el de este sub-array movería la
  // canción equivocada.
  const upNext = queue.map((track, index) => ({ track, index })).filter(({ index }) => index > queueIndex);

  const handleDrop = (targetIndex: number) => {
    if (draggingIndex === null) return;
    reorderQueue(draggingIndex, targetIndex);
    setDraggingIndex(null);
  };

  return (
    <aside className="fixed bottom-[90px] right-0 top-0 z-[100] flex w-[340px] flex-col border-l border-white/10 bg-surface/95 backdrop-blur-xl">
      <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <h2 className="text-base font-bold">Cola</h2>
        <button onClick={onClose} aria-label="Cerrar cola" className="text-muted transition-colors hover:text-foreground">
          ✕
        </button>
      </header>

      <div className="scrollbar-thin flex-1 overflow-y-auto px-3 py-4">
        {nowPlaying && (
          <section className="mb-6">
            <h3 className="mb-2 px-2 text-xs font-bold uppercase tracking-wide text-muted">Sonando ahora</h3>
            <div className="flex items-center gap-3 rounded-md bg-white/5 px-2 py-2">
              <CoverImage src={nowPlaying.coverUrl} alt={nowPlaying.title} size={40} rounded="rounded" glow={false} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-brand">{nowPlaying.title}</p>
                <p className="truncate text-xs text-muted">{nowPlaying.artist.name}</p>
              </div>
            </div>
          </section>
        )}

        <section>
          <h3 className="mb-2 px-2 text-xs font-bold uppercase tracking-wide text-muted">A continuación</h3>
          {upNext.length === 0 ? (
            <p className="px-2 text-sm text-muted">No hay nada más en la cola.</p>
          ) : (
            <ul className="flex flex-col">
              {upNext.map(({ track, index }, position) => (
                <li
                  key={track.id}
                  draggable
                  onDragStart={() => setDraggingIndex(index)}
                  onDragEnd={() => setDraggingIndex(null)}
                  // `preventDefault` en dragOver es obligatorio: sin él el
                  // navegador no considera el elemento una zona de destino
                  // válida y nunca dispara el drop.
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => handleDrop(index)}
                  className={`group flex items-center gap-2 rounded-md transition-colors ${
                    draggingIndex === index ? "opacity-40" : "hover:bg-white/10"
                  }`}
                >
                  <span className="cursor-grab select-none px-1 text-muted active:cursor-grabbing" aria-hidden>
                    ⠿
                  </span>

                  <button
                    onClick={() => play(track, queue)}
                    className="flex min-w-0 flex-1 items-center gap-3 py-2 text-left"
                  >
                    <CoverImage src={track.coverUrl} alt={track.title} size={40} rounded="rounded" glow={false} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{track.title}</span>
                      <span className="block truncate text-xs text-muted">{track.artist.name}</span>
                    </span>
                  </button>

                  <span className="flex shrink-0 items-center gap-0.5 pr-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <button
                      onClick={() => reorderQueue(index, index - 1)}
                      disabled={position === 0}
                      aria-label={`Subir ${track.title} en la cola`}
                      className="px-1 text-xs text-muted transition-colors hover:text-foreground disabled:opacity-25"
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => reorderQueue(index, index + 1)}
                      disabled={position === upNext.length - 1}
                      aria-label={`Bajar ${track.title} en la cola`}
                      className="px-1 text-xs text-muted transition-colors hover:text-foreground disabled:opacity-25"
                    >
                      ▼
                    </button>
                    <button
                      onClick={() => removeFromQueue(index)}
                      aria-label={`Quitar ${track.title} de la cola`}
                      className="px-1 text-xs text-muted transition-colors hover:text-danger"
                    >
                      ✕
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </aside>
  );
}
