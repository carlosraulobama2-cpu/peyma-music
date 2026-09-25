/**
 * Peyma Music API — Estadísticas de audiencia
 *
 * Responde las preguntas del panel: quién escucha más horas, qué artista
 * acumula más tiempo, cuál es la canción número 1 ahora mismo.
 *
 * Sobre "horas escuchadas": `StreamLog.secondsPlayed` guarda el tiempo real
 * desde que existe la columna, pero los eventos anteriores lo tienen nulo.
 * Para esos se estima con la duración completa de la pista, que asume que
 * nadie saltó nunca una canción y por tanto SIEMPRE infla la cifra. Las
 * consultas devuelven `estimatedShare` para que la interfaz pueda decir
 * cuánto de ese número es medición y cuánto estimación, en vez de presentar
 * las dos cosas como si fueran lo mismo.
 */
import { prisma } from '../prismaClient';

/** Ventana estándar de la plataforma. */
export const ROLLING_WINDOW_DAYS = 28;

export function windowStart(days = ROLLING_WINDOW_DAYS): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/**
 * Expresión SQL de los segundos de una reproducción.
 *
 * `COALESCE(s."secondsPlayed", t."duration")` — el valor medido si está, y
 * si no la duración de la pista.
 */
const SECONDS_EXPR = 'COALESCE(s."secondsPlayed", t."duration")';

export interface TopListener {
  userId: string;
  displayName: string;
  email: string;
  streams: number;
  seconds: number;
  /** 0–1: qué proporción de los segundos vino estimada y no medida. */
  estimatedShare: number;
  lastPlayedAt: Date;
}

/** Quién escucha más (y quién menos) en la ventana. */
export async function getTopListeners(limit = 20, order: 'desc' | 'asc' = 'desc'): Promise<TopListener[]> {
  const rows = await prisma.$queryRawUnsafe<
    {
      userId: string;
      displayName: string;
      email: string;
      streams: bigint;
      seconds: bigint;
      estimated: bigint;
      lastPlayedAt: Date;
    }[]
  >(
    `
    SELECT s."userId",
           u."displayName",
           u."email",
           COUNT(*)                                        AS streams,
           SUM(${SECONDS_EXPR})::bigint                     AS seconds,
           COUNT(*) FILTER (WHERE s."secondsPlayed" IS NULL) AS estimated,
           MAX(s."playedAt")                                AS "lastPlayedAt"
      FROM "StreamLog" s
      JOIN "Track" t ON t."id" = s."trackId"
      JOIN "User"  u ON u."id" = s."userId"
     WHERE s."playedAt" >= $1
     GROUP BY s."userId", u."displayName", u."email"
     ORDER BY seconds ${order === 'asc' ? 'ASC' : 'DESC'}
     LIMIT $2
    `,
    windowStart(),
    limit,
  );

  return rows.map((row) => {
    const streams = Number(row.streams);
    return {
      userId: row.userId,
      displayName: row.displayName,
      email: row.email,
      streams,
      seconds: Number(row.seconds),
      estimatedShare: streams === 0 ? 0 : Number(row.estimated) / streams,
      lastPlayedAt: row.lastPlayedAt,
    };
  });
}

export interface TopArtistByTime {
  artistId: string;
  name: string;
  imageUrl: string;
  isVerified: boolean;
  streams: number;
  seconds: number;
  listeners: number;
  estimatedShare: number;
}

/** Artistas ordenados por tiempo total escuchado, no por número de reproducciones. */
export async function getTopArtistsByTime(limit = 10): Promise<TopArtistByTime[]> {
  const rows = await prisma.$queryRawUnsafe<
    {
      artistId: string;
      name: string;
      imageUrl: string;
      isVerified: boolean;
      streams: bigint;
      seconds: bigint;
      listeners: bigint;
      estimated: bigint;
    }[]
  >(
    `
    SELECT s."artistId",
           a."name",
           a."imageUrl",
           a."isVerified",
           COUNT(*)                                        AS streams,
           SUM(${SECONDS_EXPR})::bigint                     AS seconds,
           COUNT(DISTINCT s."userId")                       AS listeners,
           COUNT(*) FILTER (WHERE s."secondsPlayed" IS NULL) AS estimated
      FROM "StreamLog" s
      JOIN "Track"  t ON t."id" = s."trackId"
      JOIN "Artist" a ON a."id" = s."artistId"
     WHERE s."playedAt" >= $1
       AND a."isBlocked" = false
     GROUP BY s."artistId", a."name", a."imageUrl", a."isVerified"
     ORDER BY seconds DESC
     LIMIT $2
    `,
    windowStart(),
    limit,
  );

  return rows.map((row) => {
    const streams = Number(row.streams);
    return {
      artistId: row.artistId,
      name: row.name,
      imageUrl: row.imageUrl,
      isVerified: row.isVerified,
      streams,
      seconds: Number(row.seconds),
      listeners: Number(row.listeners),
      estimatedShare: streams === 0 ? 0 : Number(row.estimated) / streams,
    };
  });
}

export interface TrendingRow {
  trackId: string;
  title: string;
  coverUrl: string;
  duration: number;
  genre: string | null;
  bpm: number | null;
  artistId: string;
  artistName: string;
  artistImageUrl: string;
  isVerified: boolean;
  streams: number;
  listeners: number;
  seconds: number;
}

/**
 * Ranking de canciones por reproducciones en la ventana.
 *
 * El primer elemento es "el número 1 actual". Se devuelve la lista completa
 * y no sólo el primero porque el panel muestra las dos cosas con la misma
 * consulta, y pedirlas por separado duplicaría el trabajo de la base.
 *
 * `minListeners` queda en `0` (sin piso) por defecto — lo que el panel
 * necesita es ver TODO lo que pasa, incluida una canción con una sola
 * reproducción, para detectarlo temprano. Quien pide un piso es
 * `routes/home.ts`, que alimenta con esto la fila "Tendencias" de la
 * portada pública: ahí sí hace falta, para que algo recién subido no
 * aparezca como tendencia con la reproducción del propio artista.
 */
export async function getTrendingTracks(limit = 20, days = 7, minListeners = 0): Promise<TrendingRow[]> {
  const havingClause = minListeners > 0 ? `HAVING COUNT(DISTINCT s."userId") >= $3` : '';
  const rows = await prisma.$queryRawUnsafe<
    {
      trackId: string;
      title: string;
      coverUrl: string;
      duration: number;
      genre: string | null;
      bpm: number | null;
      artistId: string;
      artistName: string;
      artistImageUrl: string;
      isVerified: boolean;
      streams: bigint;
      listeners: bigint;
      seconds: bigint;
    }[]
  >(
    `
    SELECT s."trackId",
           t."title",
           t."coverUrl",
           t."duration",
           g."name"         AS genre,
           an."bpm"         AS bpm,
           a."id"           AS "artistId",
           a."name"         AS "artistName",
           a."imageUrl"     AS "artistImageUrl",
           a."isVerified",
           COUNT(*)                    AS streams,
           COUNT(DISTINCT s."userId")  AS listeners,
           SUM(${SECONDS_EXPR})::bigint AS seconds
      FROM "StreamLog" s
      JOIN "Track"  t  ON t."id" = s."trackId"
      JOIN "Artist" a  ON a."id" = t."artistId"
      LEFT JOIN "AudioAnalysis" an ON an."trackId" = t."id"
      LEFT JOIN "MusicGenre" g ON g."id" = t."genreId"
     WHERE s."playedAt" >= $1
       AND t."status" = 'APPROVED'
       AND a."isBlocked" = false
     GROUP BY s."trackId", t."title", t."coverUrl", t."duration", g."name", an."bpm",
              a."id", a."name", a."imageUrl", a."isVerified"
     ${havingClause}
     ORDER BY streams DESC, listeners DESC
     LIMIT $2
    `,
    windowStart(days),
    limit,
    ...(minListeners > 0 ? [minListeners] : []),
  );

  return rows.map((row) => ({
    ...row,
    // `bpm` viene como number o null; se redondea acá para no repetirlo en
    // cada cliente.
    bpm: row.bpm === null ? null : Math.round(row.bpm),
    streams: Number(row.streams),
    listeners: Number(row.listeners),
    seconds: Number(row.seconds),
  }));
}

export interface TopSearch {
  normalized: string;
  /** El texto tal como lo escribió la última persona que buscó eso. */
  sample: string;
  searches: number;
  /** Media de resultados. Si es 0, hay demanda de catálogo que no tenemos. */
  avgResults: number;
}

export async function getTopSearches(limit = 25): Promise<TopSearch[]> {
  const rows = await prisma.$queryRaw<
    { normalized: string; sample: string; searches: bigint; avgResults: number }[]
  >`
    SELECT "normalized",
           (ARRAY_AGG("query" ORDER BY "createdAt" DESC))[1] AS sample,
           COUNT(*)                                          AS searches,
           AVG("resultCount")::float                         AS "avgResults"
      FROM "SearchLog"
     WHERE "createdAt" >= ${windowStart()}
     GROUP BY "normalized"
     ORDER BY searches DESC
     LIMIT ${limit}
  `;

  return rows.map((row) => ({
    normalized: row.normalized,
    sample: row.sample,
    searches: Number(row.searches),
    avgResults: Math.round(row.avgResults * 10) / 10,
  }));
}

/**
 * Reproducciones totales de un conjunto de pistas.
 *
 * Se calcula, no se guarda en una columna. Es la misma decisión que con
 * "oyentes mensuales": un contador denormalizado hay que incrementarlo desde
 * algún sitio y termina desincronizándose del historial real sin que nadie
 * lo note. Aquí es UNA consulta agregada para todas las pistas de la página,
 * no una por fila.
 *
 * A diferencia del resto de este módulo NO usa ventana: Spotify muestra el
 * total histórico junto a cada canción, no el del último mes.
 */
export async function getPlayCounts(trackIds: string[]): Promise<Map<string, number>> {
  if (trackIds.length === 0) return new Map();

  const rows = await prisma.streamLog.groupBy({
    by: ['trackId'],
    where: { trackId: { in: trackIds } },
    _count: { _all: true },
  });

  return new Map(rows.map((row) => [row.trackId, row._count._all]));
}
