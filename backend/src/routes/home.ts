/**
 * Peyma Music API — Portada (Home Feed)
 *
 * UNA sola llamada devuelve todo lo que pinta la pantalla de Inicio: fila
 * VIP, accesos rápidos, escuchado recientemente, tendencias, novedades,
 * recomendaciones y las secciones editoriales.
 *
 * Por qué agregado y no un endpoint por fila: la web hacía cinco peticiones
 * en paralelo al abrir Inicio y la app otras tantas. Cada una con su propia
 * latencia, su propio estado de carga y su propio manejo de error, y las dos
 * plataformas decidiendo por separado qué pedir — que es exactamente cómo
 * acaban mostrando cosas distintas. Con un único endpoint, la composición de
 * la portada se decide en un solo sitio.
 *
 * Las consultas de dentro SÍ van en paralelo (`Promise.all`): son
 * independientes y serializarlas sumaría sus latencias.
 */
import { Router, type Response } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../prismaClient';
import { optionalAuthMiddleware, type AuthRequest } from '../middleware/auth';
import { getActivePromotions } from '../services/promotions';
import { getPublishedSections, MIN_LISTENERS_TO_FEATURE } from '../services/editorial';
import { getTrendingTracks, getPlayCounts } from '../services/audienceStats';
import { getRankedArtists } from '../services/artistRanking';

const router = Router();

/** Cuántas piezas lleva cada fila. Más no caben en pantalla sin desplazar mucho. */
const ROW_SIZE = 12;
/** La cuadrícula de accesos rápidos es 2×4. */
const QUICK_ACCESS_SIZE = 8;

const CARD_TRACK_SELECT = {
  id: true,
  title: true,
  coverUrl: true,
  duration: true,
  genre: true,
  isExplicit: true,
  dominantColor: true,
  artist: { select: { id: true, name: true, imageUrl: true, isVerified: true } },
  album: { select: { id: true, title: true } },
} satisfies Prisma.TrackSelect;

/** Filtro público, el mismo en toda la portada. */
const PUBLIC_WHERE: Prisma.TrackWhereInput = {
  status: 'APPROVED',
  isBlocked: false,
  artist: { isBlocked: false },
};

router.get('/', optionalAuthMiddleware, async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id ?? null;

  const [promotions, sections, trending, newReleases, recentRows, quickAccessPlaylists, rankedArtists] = await Promise.all([
    getActivePromotions(),
    getPublishedSections(),
    // Piso de oyentes distintos: sin esto, algo recién subido aparecía como
    // "tendencia" en la portada con la propia reproducción de quien lo subió.
    getTrendingTracks(ROW_SIZE, 28, MIN_LISTENERS_TO_FEATURE),
    prisma.track.findMany({
      where: PUBLIC_WHERE,
      orderBy: { createdAt: 'desc' },
      take: ROW_SIZE,
      select: CARD_TRACK_SELECT,
    }),
    // "Escuchado recientemente" sólo existe si hay sesión. Sin usuario se
    // devuelve vacío en vez de inventar un historial genérico.
    userId
      ? prisma.recentlyPlayed.findMany({
          where: { userId, track: PUBLIC_WHERE },
          orderBy: { playedAt: 'desc' },
          take: ROW_SIZE,
          select: { track: { select: CARD_TRACK_SELECT } },
        })
      : [],
    userId
      ? prisma.playlist.findMany({
          // Las retiradas por moderación no llenan la cuadrícula.
          where: { ownerId: userId, isBlocked: false },
          orderBy: { updatedAt: 'desc' },
          take: QUICK_ACCESS_SIZE,
          select: { id: true, title: true, coverUrl: true, _count: { select: { tracks: true } } },
        })
      : [],
    /**
     * Artistas populares, para la fila de avatares redondos — el mismo
     * ranking compuesto (oyentes + reproducciones + seguidores) que decide
     * quién entra a TOP_ARTISTS en las secciones editoriales, para que
     * "quién es popular" no dependa de en qué fila de la portada se mire.
     * Ver services/artistRanking.ts.
     */
    getRankedArtists(new Date(Date.now() - 28 * 24 * 60 * 60 * 1000), 12, MIN_LISTENERS_TO_FEATURE),
  ]);

  const recentlyPlayed = recentRows.map((row) => row.track);

  /**
   * Reproducciones de todas las pistas de la portada.
   *
   * Antes sólo las traía la fila de tendencias, porque ahí venían incluidas
   * en la propia consulta de tendencias. El resultado era que en la portada
   * casi ninguna tarjeta mostraba su contador: la fila de novedades y la de
   * escuchado recientemente llegaban sin el dato y el cliente, que compara
   * con `undefined` para poder enseñar un 0 legítimo, no pintaba nada.
   *
   * Se resuelve en UNA consulta para todas las pistas juntas, no una por
   * fila: son los mismos identificadores repetidos entre filas y agruparlos
   * evita tanto el problema N+1 como contar dos veces.
   */
  const cardIds = [...new Set([...newReleases, ...recentlyPlayed].map((track) => track.id))];
  const cardPlayCounts = await getPlayCounts(cardIds);
  const withPlays = <T extends { id: string }>(track: T) => ({
    ...track,
    playCount: cardPlayCounts.get(track.id) ?? 0,
  });

  // `getRankedArtists` sólo da ids y métricas; el nombre/foto se resuelve
  // acá para no acoplar el ranking (compartido con editorial.ts) a la forma
  // exacta que necesita cada consumidor.
  const artistDetails = await prisma.artist.findMany({
    where: { id: { in: rankedArtists.map((a) => a.artistId) } },
    select: { id: true, name: true, imageUrl: true, isVerified: true },
  });
  const artistDetailsById = new Map(artistDetails.map((a) => [a.id, a]));
  const topArtists = rankedArtists
    .map((ranked) => {
      const details = artistDetailsById.get(ranked.artistId);
      return details ? { ...details, listeners: ranked.listeners } : null;
    })
    .filter((a): a is NonNullable<typeof a> => a !== null);

  /**
   * Accesos rápidos: las playlists del usuario y, si no llena los 8 huecos,
   * se completa con lo que escuchó hace poco.
   *
   * La cuadrícula es de tamaño fijo (2×4) y dejar huecos vacíos se ve como
   * un error de carga. Completarla con historial real es mejor que mostrar
   * cuatro tarjetas y cuatro agujeros.
   */
  const quickAccess = [
    ...quickAccessPlaylists.map((playlist) => ({
      kind: 'playlist' as const,
      id: playlist.id,
      title: playlist.title,
      coverUrl: playlist.coverUrl,
      subtitle: `${playlist._count.tracks} canción(es)`,
    })),
    ...recentlyPlayed.map((track) => ({
      kind: 'track' as const,
      id: track.id,
      title: track.title,
      coverUrl: track.coverUrl,
      subtitle: track.artist.name,
    })),
  ].slice(0, QUICK_ACCESS_SIZE);

  res.json({
    /** Fila VIP: contenido promocionado desde el panel. */
    hero: promotions,
    quickAccess,
    rows: [
      { key: 'recent', title: 'Escuchado recientemente', tracks: recentlyPlayed.map(withPlays) },
      {
        key: 'trending',
        title: 'Tendencias en los últimos 28 días',
        // `getTrendingTracks` devuelve su propia forma; se adapta aquí para
        // que TODAS las filas tengan la misma, y el cliente pinte una sola
        // tarjeta en vez de una por tipo de fila.
        tracks: trending.map((row) => ({
          id: row.trackId,
          title: row.title,
          coverUrl: row.coverUrl,
          duration: row.duration,
          genre: row.genre,
          isExplicit: false,
          dominantColor: null,
          artist: { id: row.artistId, name: row.artistName, imageUrl: row.artistImageUrl, isVerified: row.isVerified },
          album: null,
          playCount: row.streams,
        })),
      },
      { key: 'new', title: 'Novedades de la semana', tracks: newReleases.map(withPlays) },
    ].filter((row) => row.tracks.length > 0),
    /**
     * Artistas populares, por el ranking compuesto de artistRanking.ts.
     * Puede venir vacía en un catálogo muy nuevo (nadie llega todavía al
     * piso de oyentes) — es preferible a rellenar con artistas sin
     * actividad real sólo para que la fila no se vea vacía.
     */
    artists: topArtists,
    /** Secciones que definió el curador en el panel. */
    sections,
    /** Para que el cliente sepa cuánto puede reutilizar esta respuesta. */
    generatedAt: new Date().toISOString(),
  });
});

export default router;
