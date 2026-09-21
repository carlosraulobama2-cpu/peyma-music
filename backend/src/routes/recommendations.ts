/**
 * Peyma Music API — Recomendaciones y playlists autogeneradas
 *
 * Capa fina sobre `services/recommendation.ts`: acá sólo se valida input,
 * se resuelve el usuario autenticado y se da forma a la respuesta HTTP. El
 * algoritmo (similitud de coseno sobre `featureVector`) vive todo en el
 * servicio para poder reusarlo desde otros lugares (p. ej. un job en batch)
 * sin pasar por Express.
 */
import { Router, type Response } from 'express';
import { prisma } from '../prismaClient';
import { authMiddleware, type AuthRequest } from '../middleware/auth';
import { generatePlaylistSchema, idParamSchema, querySchema } from '../schemas/validation';
import { BadRequestError, NotFoundError } from '../utils/errors';
import { findSimilarTracks, recommendForUser, generateAutoPlaylist } from '../services/recommendation';
import { getTrendingTracks } from '../services/trending';

const router = Router();

/** Ranking global — reproducciones reales de los últimos 7 días vs. los 7 anteriores (para saber si sube/baja/es nuevo). */
router.get('/trending', async (req: AuthRequest, res: Response) => {
  const { limit } = querySchema.parse(req.query);

  const entries = await getTrendingTracks(limit);
  res.json({
    tracks: entries.map((e) => ({ ...e.track, rank: e.rank, previousRank: e.previousRank, streams: e.streams })),
  });
});

/** "Porque escuchaste X" — pistas parecidas por ritmo/energía a una pista dada. */
router.get('/similar/:id', async (req: AuthRequest, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  const { limit } = querySchema.parse(req.query);

  const track = await prisma.track.findUnique({ where: { id }, select: { id: true } });
  if (!track) throw new NotFoundError('Pista');

  const results = await findSimilarTracks(id, limit);
  res.json({ tracks: results.map((r) => ({ ...r.track, similarity: r.similarity })) });
});

/** "Para ti" — a partir del historial (recientes + favoritas) del usuario logueado. */
router.get('/for-you', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { limit } = querySchema.parse(req.query);

  const results = await recommendForUser(req.user!.id, limit);
  res.json({ tracks: results.map((r) => ({ ...r.track, similarity: r.similarity })), hasHistory: results.length > 0 });
});

/** Genera y guarda una playlist automática (Daily Mix / Mezcla por ritmo / Mezcla por género). */
router.post('/playlists/generate', authMiddleware, async (req: AuthRequest, res: Response) => {
  const data = generatePlaylistSchema.parse(req.body);

  if (data.type === 'RHYTHM_MATCH' && !data.seedTrackId) {
    throw new BadRequestError('RHYTHM_MATCH necesita "seedTrackId"');
  }
  if (data.type === 'GENRE_MIX' && !data.genre) {
    throw new BadRequestError('GENRE_MIX necesita "genre"');
  }
  if (data.seedTrackId) {
    const seed = await prisma.track.findUnique({ where: { id: data.seedTrackId }, select: { id: true } });
    if (!seed) throw new NotFoundError('Pista semilla');
  }

  const playlist = await generateAutoPlaylist(req.user!.id, data.type, {
    seedTrackId: data.seedTrackId,
    genre: data.genre,
  });

  res.status(201).json({ playlist });
});

export default router;
