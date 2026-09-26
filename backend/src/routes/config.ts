/**
 * Peyma Music API — Configuración pública del cliente
 *
 * A diferencia del modo mantenimiento (que los clientes sólo descubren
 * cuando una petición cualquiera les devuelve 503), el anuncio es un banner
 * NO bloqueante: tiene que aparecer al abrir la app, no esperar a que algo
 * más falle. Por eso necesita su propio endpoint público, sin
 * autenticación, que app/web consultan al arrancar.
 */
import { Router, type Request, type Response } from 'express';
import { getBoolean, getString } from '../services/settings';

const router = Router();

router.get('/announcement', async (_req: Request, res: Response) => {
  const [enabled, message] = await Promise.all([
    getBoolean('announcement.enabled'),
    getString('announcement.message'),
  ]);
  res.json({ enabled: enabled && message.trim().length > 0, message });
});

export default router;
