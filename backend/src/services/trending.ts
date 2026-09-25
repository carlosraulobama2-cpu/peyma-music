/**
 * Peyma Music API — Ranking de tendencias
 *
 * Real, no simulado: cuenta reproducciones de `StreamLog` en una ventana de
 * 7 días y compara contra la ventana anterior para calcular la posición
 * previa (sube/baja/nuevo). Sólo considera tracks `APPROVED` — un track
 * pendiente de moderación o rechazado nunca debería aparecer en un ranking
 * público, aunque tenga reproducciones (p. ej. las que hizo el propio
 * creador antes de que un admin lo revisara).
 *
 * Exige además un mínimo de OYENTES DISTINTOS (no reproducciones) en la
 * ventana actual. Sin este piso, una canción recién subida entraba a
 * tendencias con una sola reproducción — la del propio artista probándola
 * — y ni siquiera hacía falta que la escuchara una segunda persona.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '../prismaClient';

const TRENDING_LIMIT_DEFAULT = 20;
const WINDOW_DAYS = 7;
/** Bajo este número de oyentes distintos en la ventana, una pista no es "tendencia" — es ruido. */
const MIN_LISTENERS_TO_CHART = 5;

const TRACK_WITH_DETAILS = {
  include: {
    artist: { select: { id: true, name: true, imageUrl: true, isVerified: true } },
    album: { select: { id: true, title: true, coverUrl: true } },
  },
} satisfies Prisma.TrackDefaultArgs;

export type TrendingTrack = Prisma.TrackGetPayload<typeof TRACK_WITH_DETAILS>;

export interface TrendingEntry {
  track: TrendingTrack;
  rank: number;
  previousRank: number;
  streams: number;
}

interface CurrentCountRow {
  trackId: string;
  streams: bigint;
}

export async function getTrendingTracks(limit = TRENDING_LIMIT_DEFAULT): Promise<TrendingEntry[]> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const previousWindowStart = new Date(now.getTime() - 2 * WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [currentCounts, previousCounts] = await Promise.all([
    // SQL crudo y no `groupBy`: Prisma no puede expresar
    // `COUNT(DISTINCT userId)` ni un `HAVING` sobre eso, y las dos cosas
    // hacen falta para el piso de oyentes distintos.
    prisma.$queryRaw<CurrentCountRow[]>`
      SELECT s."trackId", COUNT(*) AS streams
        FROM "StreamLog" s
        JOIN "Track" t ON t."id" = s."trackId"
        JOIN "Artist" ar ON ar."id" = t."artistId"
       WHERE s."playedAt" >= ${windowStart}
         AND t."status" = 'APPROVED'
         AND ar."isBlocked" = false
       GROUP BY s."trackId"
      HAVING COUNT(DISTINCT s."userId") >= ${MIN_LISTENERS_TO_CHART}
       ORDER BY streams DESC
       LIMIT ${limit}
    `,
    prisma.streamLog.groupBy({
      by: ['trackId'],
      where: { playedAt: { gte: previousWindowStart, lt: windowStart }, track: { status: 'APPROVED', artist: { isBlocked: false } } },
      _count: { trackId: true },
      orderBy: { _count: { trackId: 'desc' } },
    }),
  ]);

  if (currentCounts.length === 0) return [];

  const previousRankByTrack = new Map(previousCounts.map((c, i) => [c.trackId, i + 1]));
  // Un track sin historial en la ventana anterior "entra" al chart en la
  // última posición posible de esa ventana + 1 — se ve como una subida
  // fuerte (nuevo en el top), no como un dato faltante.
  const NEW_ENTRY_PREVIOUS_RANK = previousCounts.length + 1;

  const tracks = await prisma.track.findMany({
    where: { id: { in: currentCounts.map((c) => c.trackId) } },
    ...TRACK_WITH_DETAILS,
  });
  const trackById = new Map(tracks.map((t) => [t.id, t]));

  return currentCounts
    .map((c, i) => {
      const track = trackById.get(c.trackId);
      if (!track) return null; // se borró entre la consulta y este fetch — caso raro, se ignora en vez de romper el ranking
      return { track, rank: i + 1, previousRank: previousRankByTrack.get(c.trackId) ?? NEW_ENTRY_PREVIOUS_RANK, streams: Number(c.streams) };
    })
    .filter((entry): entry is TrendingEntry => entry !== null);
}
