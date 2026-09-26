/**
 * Peyma Music API — Radio en vivo
 *
 * "Radio en vivo" (app y web) no es contenido propio: reproduce estaciones
 * de radio-browser.info, un tercero, sin pasar por este backend en
 * absoluto. Lo único que sí llega acá es un conteo de uso — se abrió la
 * sección, desde qué plataforma — para que el panel pueda responder
 * "¿se usa esto?" sin necesidad de saber quién ni qué estación escuchó.
 *
 * Sin autenticación a propósito: no hay nada que proteger ni que atribuir a
 * un usuario, y exigir sesión sólo complicaría al cliente para un conteo
 * que de todas formas es anónimo.
 */
import { Router, type Request, type Response } from 'express';
import { prisma } from '../prismaClient';
import { logRadioOpenSchema } from '../schemas/validation';

const router = Router();

router.post('/opened', async (req: Request, res: Response) => {
  const { platform } = logRadioOpenSchema.parse(req.body);
  await prisma.radioOpenEvent.create({ data: { platform } });
  res.status(201).json({ message: 'Registrado' });
});

export default router;
