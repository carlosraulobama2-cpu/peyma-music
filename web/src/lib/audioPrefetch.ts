"use client";

/**
 * Peyma Music — Búfer de audio en RAM
 *
 * Mientras suena una canción, descarga en memoria el principio de la
 * siguiente. Cuando el usuario pulsa "siguiente", el audio ya está en RAM y
 * empieza sin la pausa de la primera petición de red.
 *
 * Decisiones que definen este módulo:
 *
 * - Sólo se precargan los primeros ~2 MB, no la canción entera. Es de sobra
 *   para cubrir el arranque mientras el resto llega por streaming normal, y
 *   evita bajar 8 MB de una pista que el usuario quizá nunca escuche.
 *
 * - Hay un TECHO DE MEMORIA y se purga lo más viejo al superarlo. Sin
 *   límite, una sesión larga saltando canciones acumularía decenas de MB de
 *   blobs en un teléfono de gama media hasta que el navegador mate la
 *   pestaña. Es el fallo que hace que estas cachés terminen quitándose.
 *
 * - Cada entrada mantiene su `objectURL` y se revoca AL EXPULSARLA. Un
 *   `URL.createObjectURL` sin su `revokeObjectURL` retiene el blob entero
 *   aunque se borre la referencia: el recolector de basura no puede
 *   liberarlo, y esa es la fuga clásica de este patrón.
 */

/** Cuánto se baja por adelantado de cada pista. */
const PREFETCH_BYTES = 2 * 1024 * 1024;
/** Techo total del búfer. Por encima se expulsa lo menos usado. */
const MAX_CACHE_BYTES = 12 * 1024 * 1024;

interface CacheEntry {
  trackId: string;
  objectUrl: string;
  bytes: number;
  /** Para expulsar por uso menos reciente. */
  lastUsed: number;
}

const cache = new Map<string, CacheEntry>();
/** Peticiones en curso, para no bajar dos veces la misma pista. */
const inFlight = new Map<string, Promise<void>>();

function currentBytes(): number {
  let total = 0;
  for (const entry of cache.values()) total += entry.bytes;
  return total;
}

/**
 * Libera una entrada.
 *
 * `revokeObjectURL` es obligatorio: sin él el blob sigue vivo aunque el
 * Map ya no lo referencie.
 */
function evict(trackId: string): void {
  const entry = cache.get(trackId);
  if (!entry) return;
  URL.revokeObjectURL(entry.objectUrl);
  cache.delete(trackId);
}

/** Expulsa las entradas menos usadas hasta volver por debajo del techo. */
function enforceLimit(protectedIds: string[]): void {
  if (currentBytes() <= MAX_CACHE_BYTES) return;

  const candidates = [...cache.values()]
    .filter((entry) => !protectedIds.includes(entry.trackId))
    .sort((a, b) => a.lastUsed - b.lastUsed);

  for (const entry of candidates) {
    if (currentBytes() <= MAX_CACHE_BYTES) break;
    evict(entry.trackId);
  }
}

/**
 * Descarga el principio de una pista a memoria.
 *
 * No lanza nunca: una precarga fallida sólo significa que esa canción
 * empezará como siempre, por red. Hacer ruido por esto sería alarmar al
 * usuario por algo que no le afecta.
 */
export async function prefetchTrack(trackId: string, protectedIds: string[] = []): Promise<void> {
  if (cache.has(trackId) || inFlight.has(trackId)) return;

  const url = `${process.env.NEXT_PUBLIC_API_URL ?? ""}/tracks/${trackId}/stream`;

  const task = (async () => {
    try {
      // `Range` pide sólo el principio. El proxy de streaming ya soporta
      // peticiones parciales, así que el servidor no manda de más.
      const response = await fetch(url, { headers: { Range: `bytes=0-${PREFETCH_BYTES - 1}` } });
      if (!response.ok && response.status !== 206) return;

      const blob = await response.blob();
      // La pista pudo expulsarse o empezar a sonar mientras se descargaba.
      if (cache.has(trackId)) return;

      cache.set(trackId, {
        trackId,
        objectUrl: URL.createObjectURL(blob),
        bytes: blob.size,
        lastUsed: Date.now(),
      });
      enforceLimit([trackId, ...protectedIds]);
    } catch {
      // Sin red o petición cancelada: se ignora.
    } finally {
      inFlight.delete(trackId);
    }
  })();

  inFlight.set(trackId, task);
  await task;
}

/**
 * URL local de una pista precargada, si está en memoria.
 *
 * Devuelve `null` cuando no está, y quien llama usa la URL de red normal.
 * Nunca se fuerza a esperar a la precarga: eso convertiría una optimización
 * en una espera añadida.
 */
export function getPrefetchedUrl(trackId: string): string | null {
  const entry = cache.get(trackId);
  if (!entry) return null;
  entry.lastUsed = Date.now();
  return entry.objectUrl;
}

/**
 * Purga todo lo que no esté en la ventana actual de reproducción.
 *
 * Se llama al cambiar de canción: lo ya escuchado no se va a volver a
 * necesitar y sólo ocupa RAM.
 */
export function purgeExcept(keepTrackIds: string[]): void {
  for (const trackId of [...cache.keys()]) {
    if (!keepTrackIds.includes(trackId)) evict(trackId);
  }
}

/** Estado del búfer — para diagnóstico. */
export function bufferStats(): { entries: number; bytes: number; limitBytes: number } {
  return { entries: cache.size, bytes: currentBytes(), limitBytes: MAX_CACHE_BYTES };
}
