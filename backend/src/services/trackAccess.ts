/**
 * Peyma Music API — Caché de autorización de reproducción
 *
 * Cada pulsación de "play" hacía una consulta a Postgres para resolver lo
 * mismo: dónde está el audio y si esta pista se puede servir. Medido contra
 * Neon, esa consulta costaba ~240 ms de los ~430 ms totales hasta el primer
 * byte — más que la descarga desde el CDN. No es una consulta lenta: es que
 * la base está en otra región y se paga el viaje de ida y vuelta.
 *
 * Son datos que casi nunca cambian (la URL del audio, si está aprobada, si
 * está bloqueada), así que se guardan en memoria del proceso.
 *
 * El riesgo de cachear esto es real y concreto: si se retira una canción por
 * plagio, una copia vieja la seguiría sirviendo. Por eso hay DOS defensas, no
 * una:
 *
 *  1. Un TTL corto (30 s), que acota el daño aunque nadie invalide nada.
 *  2. Invalidación explícita desde el panel al bloquear, desbloquear,
 *     aprobar o borrar. Es la que hace que una retirada sea inmediata.
 *
 * La caché es por proceso, no compartida. Con varias instancias cada una
 * tiene la suya, así que el TTL es el que garantiza que todas convergen; la
 * invalidación sólo acelera a la que atendió la petición del panel. Para
 * hacerla inmediata en todas haría falta Redis o un canal LISTEN/NOTIFY de
 * Postgres, que no compensa para una ventana de 30 segundos.
 */
import { prisma } from '../prismaClient';

const TTL_MS = 30_000;

export interface TrackAccess {
  audioUrl: string;
  status: string;
  isBlocked: boolean;
  blockedReason: string | null;
  blockedByName: string | null;
  blockedAt: Date | null;
  artistIsBlocked: boolean;
  artistOwnerId: string | null;
}

interface Entry {
  value: TrackAccess | null;
  at: number;
}

const cache = new Map<string, Entry>();

/**
 * Evita que la caché crezca sin límite en un catálogo grande.
 *
 * Con un límite y borrado del más antiguo basta: no hay que medir aciertos
 * ni implementar un LRU exacto para unos pocos miles de entradas de tres
 * campos. Lo importante es que la memoria esté acotada.
 */
const MAX_ENTRIES = 5_000;

function remember(trackId: string, value: TrackAccess | null): void {
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(trackId, { value, at: Date.now() });
}

/**
 * Resuelve el acceso de una pista. `null` significa "no existe".
 *
 * El `null` también se cachea, a propósito: si no, pedir repetidamente una
 * pista inexistente golpearía la base cada vez, que es justo lo que haría
 * alguien probando identificadores al azar.
 */
export async function getTrackAccess(trackId: string): Promise<TrackAccess | null> {
  const hit = cache.get(trackId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const track = await prisma.track.findUnique({
    where: { id: trackId },
    select: {
      audioUrl: true,
      status: true,
      isBlocked: true,
      blockedReason: true,
      blockedByName: true,
      blockedAt: true,
      artist: { select: { isBlocked: true, ownerId: true } },
    },
  });

  const value: TrackAccess | null = track
    ? {
        audioUrl: track.audioUrl,
        status: track.status,
        isBlocked: track.isBlocked,
        blockedReason: track.blockedReason,
        blockedByName: track.blockedByName,
        blockedAt: track.blockedAt,
        artistIsBlocked: track.artist.isBlocked,
        artistOwnerId: track.artist.ownerId,
      }
    : null;

  remember(trackId, value);
  return value;
}

/** Olvida una pista. La llaman las rutas del panel que cambian su estado. */
export function invalidateTrackAccess(trackId: string): void {
  cache.delete(trackId);
}

/**
 * Olvida TODO.
 *
 * Hace falta cuando cambia algo que afecta a muchas pistas a la vez y no se
 * tiene la lista: bloquear o borrar un artista entero, por ejemplo. Vaciar
 * la caché cuesta una consulta extra por pista la primera vez que se pidan,
 * que es un precio trivial frente a seguir sirviendo audio bloqueado.
 */
export function invalidateAllTrackAccess(): void {
  cache.clear();
}
