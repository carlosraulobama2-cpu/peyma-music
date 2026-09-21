import { Router, type Response } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../prismaClient';
import { authMiddleware, optionalAuthMiddleware, type AuthRequest } from '../middleware/auth';
import { createTrackSchema, updateTrackSchema, querySchema, idParamSchema } from '../schemas/validation';
import { NotFoundError } from '../utils/errors';
import { parseSearchQuery } from '../services/queryParser';
import { astToWhere } from '../services/searchService';
import { logSearch } from '../services/searchLog';
import { getPlayCounts } from '../services/audienceStats';

const router = Router();

const TRACK_INCLUDE = {
  artist: { select: { id: true, name: true, imageUrl: true, isVerified: true } },
  album: { select: { id: true, title: true, coverUrl: true } },
  _count: { select: { favorites: true, playlists: true, recentlyPlayed: true } },
} satisfies Prisma.TrackInclude;

/**
 * Detalle de una pista: lo de arriba más lo que el reproductor necesita para
 * SONAR bien (ganancia de normalización, onda) y las variantes disponibles.
 *
 * Deliberadamente NO va en `TRACK_INCLUDE`: `waveformPeaks` son 200 flotantes
 * por pista, y arrastrarlos en un listado de 50 multiplicaría por diez el
 * tamaño de una respuesta en la que nadie los dibuja.
 */
const TRACK_DETAIL_INCLUDE = {
  ...TRACK_INCLUDE,
  analysis: {
    select: {
      bpm: true,
      musicalKey: true,
      mode: true,
      energy: true,
      danceability: true,
      valence: true,
      integratedLufs: true,
      truePeakDb: true,
      gainDb: true,
      waveformPeaks: true,
    },
  },
  variants: {
    select: { quality: true, format: true, bitrateKbps: true, url: true, sizeBytes: true, requiredTier: true },
    orderBy: { sizeBytes: 'asc' },
  },
  credits: {
    select: { role: true, name: true, artistId: true },
    orderBy: { role: 'asc' },
  },
} satisfies Prisma.TrackInclude;

router.get('/', optionalAuthMiddleware, async (req: AuthRequest, res: Response) => {
  const { page, limit, search, genre, primaryGenre, mood, artistId, albumId } = querySchema.parse(req.query);
  const skip = (page - 1) * limit;

  const parsed = search ? parseSearchQuery(search) : null;
  const parsedSearch = parsed?.ast ?? null;

  // Cada filtro va como entrada de un AND en vez de como clave suelta del
  // mismo objeto: el parser de búsqueda puede producir `artist`/`album`, y
  // los query params también — al mezclarlos por spread, el último
  // sobrescribía al anterior y se perdía un filtro sin aviso.
  const conditions: Prisma.TrackWhereInput[] = [];
  if (artistId) conditions.push({ artistId });
  if (albumId) conditions.push({ albumId });
  if (genre) conditions.push({ artist: { genres: { has: genre } } });
  if (primaryGenre) conditions.push({ genre: primaryGenre });
  if (mood) conditions.push({ mood });
  // La búsqueda pasa por el parser de comandos (`genre:`, `year:1990-1999`,
  // AND/OR/NOT, comillas…). Una query sin comandos degrada sola a búsqueda
  // de texto libre sobre título/artista/álbum.
  if (parsedSearch) conditions.push(astToWhere(parsedSearch));

  const where: Prisma.TrackWhereInput = {
    // El catálogo público (búsqueda, carruseles de género, Inicio) nunca
    // debe mostrar algo que un admin todavía no aprobó o ya rechazó — ver
    // routes/admin.ts. La vista del propio creador (GET /users/me/tracks)
    // es la única que ve los tres estados.
    status: 'APPROVED',
    // Una pista bloqueada por una denuncia desaparece aunque su artista siga
    // activo — es el caso de un plagio concreto dentro de un catálogo legítimo.
    isBlocked: false,
    // Un artista bloqueado desaparece del catálogo junto con todas sus pistas.
    artist: { isBlocked: false },
    ...(conditions.length > 0 && { AND: conditions }),
  };

  const [tracks, total] = await Promise.all([
    prisma.track.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: TRACK_INCLUDE,
    }),
    prisma.track.count({ where }),
  ]);

  // Se registra la búsqueda aquí, en el servidor, y no en cada cliente: si
  // dependiera del front, la web, la app y el panel tendrían que acordarse
  // de llamar a un endpoint aparte y cualquier olvido dejaría un hueco
  // silencioso en la analítica. Sólo la primera página, para no contar
  // tres veces la misma búsqueda cuando el usuario baja en el listado.
  if (search && page === 1) {
    void logSearch(search, total, req.user?.id ?? null);
  }

  /**
   * Reproducciones de cada pista.
   *
   * Va en una consulta agregada aparte y no como `_count` de la relación:
   * `StreamLog` crece sin límite y contarlo por fila obligaría a una
   * subconsulta por pista. Así es UNA consulta por página, con los ids ya
   * conocidos.
   */
  const playCounts = await getPlayCounts(tracks.map((track) => track.id));

  res.json({
    tracks: tracks.map((track) => ({ ...track, playCount: playCounts.get(track.id) ?? 0 })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

router.get('/liked', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { page, limit } = querySchema.parse(req.query);
  const skip = (page - 1) * limit;

  const [favorites, total] = await Promise.all([
    prisma.favorite.findMany({
      where: { userId: req.user!.id },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { track: { include: TRACK_INCLUDE } },
    }),
    prisma.favorite.count({ where: { userId: req.user!.id } }),
  ]);

  res.json({
    tracks: favorites.map((f) => f.track),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

router.get('/:id', optionalAuthMiddleware, async (req: AuthRequest, res: Response) => {
  const { id } = idParamSchema.parse(req.params);

  const track = await prisma.track.findUnique({ where: { id }, include: TRACK_DETAIL_INCLUDE });
  if (!track) throw new NotFoundError('Canción');

  // Misma regla que el stream: el dueño ve por qué se retiró su canción; a
  // cualquier otro le consta como inexistente.
  if (track.isBlocked) {
    const isOwner = req.user != null && track.artist.id === req.user.id;
    const ownsArtist = req.user
      ? (await prisma.artist.findFirst({ where: { id: track.artistId, ownerId: req.user.id }, select: { id: true } })) !== null
      : false;
    if (!isOwner && !ownsArtist) throw new NotFoundError('Canción');

    res.status(451).json({
      error: 'takedown',
      code: 'track_taken_down',
      claimantName: track.blockedByName,
      reason: track.blockedReason,
      blockedAt: track.blockedAt,
      track: { id: track.id, title: track.title, coverUrl: track.coverUrl },
      message: track.blockedByName
        ? `Esta canción ha sido retirada por una reclamación de derechos de autor / plagio solicitada por ${track.blockedByName}.`
        : 'Esta canción ha sido retirada por una reclamación de derechos de autor / plagio.',
    });
    return;
  }

  let isLiked = false;
  if (req.user) {
    const favorite = await prisma.favorite.findUnique({
      where: { userId_trackId: { userId: req.user.id, trackId: id } },
    });
    isLiked = !!favorite;
  }

  res.json({ track: { ...track, isLiked } });
});

router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  const data = createTrackSchema.parse(req.body);
  const track = await prisma.track.create({ data, include: TRACK_INCLUDE });
  res.status(201).json({ track });
});

router.patch('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  const data = updateTrackSchema.parse(req.body);

  const exists = await prisma.track.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw new NotFoundError('Canción');

  const track = await prisma.track.update({ where: { id }, data, include: TRACK_INCLUDE });
  res.json({ track });
});

router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { id } = idParamSchema.parse(req.params);

  const exists = await prisma.track.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw new NotFoundError('Canción');

  await prisma.track.delete({ where: { id } });
  res.json({ message: 'Canción eliminada' });
});

router.post('/:id/like', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { id } = idParamSchema.parse(req.params);

  const track = await prisma.track.findUnique({ where: { id }, select: { id: true } });
  if (!track) throw new NotFoundError('Canción');

  const existing = await prisma.favorite.findUnique({
    where: { userId_trackId: { userId: req.user!.id, trackId: id } },
  });

  if (existing) {
    await prisma.favorite.delete({ where: { userId_trackId: { userId: req.user!.id, trackId: id } } });
    return res.json({ liked: false });
  }

  await prisma.favorite.create({ data: { userId: req.user!.id, trackId: id } });
  res.json({ liked: true });
});

export default router;
