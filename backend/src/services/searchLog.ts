/**
 * Peyma Music API — Registro de búsquedas
 *
 * Alimenta "qué se busca más" del panel. Se llama desde `GET /tracks` en el
 * servidor y no desde los clientes: si dependiera del front, cada cliente
 * tendría que acordarse de reportarlo y cualquier olvido dejaría un hueco
 * silencioso.
 *
 * No lanza nunca y no se espera (`void logSearch(...)`): registrar una
 * búsqueda no debe poder hacer fallar la búsqueda en sí, ni añadirle
 * latencia.
 */
import { prisma } from '../prismaClient';
import { logger } from '../logger';
import { normalizeText } from './queryParser';
import { getBoolean } from './settings';

export async function logSearch(query: string, resultCount: number, userId: string | null): Promise<void> {
  try {
    // El ajuste permite apagarlo desde el panel sin desplegar, por si hiciera
    // falta por privacidad o por volumen.
    if (!(await getBoolean('search.logQueries'))) return;

    const trimmed = query.trim();
    if (!trimmed) return;

    await prisma.searchLog.create({
      data: {
        query: trimmed.slice(0, 200),
        // `normalizeText` quita acentos pero NO pasa a minúsculas (el parser
        // de búsqueda necesita conservar el caso original), así que el
        // `toLowerCase` va aquí. Sin él, "Bloque Sur" y "bloque sur" serían
        // dos términos distintos en el ranking y ninguno destacaría.
        normalized: normalizeText(trimmed).toLowerCase().replace(/\s+/g, ' ').slice(0, 200),
        resultCount,
        userId,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'No se pudo registrar la búsqueda');
  }
}
