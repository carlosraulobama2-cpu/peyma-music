import { http } from "./httpClient";

/** Una línea de letra sincronizada, tal y como la guarda el modelo `Lyrics`. */
export interface SyncedLine {
  timeMs: number;
  text: string;
}

export interface Lyrics {
  plainText: string | null;
  synced: SyncedLine[] | null;
  language: string;
  updatedAt: string;
}

/**
 * Letra de una canción, o `null` si no tiene.
 *
 * El backend distingue "no hay letra" (200 con `lyrics: null`) de "no existe
 * la canción" (404) a propósito, así que aquí sólo hay que dejar pasar el
 * null: no es un caso de error.
 */
export async function fetchLyrics(trackId: string): Promise<Lyrics | null> {
  const res = await http.get<{ lyrics: Lyrics | null }>(`/tracks/${trackId}/lyrics`);
  return res.lyrics;
}

/**
 * Índice de la línea que suena en el segundo `seconds`, o -1 antes de la
 * primera.
 *
 * Búsqueda binaria y no un `findIndex`: esto se llama en cada `timeupdate`,
 * que el navegador dispara unas cuatro veces por segundo, y una letra larga
 * pasa de las 100 líneas. Recorrerlas enteras cuatro veces por segundo es
 * trabajo tirado cuando la lista ya está ordenada por tiempo.
 */
export function activeLineIndex(lines: SyncedLine[], seconds: number): number {
  const ms = seconds * 1000;
  let lo = 0;
  let hi = lines.length - 1;
  let found = -1;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].timeMs <= ms) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return found;
}
