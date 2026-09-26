/**
 * Peyma Music API — Ranking de artistas ("quién va en las primeras filas")
 *
 * Un solo criterio para toda la plataforma: antes cada sitio que mostraba
 * "artistas populares" (la fila de la portada, la sección editorial
 * TOP_ARTISTS) ordenaba sólo por oyentes distintos en la ventana — un
 * artista con pocos oyentes pero muy fieles (muchos seguidores, muchas
 * reproducciones repetidas) nunca aparecía, aunque en cualquier lectura
 * razonable de "artista popular" debería.
 *
 * La puntuación combina tres señales normalizadas por PERCENT_RANK (0–1
 * dentro del conjunto, no el valor crudo — así un artista con 40 oyentes no
 * queda invisible sólo porque otro tenga 4000):
 *
 *   - Oyentes distintos en la ventana (peso 0.5): la señal más parecida a
 *     "oyentes mensuales" de Spotify, la que mejor refleja actividad AHORA.
 *   - Reproducciones en la ventana (peso 0.3): volumen de escucha, pesa
 *     menos que oyentes distintos porque una sola persona en bucle no debe
 *     poder inflar el ranking.
 *   - Seguidores totales, histórico (peso 0.2): compromiso a largo plazo,
 *     pero pesa menos porque no cambia con lo que pasa esta semana y se
 *     puede acumular sin que el artista siga publicando.
 *
 * Sólo entran artistas con al menos `MIN_LISTENERS_TO_FEATURE` oyentes
 * distintos en la ventana (ver editorial.ts) — sin ese piso, un artista
 * nuevo con un seguidor y cero reproducciones reales podría colarse por
 * puro peso de seguidores.
 */
import { prisma } from '../prismaClient';

export interface RankedArtist {
  artistId: string;
  listeners: number;
  streams: number;
  followers: number;
  score: number;
}

const LISTENERS_WEIGHT = 0.5;
const STREAMS_WEIGHT = 0.3;
const FOLLOWERS_WEIGHT = 0.2;

/**
 * Ranking compuesto de artistas activos en la ventana, con `minListeners`
 * de piso. Es la ÚNICA función que debería decidir "quién va primero" en
 * cualquier fila de artistas populares — así una mejora al algoritmo se
 * nota en toda la plataforma a la vez, no sólo donde alguien se acuerde de
 * aplicarla.
 */
export async function getRankedArtists(windowStart: Date, limit: number, minListeners: number): Promise<RankedArtist[]> {
  const rows = await prisma.$queryRaw<
    { artistId: string; listeners: bigint; streams: bigint; followers: bigint; score: number }[]
  >`
    WITH activity AS (
      SELECT a."id" AS "artistId",
             COUNT(DISTINCT s."userId") AS listeners,
             COUNT(s."id") AS streams
        FROM "Artist" a
        LEFT JOIN "StreamLog" s ON s."artistId" = a."id" AND s."playedAt" >= ${windowStart}
       WHERE a."isBlocked" = false
       GROUP BY a."id"
    ),
    followers AS (
      SELECT "artistId", COUNT(*) AS total
        FROM "Follow"
       GROUP BY "artistId"
    )
    SELECT act."artistId",
           act.listeners,
           act.streams,
           COALESCE(f.total, 0) AS followers,
           (
             PERCENT_RANK() OVER (ORDER BY act.listeners)        * ${LISTENERS_WEIGHT} +
             PERCENT_RANK() OVER (ORDER BY act.streams)          * ${STREAMS_WEIGHT} +
             PERCENT_RANK() OVER (ORDER BY COALESCE(f.total, 0)) * ${FOLLOWERS_WEIGHT}
           ) AS score
      FROM activity act
      LEFT JOIN followers f ON f."artistId" = act."artistId"
     WHERE act.listeners >= ${minListeners}
     ORDER BY score DESC
     LIMIT ${limit}
  `;

  return rows.map((row) => ({
    artistId: row.artistId,
    listeners: Number(row.listeners),
    streams: Number(row.streams),
    followers: Number(row.followers),
    score: row.score,
  }));
}

export interface ArtistGrowth {
  artistId: string;
  name: string;
  imageUrl: string;
  isVerified: boolean;
  currentListeners: number;
  previousListeners: number;
  /** Nulo cuando no tenía NINGÚN oyente en el período anterior — no hay "porcentaje" que calcular desde cero, es un artista que recién despegó. */
  growthPct: number | null;
}

/**
 * Crecimiento período a período: compara los oyentes distintos de los
 * últimos `days` contra los `days` anteriores a esos.
 *
 * Sólo entran artistas con `minListeners` oyentes en el período ACTUAL — sin
 * ese piso, pasar de 1 oyente a 2 se leería como "100% de crecimiento" y
 * dominaría el ranking sin significar nada real.
 */
export async function getArtistGrowth(days: number, limit: number, minListeners: number): Promise<ArtistGrowth[]> {
  const now = new Date();
  const currentStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const previousStart = new Date(now.getTime() - 2 * days * 24 * 60 * 60 * 1000);

  const rows = await prisma.$queryRaw<
    { artistId: string; name: string; imageUrl: string; isVerified: boolean; current: bigint; previous: bigint }[]
  >`
    WITH current_period AS (
      SELECT "artistId", COUNT(DISTINCT "userId") AS listeners
        FROM "StreamLog"
       WHERE "playedAt" >= ${currentStart}
       GROUP BY "artistId"
    ),
    previous_period AS (
      SELECT "artistId", COUNT(DISTINCT "userId") AS listeners
        FROM "StreamLog"
       WHERE "playedAt" >= ${previousStart} AND "playedAt" < ${currentStart}
       GROUP BY "artistId"
    )
    SELECT a."id" AS "artistId",
           a."name",
           a."imageUrl",
           a."isVerified",
           cp.listeners            AS current,
           COALESCE(pp.listeners, 0) AS previous
      FROM current_period cp
      JOIN "Artist" a ON a."id" = cp."artistId"
      LEFT JOIN previous_period pp ON pp."artistId" = cp."artistId"
     WHERE a."isBlocked" = false
       AND cp.listeners >= ${minListeners}
     ORDER BY (CASE WHEN COALESCE(pp.listeners, 0) = 0 THEN 1 ELSE 0 END) DESC,
              (cp.listeners - COALESCE(pp.listeners, 0))::float / GREATEST(COALESCE(pp.listeners, 0), 1) DESC
     LIMIT ${limit}
  `;

  return rows.map((row) => {
    const current = Number(row.current);
    const previous = Number(row.previous);
    return {
      artistId: row.artistId,
      name: row.name,
      imageUrl: row.imageUrl,
      isVerified: row.isVerified,
      currentListeners: current,
      previousListeners: previous,
      growthPct: previous === 0 ? null : Math.round(((current - previous) / previous) * 1000) / 10,
    };
  });
}

export interface InactiveArtist {
  artistId: string;
  name: string;
  imageUrl: string;
  isVerified: boolean;
  trackCount: number;
  lastUploadAt: Date;
}

/**
 * Artistas con catálogo pero sin subir nada en `months` meses.
 *
 * Un artista sin NINGUNA pista no cuenta como "inactivo" aquí — nunca llegó
 * a publicar, que es un problema distinto (onboarding, no abandono) y no
 * tiene una "última subida" contra la que medir el silencio.
 */
export async function getInactiveArtists(months: number, limit: number): Promise<InactiveArtist[]> {
  const cutoff = new Date(Date.now() - months * 30 * 24 * 60 * 60 * 1000);

  const byArtist = await prisma.track.groupBy({
    by: ['artistId'],
    _max: { createdAt: true },
    _count: { _all: true },
  });

  const staleIds = byArtist
    .filter((row) => row._max.createdAt !== null && row._max.createdAt < cutoff)
    .sort((a, b) => a._max.createdAt!.getTime() - b._max.createdAt!.getTime())
    .slice(0, limit);

  const artists = await prisma.artist.findMany({
    where: { id: { in: staleIds.map((row) => row.artistId) }, isBlocked: false },
    select: { id: true, name: true, imageUrl: true, isVerified: true },
  });
  const byId = new Map(artists.map((a) => [a.id, a]));

  return staleIds
    .map((row) => {
      const artist = byId.get(row.artistId);
      if (!artist) return null;
      return {
        artistId: artist.id,
        name: artist.name,
        imageUrl: artist.imageUrl,
        isVerified: artist.isVerified,
        trackCount: row._count._all,
        lastUploadAt: row._max.createdAt!,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
}
