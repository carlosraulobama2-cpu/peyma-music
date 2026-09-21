/**
 * Peyma Music API — Solicitudes de promoción (lado del artista)
 *
 * Un artista pide destacar una de SUS canciones en la primera fila. La
 * aprobación vive en el panel (`routes/admin.ts`).
 */
import { Router, type Request, type Response } from 'express';
import { prisma } from '../prismaClient';
import { authMiddleware, type AuthRequest } from '../middleware/auth';
import { createPromotionSchema } from '../schemas/validation';
import { NotFoundError, ForbiddenError, ConflictError } from '../utils/errors';
import {
  getActivePromotions,
  priceFor,
  PRICE_PER_DAY_CENTS,
  MIN_PROMOTION_DAYS,
  MAX_PROMOTION_DAYS,
} from '../services/promotions';

const router = Router();

/** Primera fila pública — la consumen la app y la web. */
router.get('/active', async (_req: Request, res: Response) => {
  res.json({ promotions: await getActivePromotions() });
});

/** Tarifa vigente, para que el cliente muestre el importe antes de pedir. */
router.get('/pricing', (_req: Request, res: Response) => {
  res.json({
    pricePerDayCents: PRICE_PER_DAY_CENTS,
    currency: 'EUR',
    minDays: MIN_PROMOTION_DAYS,
    maxDays: MAX_PROMOTION_DAYS,
    // Se dice explícitamente que no se cobra: un cliente que asuma lo
    // contrario mostraría un "pago realizado" que no ocurrió.
    paymentEnabled: false,
    note: 'Todavía no hay pasarela de pago conectada; la solicitud se registra sin cobrar.',
  });
});

router.post('/request', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { trackId, days } = createPromotionSchema.parse(req.body);

  const track = await prisma.track.findUnique({
    where: { id: trackId },
    select: {
      id: true,
      title: true,
      status: true,
      isBlocked: true,
      artist: { select: { ownerId: true, isBlocked: true } },
    },
  });
  if (!track) throw new NotFoundError('Canción');

  // Sólo el dueño del perfil de artista (o un admin) puede promocionar.
  const isOwner = track.artist.ownerId === req.user!.id;
  if (!isOwner && req.user!.role !== 'ADMIN') {
    throw new ForbiddenError('Sólo el artista dueño de la canción puede promocionarla');
  }

  if (track.status !== 'APPROVED' || track.isBlocked || track.artist.isBlocked) {
    throw new ConflictError('Esta canción no está publicada; no se puede promocionar');
  }

  // Una canción no puede tener dos campañas solapadas: duplicaría su
  // presencia en la fila y el artista pagaría dos veces por el mismo hueco.
  const existing = await prisma.promotion.findFirst({
    where: { trackId, status: { in: ['PENDING_APPROVAL', 'ACTIVE'] } },
    select: { id: true, status: true },
  });
  if (existing) {
    throw new ConflictError(
      existing.status === 'ACTIVE'
        ? 'Esta canción ya está promocionada ahora mismo'
        : 'Ya hay una solicitud pendiente para esta canción',
    );
  }

  const promotion = await prisma.promotion.create({
    data: { trackId, requestedById: req.user!.id, days, priceCents: priceFor(days) },
    select: { id: true, days: true, priceCents: true, status: true, createdAt: true },
  });

  res.status(201).json({
    promotion,
    message: `Pedimos destacar "${track.title}" durante ${days} día(s). Un administrador lo va a revisar.`,
  });
});

/** Mis solicitudes, para que el artista vea en qué quedaron. */
router.get('/mine', authMiddleware, async (req: AuthRequest, res: Response) => {
  const promotions = await prisma.promotion.findMany({
    where: { requestedById: req.user!.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      days: true,
      status: true,
      priceCents: true,
      startsAt: true,
      endsAt: true,
      rejectionReason: true,
      createdAt: true,
      track: { select: { id: true, title: true, coverUrl: true } },
    },
  });
  res.json({ promotions });
});

export default router;
