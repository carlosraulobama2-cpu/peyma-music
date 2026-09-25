import { Router, type Response } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../prismaClient';
import { authMiddleware, optionalAuthMiddleware, type AuthRequest } from '../middleware/auth';
import { createArtistSchema, querySchema, idParamSchema } from '../schemas/validation';
import { NotFoundError, ConflictError } from '../utils/errors';
import { getArtistStats, getMonthlyListeners, getMonthlyListenersBulk } from '../services/artistStats';
import { getPlayCounts } from '../services/audienceStats';

const router = Router();

router.get('/', optionalAuthMiddleware, async (req: AuthRequest, res: Response) => {
  const { page, limit, search, genre } = querySchema.parse(req.query);
  const skip = (page - 1) * limit;

  const where: Prisma.ArtistWhereInput = {
    // Los bloqueados sólo se ven desde el panel admin (GET /admin/artists).
    isBlocked: false,
    ...(search && { name: { contains: search, mode: 'insensitive' } }),
    ...(genre && { genres: { has: genre } }),
  };

  const [artists, total] = await Promise.all([
    prisma.artist.findMany({
      where,
      skip,
      take: limit,
      // Ya no se puede ordenar por "oyentes mensuales" a nivel de columna:
      // es una ventana rodante calculada de StreamLog, no un entero
      // guardado. Un "top artistas" real necesitaría su propia query de
      // agregación ordenada — se deja fuera de este listado genérico.
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { albums: true, tracks: true, followers: true } } },
    }),
    prisma.artist.count({ where }),
  ]);

  const monthlyListenersByArtist = await getMonthlyListenersBulk(artists.map((a) => a.id));
  const artistsWithStats = artists.map((artist) => ({
    ...artist,
    monthlyListeners: monthlyListenersByArtist.get(artist.id) ?? 0,
  }));

  res.json({ artists: artistsWithStats, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

router.get('/:id', optionalAuthMiddleware, async (req: AuthRequest, res: Response) => {
  const { id } = idParamSchema.parse(req.params);

  const artist = await prisma.artist.findUnique({
    where: { id },
    include: {
      albums: {
        orderBy: { releaseYear: 'desc' },
        include: { _count: { select: { tracks: true } } },
      },
      tracks: {
        // Las pistas bloqueadas por una denuncia no salen en el perfil
        // público, igual que no salen en el catálogo ni suenan.
        where: { isBlocked: false, status: 'APPROVED' },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          album: { select: { id: true, title: true, coverUrl: true } },
          _count: { select: { favorites: true, playlists: true, recentlyPlayed: true } },
        },
      },
      _count: { select: { albums: true, tracks: true, followers: true } },
    },
  });

  // Un artista bloqueado se comporta como inexistente de cara al público.
  if (!artist || artist.isBlocked) throw new NotFoundError('Artista');

  let isFollowing = false;
  if (req.user) {
    const follow = await prisma.follow.findUnique({
      where: { userId_artistId: { userId: req.user.id, artistId: id } },
    });
    isFollowing = !!follow;
  }

  const monthlyListeners = await getMonthlyListeners(id);

  // Reproducciones totales de cada pista, como el número que Spotify pone a
  // la derecha de cada canción en el perfil del artista. Una sola consulta
  // agregada para todas las pistas, no una por fila.
  const playCounts = await getPlayCounts(artist.tracks.map((track) => track.id));

  res.json({
    artist: {
      ...artist,
      tracks: artist.tracks.map((track) => ({ ...track, playCount: playCounts.get(track.id) ?? 0 })),
      isFollowing,
      monthlyListeners,
    },
  });
});

/**
 * Crea un perfil de artista y se lo asigna a quien lo crea.
 *
 * `ownerId` es imprescindible y antes no se ponía: el perfil nacía sin
 * dueño y su creador no podía subirle canciones, porque el pipeline de
 * subida exige ser el titular. Quedaba un artista huérfano que sólo un
 * administrador podía usar.
 *
 * Un usuario sólo puede tener UN perfil de artista. Permitir varios
 * convertiría la titularidad en algo ambiguo ("¿a cuál subo?") sin que
 * nadie lo haya pedido.
 */
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  const data = createArtistSchema.parse(req.body);

  const existing = await prisma.artist.findFirst({
    where: { ownerId: req.user!.id },
    select: { id: true, name: true },
  });
  if (existing) {
    throw new ConflictError(`Ya tienes un perfil de artista: "${existing.name}"`);
  }

  const artist = await prisma.artist.create({
    data: { ...data, genres: data.genres ?? [], ownerId: req.user!.id },
    include: { _count: { select: { albums: true, tracks: true, followers: true } } },
  });

  // El rol pasa a ARTIST: habilita su panel y las vistas de creador.
  await prisma.user.update({ where: { id: req.user!.id }, data: { role: 'ARTIST' } });

  res.status(201).json({ artist: { ...artist, monthlyListeners: 0 } });
});

/** El perfil de artista de quien pregunta, si tiene uno. */
router.get('/me/profile', authMiddleware, async (req: AuthRequest, res: Response) => {
  const artist = await prisma.artist.findFirst({
    where: { ownerId: req.user!.id },
    include: { _count: { select: { albums: true, tracks: true, followers: true } } },
  });
  res.json({ artist });
});

/**
 * TODAS las canciones propias, en cualquier estado.
 *
 * `GET /artists/:id` (el perfil público) filtra a `APPROVED` — a propósito,
 * nadie más debería ver una pista pendiente o rechazada. Pero eso dejaba a
 * quien acaba de publicar sin ninguna forma de ver (ni escuchar, ver
 * `/tracks/:id/stream`) lo que subió mientras espera revisión: la canción
 * existía en la base pero era invisible hasta para su propio dueño.
 */
router.get('/me/tracks', authMiddleware, async (req: AuthRequest, res: Response) => {
  const artist = await prisma.artist.findFirst({ where: { ownerId: req.user!.id }, select: { id: true } });
  if (!artist) return void res.json({ tracks: [] });

  const tracks = await prisma.track.findMany({
    where: { artistId: artist.id },
    orderBy: { createdAt: 'desc' },
    include: {
      album: { select: { id: true, title: true, coverUrl: true } },
      artist: { select: { id: true, name: true, imageUrl: true, isVerified: true } },
    },
  });

  const playCounts = await getPlayCounts(tracks.map((t) => t.id));
  res.json({ tracks: tracks.map((t) => ({ ...t, playCount: playCounts.get(t.id) ?? 0 })) });
});

/** Seguidores totales + oyentes únicos de los últimos 28 días — las dos métricas estilo Spotify. */
router.get('/:id/stats', async (req: AuthRequest, res: Response) => {
  const { id } = idParamSchema.parse(req.params);

  const artist = await prisma.artist.findUnique({ where: { id }, select: { id: true } });
  if (!artist) throw new NotFoundError('Artista');

  const stats = await getArtistStats(id);
  res.json(stats);
});

/** Seguir a un artista — perfil al estilo Spotify/Apple Music. */
router.post('/:id/follow', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { id } = idParamSchema.parse(req.params);

  const artist = await prisma.artist.findUnique({ where: { id }, select: { id: true } });
  if (!artist) throw new NotFoundError('Artista');

  const existing = await prisma.follow.findUnique({
    where: { userId_artistId: { userId: req.user!.id, artistId: id } },
  });

  if (existing) {
    await prisma.follow.delete({ where: { userId_artistId: { userId: req.user!.id, artistId: id } } });
    return res.json({ isFollowing: false });
  }

  await prisma.follow.create({ data: { userId: req.user!.id, artistId: id } });
  res.json({ isFollowing: true });
});

export default router;
