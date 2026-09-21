import { Router, type Response } from 'express';
import { prisma } from '../prismaClient';
import { authMiddleware, type AuthRequest } from '../middleware/auth';
import { querySchema, idParamSchema, locationConsentSchema } from '../schemas/validation';
import { NotFoundError } from '../utils/errors';

const router = Router();

router.get('/favorites', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { page, limit } = querySchema.parse(req.query);
  const skip = (page - 1) * limit;

  const [favorites, total] = await Promise.all([
    prisma.favorite.findMany({
      where: { userId: req.user!.id },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        track: {
          include: {
            artist: { select: { id: true, name: true, imageUrl: true, isVerified: true } },
            album: { select: { id: true, title: true, coverUrl: true } },
            _count: { select: { favorites: true, playlists: true, recentlyPlayed: true } },
          },
        },
      },
    }),
    prisma.favorite.count({ where: { userId: req.user!.id } }),
  ]);

  res.json({
    tracks: favorites.map((f) => f.track),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

router.get('/recently-played', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { page, limit } = querySchema.parse(req.query);
  const skip = (page - 1) * limit;

  const [recentlyPlayed, total] = await Promise.all([
    prisma.recentlyPlayed.findMany({
      where: { userId: req.user!.id },
      skip,
      take: limit,
      orderBy: { playedAt: 'desc' },
      include: {
        track: {
          include: {
            artist: { select: { id: true, name: true, imageUrl: true, isVerified: true } },
            album: { select: { id: true, title: true, coverUrl: true } },
            _count: { select: { favorites: true, playlists: true, recentlyPlayed: true } },
          },
        },
      },
    }),
    prisma.recentlyPlayed.count({ where: { userId: req.user!.id } }),
  ]);

  res.json({
    tracks: recentlyPlayed.map((rp) => rp.track),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

router.get('/following', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { page, limit } = querySchema.parse(req.query);
  const skip = (page - 1) * limit;

  const [follows, total] = await Promise.all([
    prisma.follow.findMany({
      where: { userId: req.user!.id },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { artist: { include: { _count: { select: { albums: true, tracks: true, followers: true } } } } },
    }),
    prisma.follow.count({ where: { userId: req.user!.id } }),
  ]);

  res.json({
    artists: follows.map((f) => f.artist),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

router.delete('/favorites/:trackId', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { id: trackId } = idParamSchema.parse({ id: req.params.trackId });

  const existing = await prisma.favorite.findUnique({
    where: { userId_trackId: { userId: req.user!.id, trackId } },
  });
  if (!existing) throw new NotFoundError('Favorito');

  await prisma.favorite.delete({ where: { userId_trackId: { userId: req.user!.id, trackId } } });
  res.json({ message: 'Quitada de favoritos' });
});

router.delete('/recently-played', authMiddleware, async (req: AuthRequest, res: Response) => {
  await prisma.recentlyPlayed.deleteMany({ where: { userId: req.user!.id } });
  res.json({ message: 'Reproducciones recientes borradas' });
});

/** Catálogo propio del creador — a diferencia de GET /tracks, ve los tres estados de moderación (pendiente/aprobado/rechazado), no sólo lo público. */
router.get('/me/tracks', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { page, limit } = querySchema.parse(req.query);
  const skip = (page - 1) * limit;

  const [tracks, total] = await Promise.all([
    prisma.track.findMany({
      where: { uploadedById: req.user!.id },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        artist: { select: { id: true, name: true, imageUrl: true, isVerified: true } },
        album: { select: { id: true, title: true, coverUrl: true } },
      },
    }),
    prisma.track.count({ where: { uploadedById: req.user!.id } }),
  ]);

  res.json({ tracks, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

router.get('/playlists', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { page, limit } = querySchema.parse(req.query);
  const skip = (page - 1) * limit;

  const [playlists, total] = await Promise.all([
    prisma.playlist.findMany({
      where: { ownerId: req.user!.id },
      skip,
      take: limit,
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { tracks: true } } },
    }),
    prisma.playlist.count({ where: { ownerId: req.user!.id } }),
  ]);

  res.json({ playlists, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

/**
 * Registra la decisión del usuario sobre compartir su ubicación.
 *
 * Se guarda la fecha además del valor: ante una reclamación de privacidad
 * hay que poder demostrar cuándo se dio el consentimiento, no sólo que
 * existe. Es revocable — mandar DENIED en cualquier momento basta, y a
 * partir de ahí el servidor descarta las coordenadas que lleguen.
 */
router.patch('/me/location-consent', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { consent } = locationConsentSchema.parse(req.body);

  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: { locationConsent: consent, locationConsentAt: new Date() },
    select: { locationConsent: true, locationConsentAt: true },
  });

  // Al revocar se borran las coordenadas ya guardadas. Dejar de recoger
  // datos nuevos pero conservar los viejos no es revocar de verdad.
  if (consent === 'DENIED') {
    await prisma.streamLog.updateMany({
      where: { userId: req.user!.id, latitude: { not: null } },
      data: { latitude: null, longitude: null },
    });
  }

  res.json({ ...user, message: consent === 'GRANTED' ? 'Gracias, ya podés aparecer en el mapa de oyentes.' : 'Listo, no compartimos tu ubicación y borramos la que hubiera.' });
});

export default router;
