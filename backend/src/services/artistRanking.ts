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
