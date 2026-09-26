import { Router, type Response } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../prismaClient';
import { authMiddleware, optionalAuthMiddleware, type AuthRequest } from '../middleware/auth';
import { createAlbumSchema, querySchema, idParamSchema } from '../schemas/validation';
import { ForbiddenError, NotFoundError } from '../utils/errors';

const router = Router();

const ARTIST_SUMMARY = { select: { id: true, name: true, imageUrl: true, isVerified: true } } as const;

router.get('/', optionalAuthMiddleware, async (req: AuthRequest, res: Response) => {
  const { page, limit, search, artistId } = querySchema.parse(req.query);
  const skip = (page - 1) * limit;

  const where: Prisma.AlbumWhereInput = {
    ...(artistId && { artistId }),
    ...(search && { title: { contains: search, mode: 'insensitive' } }),
  };

  const [albums, total] = await Promise.all([
    prisma.album.findMany({
      where,
      skip,
      take: limit,
      orderBy: { releaseYear: 'desc' },
      include: { artist: ARTIST_SUMMARY, _count: { select: { tracks: true } } },
    }),
    prisma.album.count({ where }),
  ]);

  res.json({ albums, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

router.get('/:id', optionalAuthMiddleware, async (req, res: Response) => {
  const { id } = idParamSchema.parse(req.params);

  const album = await prisma.album.findUnique({
    where: { id },
    include: {
      artist: { select: { id: true, name: true, imageUrl: true, genres: true } },
      tracks: {
        orderBy: { createdAt: 'asc' },
        include: { _count: { select: { favorites: true, playlists: true, recentlyPlayed: true } } },
      },
      _count: { select: { tracks: true } },
    },
  });

  if (!album) throw new NotFoundError('Álbum');
  res.json({ album });
});

/**
 * Crea un álbum o EP vacío, para subirle canciones después (una llamada a
 * `POST /uploads` con este `albumId` por cada pista — ver routes/uploads.ts).
 * El artista tiene que ser dueño del perfil, salvo que quien pide sea admin
 * (mismo criterio que el pipeline de subida).
 */
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  const data = createAlbumSchema.parse(req.body);

  const artist = await prisma.artist.findUnique({ where: { id: data.artistId } });
  if (!artist) throw new NotFoundError('Artista');
  if (req.user!.role !== 'ADMIN' && artist.ownerId !== req.user!.id) {
    throw new ForbiddenError('Este perfil de artista pertenece a otro usuario');
  }

  const album = await prisma.album.create({
    data,
    include: { artist: ARTIST_SUMMARY, _count: { select: { tracks: true } } },
  });
  res.status(201).json({ album });
});

export default router;
