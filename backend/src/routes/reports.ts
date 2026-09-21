/**
 * Peyma Music API — Denuncias de canciones
 *
 * Lo que envían la app y la web cuando alguien denuncia una pista por
 * plagio, derechos de autor u otro motivo. La resolución vive en el panel
 * (`routes/admin.ts`).
 *
 * Requiere sesión a propósito: una denuncia anónima no se puede contrastar
 * ni limitar, y el sistema se llenaría de ruido en cuanto alguien quisiera
 * hundir a un competidor.
 */
import { Router, type Response } from 'express';
import { prisma } from '../prismaClient';
import { authMiddleware, type AuthRequest } from '../middleware/auth';
import { createReportSchema, idParamSchema } from '../schemas/validation';
import { NotFoundError, ConflictError } from '../utils/errors';

const router = Router();

/** Motivos y etiquetas, para que los clientes no los dupliquen cada uno. */
router.get('/reasons', (_req, res: Response) => {
  res.json({
    reasons: [
      { value: 'PLAGIARISM', label: 'Plagio', needsDetails: true },
      { value: 'COPYRIGHT', label: 'Soy el titular de los derechos', needsDetails: true },
      { value: 'EXPLICIT_CONTENT', label: 'Contenido explícito sin marcar', needsDetails: false },
      { value: 'HATE_SPEECH', label: 'Incitación al odio', needsDetails: false },
      { value: 'MISLEADING_METADATA', label: 'Título, artista o portada falsos', needsDetails: false },
      { value: 'LOW_QUALITY', label: 'El audio está roto o es el archivo equivocado', needsDetails: false },
      { value: 'OTHER', label: 'Otro motivo', needsDetails: true },
    ],
  });
});

router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  const data = createReportSchema.parse(req.body);

  const track = await prisma.track.findUnique({
    where: { id: data.trackId },
    select: { id: true, title: true },
  });
  if (!track) throw new NotFoundError('Canción');

  // La clave única (trackId, reporterId) ya lo impediría, pero se comprueba
  // antes para devolver un mensaje entendible en vez de un 409 genérico de
  // violación de restricción.
  const existing = await prisma.trackReport.findUnique({
    where: { trackId_reporterId: { trackId: data.trackId, reporterId: req.user!.id } },
    select: { id: true, status: true },
  });
  if (existing) {
    throw new ConflictError('Ya denunciaste esta canción; tu denuncia sigue en revisión');
  }

  const report = await prisma.trackReport.create({
    data: {
      trackId: data.trackId,
      reporterId: req.user!.id,
      reason: data.reason,
      details: data.details ?? null,
    },
    select: { id: true, reason: true, status: true, createdAt: true },
  });

  res.status(201).json({
    report,
    message: `Recibimos tu denuncia sobre "${track.title}". Un moderador la va a revisar.`,
  });
});

/** Mis propias denuncias — para que el usuario sepa en qué quedaron. */
router.get('/mine', authMiddleware, async (req: AuthRequest, res: Response) => {
  const reports = await prisma.trackReport.findMany({
    where: { reporterId: req.user!.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      reason: true,
      status: true,
      createdAt: true,
      resolvedAt: true,
      track: { select: { id: true, title: true, coverUrl: true, artist: { select: { name: true } } } },
    },
  });
  res.json({ reports });
});

/** ¿Ya denuncié esta canción? Lo consulta la ficha antes de ofrecer el botón. */
router.get('/track/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  const existing = await prisma.trackReport.findUnique({
    where: { trackId_reporterId: { trackId: id, reporterId: req.user!.id } },
    select: { id: true, status: true, createdAt: true },
  });
  res.json({ report: existing });
});

export default router;
