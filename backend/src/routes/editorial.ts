/**
 * Peyma Music API — Secciones editoriales (público)
 *
 * Lo que la app móvil y la web piden para pintar la portada. Una sola
 * llamada devuelve todas las secciones publicadas, ya resueltas y en orden,
 * así los dos clientes muestran exactamente lo mismo sin reimplementar cada
 * uno su propia idea de "lo nuevo".
 */
import { Router, type Request, type Response } from 'express';
import { getPublishedSections, getPublishedSectionBySlug } from '../services/editorial';
import { NotFoundError } from '../utils/errors';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  const sections = await getPublishedSections();
  res.json({ sections });
});

/**
 * Una sección concreta, por slug.
 *
 * Es el destino de `/seccion/:slug` en la web: hasta ahora las secciones
 * tenían slug pero no había ninguna página donde aterrizar.
 */
router.get('/:slug', async (req: Request, res: Response) => {
  const slug = String(req.params.slug ?? '').slice(0, 60);
  const section = await getPublishedSectionBySlug(slug);
  if (!section) throw new NotFoundError('Sección');
  res.json({ section });
});

export default router;
