/**
 * Peyma Music API — Registro de reproducciones
 *
 * Un único punto de entrada, usado sólo por `routes/streams.ts`. Hubo un
 * segundo camino (`POST /api/users/tracks/:id/play`) que se quitó al
 * comprobar que no lo llamaba ningún cliente: no aceptaba `secondsPlayed`,
 * así que si alguien lo hubiera usado habría metido reproducciones sin
 * duración real y las "horas escuchadas" tendrían que estimarse a la alza
 * justo para esos eventos.
 */
import { prisma } from '../prismaClient';
import { NotFoundError } from '../utils/errors';

export interface StreamLocation {
  latitude: number;
  longitude: number;
}

export async function logStream(
  userId: string,
  trackId: string,
  secondsPlayed?: number,
  location?: StreamLocation,
): Promise<string> {
  const track = await prisma.track.findUnique({ where: { id: trackId }, select: { id: true, artistId: true, duration: true } });
  if (!track) throw new NotFoundError('Canción');

  // Se recorta a la duración de la pista: un cliente con el reloj mal, o
  // que reenvíe el evento, podría mandar más segundos de los que la canción
  // dura y falsear las horas totales hacia arriba.
  const seconds =
    secondsPlayed === undefined ? null : Math.max(0, Math.min(Math.round(secondsPlayed), track.duration));

  /**
   * La ubicación se guarda SÓLO si el usuario dio permiso explícito, y eso
   * se comprueba aquí en el servidor. No basta con que el cliente deje de
   * mandarla: un cliente modificado, o una versión vieja de la app que no
   * conozca el ajuste, la seguiría enviando.
   *
   * Se redondea a 1 decimal (~11 km). Suficiente para un mapa de densidad,
   * insuficiente para saber dónde vive nadie.
   */
  let coords: { latitude: number; longitude: number } | null = null;
  if (location) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { locationConsent: true } });
    if (user?.locationConsent === 'GRANTED') {
      coords = {
        latitude: Math.round(location.latitude * 10) / 10,
        longitude: Math.round(location.longitude * 10) / 10,
      };
    }
  }

  // Una transacción: si algo falla a mitad de camino no queda sólo el log de
  // reproducción sin el "recently played" (o viceversa) a medio escribir.
  const [created] = await prisma.$transaction([
    prisma.streamLog.create({
      data: { userId, trackId: track.id, artistId: track.artistId, secondsPlayed: seconds, ...coords },
      select: { id: true },
    }),
    prisma.recentlyPlayed.upsert({
      where: { userId_trackId: { userId, trackId: track.id } },
      update: { playedAt: new Date() },
      create: { userId, trackId: track.id },
    }),
  ]);

  return created.id;
}

/**
 * Completa una reproducción ya registrada con los segundos realmente oídos.
 *
 * El evento se crea al EMPEZAR la canción (para que "escuchando ahora" y
 * oyentes mensuales no lleguen tarde) y se completa al terminarla o al
 * cambiar de pista. Es una sola fila que se corrige, no dos eventos: contar
 * dos veces la misma escucha falsearía todos los rankings.
 */
export async function completeStream(userId: string, streamLogId: string, secondsPlayed: number): Promise<void> {
  // Se comprueba el dueño en el `where`: sin esto, cualquiera con un id
  // podría inflar las horas de otra persona.
  const log = await prisma.streamLog.findFirst({
    where: { id: streamLogId, userId },
    select: { id: true, track: { select: { duration: true } } },
  });
  if (!log) throw new NotFoundError('Reproducción');

  await prisma.streamLog.update({
    where: { id: log.id },
    data: { secondsPlayed: Math.max(0, Math.min(Math.round(secondsPlayed), log.track.duration)) },
  });
}
