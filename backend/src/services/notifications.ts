/**
 * Peyma Music API — Notificaciones
 *
 * Avisa a un usuario de algo que pasó en el servidor: su canción se aprobó,
 * se rechazó, le dieron el check, su campaña está activa.
 *
 * Por qué existe: la app generaba las notificaciones en el teléfono a
 * partir de su propio estado. Eso sólo puede producir dos cosas — avisos de
 * lo que el teléfono ya sabe (inútiles) y silencio sobre lo que decide el
 * servidor (que es todo lo que importa). Que un administrador apruebe tu
 * canción no es algo que el dispositivo pueda deducir.
 *
 * `notify` NUNCA lanza. Igual que la auditoría: si falla crear el aviso, la
 * acción que lo provocó (aprobar la canción) ya ocurrió y no debe
 * revertirse ni devolver un error por eso.
 */
import type { NotificationKind } from '@prisma/client';
import { prisma } from '../prismaClient';
import { logger } from '../logger';

export interface NotifyInput {
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  targetType?: string;
  targetId?: string;
}

export async function notify(input: NotifyInput): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId: input.userId,
        kind: input.kind,
        title: input.title.slice(0, 120),
        body: input.body.slice(0, 400),
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
      },
    });
  } catch (error) {
    logger.error({ err: error, kind: input.kind }, 'No se pudo crear la notificación');
  }
}

/**
 * Avisa al dueño de una pista.
 *
 * Resuelve quién es a partir del artista: `Track.uploadedById` sólo existe
 * si la pista vino del pipeline de subida, y las de catálogo no lo tienen.
 * El dueño del perfil de artista es el destinatario correcto en ambos casos.
 */
export async function notifyTrackOwner(
  trackId: string,
  payload: Omit<NotifyInput, 'userId' | 'targetType' | 'targetId'>,
): Promise<void> {
  try {
    const track = await prisma.track.findUnique({
      where: { id: trackId },
      select: { uploadedById: true, artist: { select: { ownerId: true } } },
    });

    const userId = track?.uploadedById ?? track?.artist.ownerId;
    // Sin dueño (catálogo importado, artista sin reclamar) no hay a quién
    // avisar. No es un error: simplemente no hay destinatario.
    if (!userId) return;

    await notify({ ...payload, userId, targetType: 'track', targetId: trackId });
  } catch (error) {
    logger.error({ err: error, trackId }, 'No se pudo notificar al dueño de la pista');
  }
}
