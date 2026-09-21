/**
 * Peyma Music API — Notificaciones del usuario
 */
import { Router, type Response } from 'express';
import { prisma } from '../prismaClient';
import { authMiddleware, type AuthRequest } from '../middleware/auth';
import { querySchema, idParamSchema } from '../schemas/validation';

const router = Router();

router.use(authMiddleware);

router.get('/', async (req: AuthRequest, res: Response) => {
  const { page, limit } = querySchema.parse(req.query);

  const [notifications, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.notification.count({ where: { userId: req.user!.id, readAt: null } }),
  ]);

  res.json({ notifications, unread });
});

/** Marca todas como leídas. */
router.patch('/read', async (req: AuthRequest, res: Response) => {
  // `readAt: null` en el filtro: sin él se reescribiría la fecha de las ya
  // leídas y se perdería cuándo se leyeron de verdad.
  const result = await prisma.notification.updateMany({
    where: { userId: req.user!.id, readAt: null },
    data: { readAt: new Date() },
  });

  res.json({ marked: result.count });
});

/** Marca una sola como leída — al tocarla. */
router.patch('/:id/read', async (req: AuthRequest, res: Response) => {
  const { id } = idParamSchema.parse(req.params);

  // El `userId` va en el where: sin él, cualquiera con un id podría marcar
  // como leídas las notificaciones de otra persona.
  await prisma.notification.updateMany({
    where: { id, userId: req.user!.id, readAt: null },
    data: { readAt: new Date() },
  });

  res.json({ ok: true });
});

export default router;
