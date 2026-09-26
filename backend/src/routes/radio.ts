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
import { logRadioOpenSchema, radioNowPlayingQuerySchema } from '../schemas/validation';
import { getIcyNowPlaying } from '../services/icyMetadata';

const router = Router();

router.post('/opened', async (req: Request, res: Response) => {
  const { platform } = logRadioOpenSchema.parse(req.body);
  await prisma.radioOpenEvent.create({ data: { platform } });
  res.status(201).json({ message: 'Registrado' });
});

/**
 * "Sonando ahora" para la web — ver services/icyMetadata.ts sobre por qué
 * hace falta un relevo del servidor (un `<audio>` de navegador nunca ve la
 * metadata ICY) y cómo se blinda contra SSRF antes de conectarse a la URL
 * que manda el cliente.
 *
 * Sin autenticación, igual que `/opened`: no hay nada que atribuir a un
 * usuario, y el límite general de la API (120/min) ya cubre el abuso básico.
 */
router.get('/now-playing', async (req: Request, res: Response) => {
  const { stationId, streamUrl } = radioNowPlayingQuerySchema.parse(req.query);
  const title = await getIcyNowPlaying(stationId, streamUrl);
  res.json({ title });
});

export default router;
