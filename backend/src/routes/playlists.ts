import { Router, type Response } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../prismaClient';
import { authMiddleware, optionalAuthMiddleware, type AuthRequest } from '../middleware/auth';
import {
  createPlaylistSchema,
  updatePlaylistSchema,
  addTrackToPlaylistSchema,
  reorderTrackSchema,
  querySchema,
  idParamSchema,
  trackParamSchema,
} from '../schemas/validation';
import { AppError, ConflictError, ForbiddenError, NotFoundError } from '../utils/errors';

const router = Router();

const OWNER_SUMMARY = { select: { id: true, displayName: true, avatarUrl: true } } as const;
const TRACK_WITH_RELATIONS = {
  include: {
    artist: { select: { id: true, name: true, imageUrl: true, isVerified: true } },
    album: { select: { id: true, title: true, coverUrl: true } },
    _count: { select: { favorites: true, playlists: true, recentlyPlayed: true } },
  },
} satisfies Prisma.TrackDefaultArgs;

router.get('/', optionalAuthMiddleware, async (req: AuthRequest, res: Response) => {
  const { page, limit, search, userId } = querySchema.parse(req.query);
  const skip = (page - 1) * limit;

  const where: Prisma.PlaylistWhereInput = {
    // Retiradas por moderación: fuera de cualquier listado.
    isBlocked: false,
    ...(search && { title: { contains: search, mode: 'insensitive' } }),
    ...(userId
      ? { ownerId: userId }
      : req.user
        ? { OR: [{ isPublic: true }, { ownerId: req.user.id }] }
        : { isPublic: true }),
  };

  const [playlists, total] = await Promise.all([
    prisma.playlist.findMany({
      where,
      skip,
      take: limit,
      orderBy: { updatedAt: 'desc' },
      include: { owner: OWNER_SUMMARY, _count: { select: { tracks: true } } },
    }),
    prisma.playlist.count({ where }),
  ]);

  res.json({ playlists, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

router.get('/:id', optionalAuthMiddleware, async (req: AuthRequest, res: Response) => {
  const { id } = idParamSchema.parse(req.params);

  const playlist = await prisma.playlist.findUnique({
    where: { id },
    include: {
      owner: OWNER_SUMMARY,
      tracks: { orderBy: { position: 'asc' }, include: { track: TRACK_WITH_RELATIONS } },
      _count: { select: { tracks: true } },
    },
  });

  if (!playlist) throw new NotFoundError('Playlist');

  /**
   * Retirada por moderación. Al dueño se le dice; a cualquier otro se le
   * responde como si no existiera.
   *
   * Mismo criterio que con las canciones retiradas: el dueño necesita saber
   * qué pasó con algo suyo, y un tercero no tiene por qué enterarse de que
   * existió una playlist ni de que fue moderada.
   */
  if (playlist.isBlocked) {
    if (playlist.ownerId !== req.user?.id) throw new NotFoundError('Playlist');
    throw new AppError(
      playlist.blockedReason
        ? `Esta playlist fue retirada por moderación: ${playlist.blockedReason}`
        : 'Esta playlist fue retirada por moderación.',
      451,
      'playlist_blocked',
    );
  }

  if (!playlist.isPublic && playlist.ownerId !== req.user?.id) {
    throw new ForbiddenError('Esta playlist es privada');
  }

  res.json({ playlist });
});

router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  const data = createPlaylistSchema.parse(req.body);

  const playlist = await prisma.playlist.create({
    data: { ...data, ownerId: req.user!.id },
    include: { owner: OWNER_SUMMARY, _count: { select: { tracks: true } } },
  });

  res.status(201).json({ playlist });
});

async function requireOwnedPlaylist(id: string, userId: string) {
  const playlist = await prisma.playlist.findUnique({ where: { id } });
  if (!playlist) throw new NotFoundError('Playlist');
  if (playlist.ownerId !== userId) throw new ForbiddenError('No puedes modificar esta playlist');
  return playlist;
}

router.patch('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  const data = updatePlaylistSchema.parse(req.body);
  await requireOwnedPlaylist(id, req.user!.id);

  const updated = await prisma.playlist.update({
    where: { id },
    data,
    include: { owner: OWNER_SUMMARY, _count: { select: { tracks: true } } },
  });

  res.json({ playlist: updated });
});

router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  await requireOwnedPlaylist(id, req.user!.id);

  await prisma.playlist.delete({ where: { id } });
  res.json({ message: 'Playlist eliminada' });
});

router.post('/:id/tracks', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  const data = addTrackToPlaylistSchema.parse(req.body);
  await requireOwnedPlaylist(id, req.user!.id);

  const track = await prisma.track.findUnique({ where: { id: data.trackId }, select: { id: true } });
  if (!track) throw new NotFoundError('Canción');

  const existing = await prisma.playlistTrack.findUnique({
    where: { playlistId_trackId: { playlistId: id, trackId: data.trackId } },
  });
  if (existing) throw new ConflictError('Esa canción ya está en la playlist');

  const playlistTrack = await prisma.$transaction(async (tx) => {
    const maxPosition = await tx.playlistTrack.aggregate({
      where: { playlistId: id },
      _max: { position: true },
    });
    const position = data.position ?? (maxPosition._max.position ?? -1) + 1;

    return tx.playlistTrack.create({
      data: { playlistId: id, trackId: data.trackId, position },
      include: { track: TRACK_WITH_RELATIONS },
    });
  });

  res.status(201).json({ playlistTrack });
});

router.delete('/:id/tracks/:trackId', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { id, trackId } = trackParamSchema.parse(req.params);
  await requireOwnedPlaylist(id, req.user!.id);

  const existing = await prisma.playlistTrack.findUnique({
    where: { playlistId_trackId: { playlistId: id, trackId } },
  });
  if (!existing) throw new NotFoundError('Canción en la playlist');

  // Transacción: quitar la canción y recorrer posiciones debe ser atómico,
  // o una petición concurrente puede dejar huecos o posiciones duplicadas.
  await prisma.$transaction([
    prisma.playlistTrack.delete({ where: { playlistId_trackId: { playlistId: id, trackId } } }),
    prisma.playlistTrack.updateMany({
      where: { playlistId: id, position: { gt: existing.position } },
      data: { position: { decrement: 1 } },
    }),
  ]);

  res.json({ message: 'Canción quitada de la playlist' });
});

router.patch('/:id/tracks/:trackId', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { id, trackId } = trackParamSchema.parse(req.params);
  const { position } = reorderTrackSchema.parse(req.body);
  await requireOwnedPlaylist(id, req.user!.id);

  const playlistTrack = await prisma.playlistTrack.findUnique({
    where: { playlistId_trackId: { playlistId: id, trackId } },
  });
  if (!playlistTrack) throw new NotFoundError('Canción en la playlist');

  const oldPosition = playlistTrack.position;

  const updated = await prisma.$transaction(async (tx) => {
    if (position !== oldPosition) {
      if (position > oldPosition) {
        await tx.playlistTrack.updateMany({
          where: { playlistId: id, position: { gt: oldPosition, lte: position } },
          data: { position: { decrement: 1 } },
        });
      } else {
        await tx.playlistTrack.updateMany({
          where: { playlistId: id, position: { gte: position, lt: oldPosition } },
          data: { position: { increment: 1 } },
        });
      }
    }

    return tx.playlistTrack.update({
      where: { playlistId_trackId: { playlistId: id, trackId } },
      data: { position },
      include: { track: TRACK_WITH_RELATIONS },
    });
  });

  res.json({ playlistTrack: updated });
});

export default router;
