/**
 * Peyma Music API — Métricas de artista
 *
 * Dos métricas con semántica muy distinta, a propósito calculadas por
 * caminos distintos:
 *  - Seguidores: estado persistente (tabla `Follow`), un simple COUNT.
 *  - Oyentes mensuales: ventana rodante de 28 días sobre `StreamLog`, un
 *    COUNT(DISTINCT userId) — nunca un contador que alguien incrementa a mano.
 */
import { prisma } from '../prismaClient';

interface MonthlyListenersRow {
  artistId: string;
  count: bigint;
}

/** Cuántos días cubre el mini-gráfico de tendencia del Studio. */
const TREND_DAYS = 14;
/** Cuántas pistas lleva el ranking propio del artista. */
const TOP_TRACKS = 5;

/** Oyentes únicos de un artista en los últimos 28 días. */
export async function getMonthlyListeners(artistId: string): Promise<number> {
  const rows = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(DISTINCT "userId")::bigint AS count
    FROM "StreamLog"
    WHERE "artistId" = ${artistId}
      AND "playedAt" >= NOW() - INTERVAL '28 days'
  `;
  return Number(rows[0]?.count ?? 0n);
}

/** Igual que `getMonthlyListeners`, pero para varios artistas en una sola query (listados/paginación). */
export async function getMonthlyListenersBulk(artistIds: string[]): Promise<Map<string, number>> {
  if (artistIds.length === 0) return new Map();

  const rows = await prisma.$queryRaw<MonthlyListenersRow[]>`
    SELECT "artistId", COUNT(DISTINCT "userId")::bigint AS count
    FROM "StreamLog"
    WHERE "artistId" = ANY(${artistIds})
      AND "playedAt" >= NOW() - INTERVAL '28 days'
    GROUP BY "artistId"
  `;

  const result = new Map<string, number>();
  for (const id of artistIds) result.set(id, 0);
  for (const row of rows) result.set(row.artistId, Number(row.count));
  return result;
}

export interface ArtistTrackStat {
  trackId: string;
  title: string;
  coverUrl: string | null;
  duration: number;
  streams: number;
}

export interface ArtistStats {
  followers: number;
  monthlyListeners: number;
  totalStreams: number;
  /** Un número por día, del más antiguo al más reciente. Longitud fija. */
  streamsLast14Days: number[];
  topTracks: ArtistTrackStat[];
}

/**
 * Serie diaria de reproducciones.
 *
 * `generate_series` construye los 14 días y el LEFT JOIN cuelga de ahí las
 * reproducciones: sin eso, un día sin escuchas simplemente no vendría en el
 * resultado y el gráfico dibujaría 11 puntos creyendo que son 14, comprimiendo
 * el hueco en vez de mostrar el cero que de verdad hubo.
 */
async function getDailyStreams(artistId: string): Promise<number[]> {
  const rows = await prisma.$queryRaw<{ day: Date; count: bigint }[]>`
    SELECT d."day", COUNT(s."id")::bigint AS count
      FROM generate_series(
             CURRENT_DATE - (${TREND_DAYS - 1} * INTERVAL '1 day'),
             CURRENT_DATE,
             INTERVAL '1 day'
           ) AS d("day")
      LEFT JOIN "StreamLog" s
             ON s."artistId" = ${artistId}
            AND s."playedAt" >= d."day"
            AND s."playedAt" < d."day" + INTERVAL '1 day'
     GROUP BY d."day"
     ORDER BY d."day" ASC
  `;
  return rows.map((row) => Number(row.count));
}

export async function getArtistStats(artistId: string): Promise<ArtistStats> {
  const [followers, monthlyListeners, totalStreams, streamsLast14Days, topTrackRows] = await Promise.all([
    prisma.follow.count({ where: { artistId } }),
    getMonthlyListeners(artistId),
    prisma.streamLog.count({ where: { artistId } }),
    getDailyStreams(artistId),
    prisma.$queryRaw<{ trackId: string; title: string; coverUrl: string | null; duration: number; streams: bigint }[]>`
      SELECT t."id" AS "trackId", t."title", t."coverUrl", t."duration",
             COUNT(s."id")::bigint AS streams
        FROM "Track" t
        LEFT JOIN "StreamLog" s ON s."trackId" = t."id"
       WHERE t."artistId" = ${artistId}
       GROUP BY t."id", t."title", t."coverUrl", t."duration"
       ORDER BY streams DESC, t."createdAt" DESC
       LIMIT ${TOP_TRACKS}
    `,
  ]);

  return {
    followers,
    monthlyListeners,
    totalStreams,
    streamsLast14Days,
    topTracks: topTrackRows.map((row) => ({
      trackId: row.trackId,
      title: row.title,
      coverUrl: row.coverUrl,
      duration: row.duration,
      streams: Number(row.streams),
    })),
  };
}
