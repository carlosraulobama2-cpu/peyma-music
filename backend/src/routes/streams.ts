import { Router, type Response } from 'express';
import { authMiddleware, type AuthRequest } from '../middleware/auth';
import { logStreamSchema, completeStreamSchema, idParamSchema } from '../schemas/validation';
import { logStream, completeStream } from '../services/streamLog';

const router = Router();

/** Registra una reproducción — alimenta tanto "recientes" como la ventana de 28 días de oyentes mensuales. */
router.post('/log', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { trackId, secondsPlayed, latitude, longitude } = logStreamSchema.parse(req.body);
  const location = latitude !== undefined && longitude !== undefined ? { latitude, longitude } : undefined;
  const id = await logStream(req.user!.id, trackId, secondsPlayed, location);
  // Se devuelve el id para que el cliente pueda completar los segundos
  // reales cuando la canción termine o se cambie.
  res.status(201).json({ id, message: 'Reproducción registrada' });
});

/** Completa una reproducción con los segundos realmente escuchados. */
router.patch('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  const { secondsPlayed } = completeStreamSchema.parse(req.body);

  await completeStream(req.user!.id, id, secondsPlayed);
  res.json({ message: 'Reproducción actualizada' });
});

export default router;
