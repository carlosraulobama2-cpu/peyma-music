"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useVirtualizer } from "@tanstack/react-virtual";
import { usePlayerStore } from "../store/usePlayerStore";
import { TrackContextMenu } from "./TrackContextMenu";
import { CreditsModal } from "./CreditsModal";
import { ReportTrackModal } from "./ReportTrackModal";
import { CoverImage } from "./CoverImage";
import { LikeButton } from "./LikeButton";
import type { CatalogTrack } from "../lib/catalog";

/**
 * Por debajo de este número, virtualizar es complejidad sin beneficio: el
 * navegador pinta 50 filas sin despeinarse y el DOM normal permite que la
 * lista crezca dentro del scroll de la página. Por encima, la lista pasa a
 * su propio contenedor con altura fija y sólo renderiza lo visible.
 */
const VIRTUALIZE_THRESHOLD = 60;
const ROW_HEIGHT = 56;
const VIRTUAL_VIEWPORT_HEIGHT = 560;

/**
 * Reproducciones abreviadas: 1.234 -> "1,2 mil", 2.500.000 -> "2,5 M".
 *
 * Con cifras grandes el número exacto no aporta nada y descuadra la
 * columna; por debajo de mil sí se muestra entero, porque para un artista
 * que empieza la diferencia entre 8 y 80 escuchas es toda la información.
 */
function formatPlayCount(plays: number): string {
  if (plays >= 1_000_000) return `${(plays / 1_000_000).toFixed(1).replace(".", ",").replace(",0", "")} M`;
  if (plays >= 1_000) return `${(plays / 1_000).toFixed(1).replace(".", ",").replace(",0", "")} mil`;
  return `${plays}`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface TrackListProps {
  tracks: CatalogTrack[];
  /** Muestra el número de posición (1, 2, 3…) en vez de la portada — para rankings tipo "Populares". */
  numbered?: boolean;
  onRemove?: (trackId: string) => void;
}

interface RowProps {
  track: CatalogTrack;
  index: number;
  numbered: boolean;
  isCurrent: boolean;
  onPlay: () => void;
  onRemove?: (trackId: string) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

function TrackRow({ track, index, numbered, isCurrent, onPlay, onRemove, onContextMenu }: RowProps) {
  return (
    <div
      onContextMenu={onContextMenu}
      // `contain: content` aísla el reflow de cada fila del resto de la lista.
      style={{ contain: "content" }}
      className="group grid h-14 grid-cols-[2rem_1fr_auto_auto_auto] items-center gap-4 rounded px-3 transition-all duration-300 ease-in-out hover:bg-white/10"
    >
      {numbered ? (
        <span className={`text-center text-sm ${isCurrent ? "text-brand" : "text-muted"}`}>{index + 1}</span>
      ) : (
        <CoverImage src={track.coverUrl} alt={track.title} size={32} rounded="rounded" glow={false} />
      )}

      {/* Título y artista van en elementos SEPARADOS, no en un único botón:
          el nombre del artista es un enlace a su perfil, y un enlace dentro
          de un botón es HTML inválido (el navegador decide cuál gana y no
          siempre igual). El título dispara la reproducción; el artista
          navega. */}
      <div className="min-w-0">
        <button onClick={onPlay} className="block w-full min-w-0 text-left">
          <span className={`block truncate text-sm font-semibold ${isCurrent ? "text-brand" : ""}`}>{track.title}</span>
        </button>
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
          <Link
            href={`/artists/${track.artist.id}`}
            className="truncate transition-colors hover:text-foreground hover:underline"
          >
            {track.artist.name}
          </Link>
          {track.artist.isVerified && (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="#3d91f4" className="shrink-0" aria-label="Artista verificado">
              <path d="M12 2l2.4 2.4 3.4-.6.6 3.4L21 9.6 18.4 12 21 14.4l-2.6 2.4-.6 3.4-3.4-.6L12 22l-2.4-2.4-3.4.6-.6-3.4L3 14.4 5.6 12 3 9.6l2.6-2.4.6-3.4 3.4.6L12 2Z" />
              <path d="m10.8 15.2-2.9-2.9 1.3-1.3 1.6 1.6 4-4 1.3 1.3-5.3 5.3Z" fill="#fff" />
            </svg>
          )}
          {/* Ritmo de la canción, cuando el catálogo lo tiene. */}
          {track.genre && <span className="hidden shrink-0 sm:inline">· {track.genre}</span>}
        </span>
      </div>

      {/* Reproducciones en columna propia y alineadas a la derecha, como en
          Spotify. Antes vivían dentro del subtítulo con `hidden md:inline`:
          competían por espacio con el nombre del artista y el ritmo, y por
          debajo de 768 px no se veían en absoluto.

          Se compara con undefined y no por valor falsy: una canción con 0
          debe enseñar el 0, que es un dato, en vez de desaparecer como si
          no se supiera. `tabular-nums` alinea las cifras entre filas. */}
      <span
        className="hidden w-20 shrink-0 text-right text-xs tabular-nums text-muted sm:block"
        title={track.playCount !== undefined ? `${track.playCount} reproducciones` : undefined}
      >
        {track.playCount !== undefined ? formatPlayCount(track.playCount) : ""}
      </span>

      <LikeButton trackId={track.id} />

      <span className="flex items-center gap-3">
        <span className="font-mono text-xs text-muted">{formatDuration(track.duration)}</span>
        {onRemove && (
          <button
            onClick={() => onRemove(track.id)}
            aria-label={`Quitar ${track.title}`}
            className="text-muted opacity-0 transition-opacity duration-300 group-hover:opacity-100 hover:text-danger"
          >
            ✕
          </button>
        )}
      </span>
    </div>
  );
}

export function TrackList({ tracks, numbered = false, onRemove }: TrackListProps) {
  const play = usePlayerStore((s) => s.play);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const [menu, setMenu] = useState<{ track: CatalogTrack; x: number; y: number } | null>(null);
  const [creditsTrack, setCreditsTrack] = useState<CatalogTrack | null>(null);
  const [reportTrack, setReportTrack] = useState<CatalogTrack | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const shouldVirtualize = tracks.length > VIRTUALIZE_THRESHOLD;

  // El React Compiler no puede memoizar lo que devuelve `useVirtualizer` y
  // por eso omite optimizar este componente. Es una limitación conocida de
  // la librería, no del código: el resto de la app sigue compilándose igual.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: tracks.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
    // Sin esto, el hook seguiría midiendo aunque la lista sea corta y no haya contenedor propio.
    enabled: shouldVirtualize,
  });

  const openMenu = (track: CatalogTrack) => (e: React.MouseEvent) => {
    e.preventDefault();
    setMenu({ track, x: e.clientX, y: e.clientY });
  };

  const overlays = (
    <>
      {menu && (
        <TrackContextMenu
          track={menu.track}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          onShowCredits={setCreditsTrack}
          onReport={setReportTrack}
        />
      )}
      {creditsTrack && <CreditsModal track={creditsTrack} onClose={() => setCreditsTrack(null)} />}
      {reportTrack && <ReportTrackModal track={reportTrack} onClose={() => setReportTrack(null)} />}
    </>
  );

  if (!shouldVirtualize) {
    return (
      <>
        <div className="flex flex-col">
          {tracks.map((track, index) => (
            <TrackRow
              key={track.id}
              track={track}
              index={index}
              numbered={numbered}
              isCurrent={currentTrack?.id === track.id}
              onPlay={() => play(track, tracks)}
              onRemove={onRemove}
              onContextMenu={openMenu(track)}
            />
          ))}
        </div>
        {overlays}
      </>
    );
  }

  return (
    <>
      <div ref={scrollRef} style={{ height: VIRTUAL_VIEWPORT_HEIGHT }} className="scrollbar-thin overflow-y-auto">
        {/* Alto total simulado: mantiene la barra de scroll proporcional aunque sólo existan las filas visibles. */}
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const track = tracks[virtualRow.index];
            if (!track) return null;
            return (
              <div
                key={track.id}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <TrackRow
                  track={track}
                  index={virtualRow.index}
                  numbered={numbered}
                  isCurrent={currentTrack?.id === track.id}
                  onPlay={() => play(track, tracks)}
                  onRemove={onRemove}
                  onContextMenu={openMenu(track)}
                />
              </div>
            );
          })}
        </div>
      </div>
      {overlays}
    </>
  );
}
