/**
 * Peyma Music API — Proxy de streaming de audio
 *
 * Sirve el audio de una pista desde NUESTRO origen, con soporte de
 * `Range: bytes=` para que el navegador pueda pedir el archivo por trozos
 * (buscar en la barra de progreso sin bajar todo).
 *
 * Esta ruta decide DÓNDE están los controles y por dónde van los bytes, que
 * son dos cosas distintas:
 *
 *  - Los controles siempre pasan por aquí: aprobada, artista no bloqueado,
 *    retirada por plagio (451 al dueño, 404 al resto).
 *  - Los bytes van por el camino más corto posible. Si el origen es
 *    públicamente legible, se responde con una redirección y el cliente lo
 *    baja del CDN. Si no, se reenvían a través de este proceso.
 *
 * Redirigir importa mucho: proxear obliga a dos saltos (cliente → API →
 * origen → API → cliente). Medido en local, ~900 ms hasta el primer byte
 * proxeando frente a ~170 ms directo al CDN de R2.
 *
 * Cuidado con CORS al redirigir: Web Audio API (AnalyserNode del
 * visualizador, filtros del modo Lo-Fi) SILENCIA cualquier
 * `MediaElementSource` cuyo audio venga de otro origen sin cabeceras CORS —
 * no da error, simplemente no suena. Por eso el bucket lleva una política
 * CORS con los mismos orígenes que la API (`npm run storage:cors`), y por
 * eso un origen que no las mande tiene que seguir proxeándose.
 */
import { Router, type Request, type Response } from 'express';
import { optionalAuthMiddleware, type AuthRequest } from '../middleware/auth';
import { idParamSchema } from '../schemas/validation';
import { NotFoundError, AppError } from '../utils/errors';
import { isPubliclyReadable } from '../services/storage';
import { getTrackAccess } from '../services/trackAccess';

const router = Router();

/** Sólo se permite proxear http(s); nada de `file://` ni esquemas raros que pudieran leer disco. */
function assertSafeUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new AppError('La pista no tiene una URL de audio válida', 422, 'invalid_audio_url');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new AppError('Protocolo de audio no soportado', 422, 'invalid_audio_url');
  }
  return parsed;
}

/**
 * Reenvía el audio al cliente, respetando `Range`.
 *
 * Exportada porque la usan dos rutas con reglas de acceso distintas: la
 * pública (`/tracks/:id/stream`, sólo APPROVED) y la de revisión del panel
 * (`/admin/moderation/:id/preview`, que justamente necesita reproducir lo
 * que TODAVÍA no está aprobado). El transporte es el mismo; lo que cambia es
 * quién puede pedirlo, y eso se decide antes de llamar acá.
 */
export async function pipeAudio(audioUrl: string, req: Request, res: Response): Promise<void> {
  /**
   * El audio se sirve a otros orígenes: hay que relajar aquí la política que
   * `helmet()` aplica a toda la API.
   *
   * Por defecto helmet manda `Cross-Origin-Resource-Policy: same-origin`, que
   * es lo correcto para JSON pero rompe el audio en cuanto quien lo pide no
   * está en el mismo origen — y nunca lo está: la API es `peyma-api`, la web
   * `peyma-web` y el panel `peyma-admin` (en local, 3000, 3001 y 5173).
   *
   * CORP no es CORS. Aunque el origen esté permitido en `CORS_ORIGINS`, un
   * `<audio src>` viaja como petición `no-cors` y el navegador DESCARTA la
   * respuesta por CORP sin mirar las cabeceras de CORS y sin llegar a seguir
   * la redirección al bucket. El síntoma era que revisar una canción en el
   * panel antes de aprobarla no reproducía nada.
   */
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

  // Las subidas propias ya se sirven como estáticos desde /uploads (mismo
  // origen), no hace falta proxearlas.
  if (audioUrl.startsWith('/uploads/')) {
    res.redirect(audioUrl);
    return;
  }

  /**
   * Archivo en nuestro bucket público: se redirige al CDN en vez de
   * reenviar los bytes por aquí.
   *
   * Es la diferencia más grande medida en el tiempo hasta el primer byte.
   * Canalizando por Node el cliente espera dos saltos (cliente → API →
   * origen → API → cliente); con la redirección va directo al borde de
   * Cloudflare, que además tiene el archivo cacheado cerca de quien escucha.
   * Medido en local: ~900 ms proxeando frente a ~170 ms directo a R2.
   *
   * Los controles NO se saltan: quién puede pedir esta pista (aprobada, no
   * bloqueada, retirada por plagio…) ya se decidió antes de llamar aquí. Lo
   * que cambia es sólo por dónde viajan los bytes.
   *
   * El 302 conserva el método y el navegador reenvía su cabecera `Range`,
   * así que buscar dentro de la canción sigue funcionando igual.
   */
  if (isPubliclyReadable(audioUrl)) {
    res.redirect(302, audioUrl);
    return;
  }

  const target = assertSafeUrl(audioUrl);
  const range = req.headers.range;

  const upstream = await fetch(target, { headers: range ? { Range: range } : undefined });

  if (!upstream.ok && upstream.status !== 206) {
    throw new AppError('No se pudo obtener el audio de origen', 502, 'upstream_error');
  }

  res.status(upstream.status);
  // Sólo se reenvían cabeceras necesarias para reproducir/buscar — nada del
  // upstream que pudiera filtrar información o romper nuestro CORS.
  for (const header of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'cache-control']) {
    const value = upstream.headers.get(header);
    if (value) res.setHeader(header, value);
  }
  if (!upstream.headers.get('accept-ranges')) res.setHeader('Accept-Ranges', 'bytes');

  if (!upstream.body) {
    res.end();
    return;
  }

  const reader = upstream.body.getReader();
  req.on('close', () => void reader.cancel().catch(() => {}));

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!res.write(value)) {
      await new Promise((resolve) => res.once('drain', resolve));
    }
  }
  res.end();
}

router.get('/:id/stream', optionalAuthMiddleware, async (req: AuthRequest, res: Response) => {
  const { id } = idParamSchema.parse(req.params);

  // Cacheado en memoria: esta consulta costaba ~240 ms contra Neon y es lo
  // primero que ocurre al pulsar "play". Ver `services/trackAccess.ts` para
  // el TTL y cómo se invalida al retirar una canción.
  const track = await getTrackAccess(id);
  if (!track) throw new NotFoundError('Pista');

  /**
   * Retirada por plagio: el DUEÑO de la canción recibe una explicación; el
   * resto del mundo recibe un 404.
   *
   * La diferencia es deliberada. Un 404 para el artista infractor sería
   * indistinguible de un fallo técnico y lo dejaría sin saber qué pasó ni a
   * quién reclamar. Y decirle a cualquiera que una canción "fue retirada por
   * plagio a petición de X" convertiría el endpoint en un tablón público de
   * disputas ajenas.
   */
  if (track.isBlocked) {
    const isOwner = req.user != null && track.artistOwnerId === req.user.id;
    if (isOwner) {
      // 451: "no disponible por motivos legales". Es el código exacto para
      // esto, y permite al cliente distinguirlo de un 404 y pintar la
      // pantalla negra en vez de un error genérico.
      res.status(451).json({
        error: 'takedown',
        code: 'track_taken_down',
        claimantName: track.blockedByName,
        reason: track.blockedReason,
        blockedAt: track.blockedAt,
        message: track.blockedByName
          ? `Esta canción ha sido retirada por una reclamación de derechos de autor / plagio solicitada por ${track.blockedByName}.`
          : 'Esta canción ha sido retirada por una reclamación de derechos de autor / plagio.',
      });
      return;
    }
    throw new NotFoundError('Pista');
  }

  // Bloqueo del artista entero o pista no aprobada: invisible para todos.
  if (track.status !== 'APPROVED' || track.artistIsBlocked) throw new NotFoundError('Pista');

  await pipeAudio(track.audioUrl, req, res);
});

export default router;
