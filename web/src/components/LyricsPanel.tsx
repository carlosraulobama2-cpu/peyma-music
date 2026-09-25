"use client";

import { useEffect, useRef, useState } from "react";
import { usePlayerStore } from "../store/usePlayerStore";
import { fetchLyrics, activeLineIndex, type Lyrics } from "../lib/lyrics";

/**
 * Letra de lo que suena, dentro del panel de reproducción.
 *
 * Se pide por canción y no viaja en el detalle de la pista: ver el comentario
 * del endpoint `GET /tracks/:id/lyrics` en el backend.
 *
 * Cuando la letra está sincronizada se resalta la línea en curso y se puede
 * saltar pulsándola. Cuando sólo hay texto plano se pinta tal cual, que es el
 * caso de todo lo que se sube hoy desde la web.
 */
export function LyricsPanel({ trackId }: { trackId: string }) {
  /**
   * La letra se guarda JUNTO a la canción de la que es.
   *
   * Antes eran dos estados sueltos que el efecto reseteaba a mano al
   * cambiar de pista (`setEstado("cargando")` y `setLyrics(null)` en el
   * cuerpo del efecto). Eso es un render en cascada —lo marca el linter— y
   * además deja un hueco: entre que cambia `trackId` y corre el efecto, hay
   * un render pintando la letra de la canción ANTERIOR sobre la nueva.
   *
   * Guardando a qué pista pertenece lo cargado, "está cargando" deja de ser
   * algo que haya que escribir: es simplemente que lo que hay todavía no es
   * de esta canción.
   */
  const [cargado, setCargado] = useState<{
    trackId: string;
    lyrics: Lyrics | null;
    estado: "listo" | "error";
  } | null>(null);

  const progress = usePlayerStore((s) => s.progress);
  const seekTo = usePlayerStore((s) => s.seekTo);
  const activeRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    let vigente = true;

    fetchLyrics(trackId)
      .then((res) => {
        // Sin esta guarda, cambiar de canción rápido deja que la respuesta
        // lenta de la anterior pise a la de la que suena ahora.
        if (vigente) setCargado({ trackId, lyrics: res, estado: "listo" });
      })
      .catch(() => {
        if (vigente) setCargado({ trackId, lyrics: null, estado: "error" });
      });

    return () => {
      vigente = false;
    };
  }, [trackId]);

  const deEstaPista = cargado?.trackId === trackId ? cargado : null;
  const estado = deEstaPista?.estado ?? "cargando";
  const lyrics = deEstaPista?.lyrics ?? null;

  const synced = lyrics?.synced ?? null;
  const activa = synced ? activeLineIndex(synced, progress) : -1;

  // Mantener la línea en curso a la vista. `block: "center"` y no "nearest"
  // porque el panel es estrecho: con "nearest" la línea se queda pegada al
  // borde y no se ve lo que viene después.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activa]);

  if (estado === "cargando") {
    return <p className="text-xs text-muted">Cargando la letra…</p>;
  }

  if (estado === "error") {
    return <p className="text-xs text-muted">No se pudo cargar la letra.</p>;
  }

  if (!lyrics || (!lyrics.plainText && !synced?.length)) {
    return <p className="text-xs text-muted">Esta canción no tiene letra.</p>;
  }

  if (synced?.length) {
    return (
      <ul className="max-h-64 space-y-1 overflow-y-auto text-sm leading-relaxed">
        {synced.map((line, i) => (
          <li key={`${line.timeMs}-${i}`} ref={i === activa ? activeRef : null}>
            <button
              type="button"
              onClick={() => seekTo(line.timeMs / 1000)}
              className={`w-full text-left transition-colors hover:text-foreground ${
                i === activa ? "font-semibold text-foreground" : "text-muted"
              }`}
            >
              {line.text || "♪"}
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <p className="max-h-64 overflow-y-auto whitespace-pre-line text-sm leading-relaxed text-muted">
      {lyrics.plainText}
    </p>
  );
}
