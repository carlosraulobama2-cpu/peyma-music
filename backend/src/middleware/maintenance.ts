/**
 * Peyma Music API — Modo mantenimiento
 *
 * Cuando un admin activa `maintenance.enabled`, la API responde 503 con el
 * mensaje configurado y los clientes muestran una pantalla bloqueante.
 *
 * Tres excepciones, y las tres son imprescindibles:
 *
 *  1. `/api/admin/*` — si el panel también se bloqueara, nadie podría
 *     DESACTIVAR el mantenimiento. Sería un interruptor de un solo sentido.
 *  2. `/api/auth/login` y `/api/auth/google` — un admin con la sesión
 *     caducada tiene que poder entrar para llegar al panel. El REGISTRO no
 *     entra en la excepción: dejar que alguien cree una cuenta durante el
 *     mantenimiento sólo sirve para que se choque contra el 503 en la
 *     siguiente pantalla. `/api/auth/me` entra con ellas: es como el panel
 *     restaura una sesión ya iniciada, y sin ella un admin con la sesión
 *     perfectamente válida aterrizaba en el login en mitad del mantenimiento.
 *  3. `/health` y `/ready` — el balanceador dejaría de enrutar tráfico y
 *     el despliegue se daría por caído, que no es lo que significa "en
 *     mantenimiento".
 *
 * La REPRODUCCIÓN sigue funcionando a propósito: el texto del ajuste lo
 * promete ("La reproducción sigue funcionando") y cortar el audio a mitad
 * de una canción por una tarea de mantenimiento es gratuitamente hostil.
 * Lo que se bloquea son las escrituras y la navegación del catálogo.
 */
import type { Request, Response, NextFunction } from 'express';
import { getBoolean, getString } from '../services/settings';
import { logger } from '../logger';

/** Rutas que siguen respondiendo durante el mantenimiento. */
const ALWAYS_OPEN = [/^\/health$/, /^\/ready$/, /^\/api\/admin(\/|$)/, /^\/api\/auth\/(login|google|me)$/];

/** Rutas de reproducción: el audio no se corta. */
const PLAYBACK_OPEN = [/^\/api\/tracks\/[^/]+\/stream$/, /^\/uploads\//];

export async function maintenanceMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const path = req.path;

  if (ALWAYS_OPEN.some((pattern) => pattern.test(path)) || PLAYBACK_OPEN.some((pattern) => pattern.test(path))) {
    next();
    return;
  }

  try {
    if (!(await getBoolean('maintenance.enabled'))) {
      next();
      return;
    }
  } catch (error) {
    // Si no se puede leer el ajuste (base caída), NO se bloquea: un fallo
    // al consultar el interruptor no debe tumbar la plataforma entera.
    logger.error({ err: error }, 'No se pudo leer el ajuste de mantenimiento; se continúa sin bloquear');
    next();
    return;
  }

  const message = await getString('maintenance.message');

  // `Retry-After` en segundos: los clientes y los proxies saben esperar en
  // vez de reintentar en bucle. 5 minutos es una estimación conservadora.
  res.setHeader('Retry-After', '300');
  res.status(503).json({ error: 'maintenance', code: 'maintenance_mode', message });
}
