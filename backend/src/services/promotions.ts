/**
 * Peyma Music API — Promociones de primera fila
 *
 * Un artista pide destacar una canción en la fila superior de la portada; un
 * admin aprueba o rechaza; si aprueba, la canción aparece durante los días
 * contratados y luego desaparece sola.
 *
 * Decisión clave: la ventana de fechas se fija al APROBAR, no al solicitar.
 * Entre una cosa y otra pueden pasar días, y si la ventana empezara a contar
 * desde la solicitud el artista perdería parte de lo que pidió sin haber
 * hecho nada mal.
 *
 * La caducidad tampoco necesita un trabajo periódico: `getActivePromotions`
 * filtra por fecha en la consulta. Un cron que marque las vencidas es una
 * pieza más que puede fallar en silencio y dejar promociones caducadas
 * visibles; comprobar la fecha al leer no puede desincronizarse.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '../prismaClient';

/** Precio por día, en céntimos. Fijo en código porque cambiarlo es una
 *  decisión comercial que debe quedar en el historial de despliegues. */
export const PRICE_PER_DAY_CENTS = 500;

export const MIN_PROMOTION_DAYS = 1;
export const MAX_PROMOTION_DAYS = 30;

export function priceFor(days: number): number {
  return days * PRICE_PER_DAY_CENTS;
}

const PROMOTED_TRACK_SELECT = {
  id: true,
  title: true,
  coverUrl: true,
  duration: true,
  genre: true,
  isExplicit: true,
  artist: { select: { id: true, name: true, imageUrl: true, isVerified: true } },
  album: { select: { id: true, title: true } },
} satisfies Prisma.TrackSelect;

export interface PromotedItem {
  promotionId: string;
  position: number;
  endsAt: Date | null;
  track: Prisma.TrackGetPayload<{ select: typeof PROMOTED_TRACK_SELECT }>;
}

/**
 * Lo que se muestra en la primera fila ahora mismo.
 *
 * Se reaplican los filtros públicos sobre la pista: una promoción aprobada
 * no debe resucitar una canción que después se bloqueó por una denuncia.
 */
export async function getActivePromotions(): Promise<PromotedItem[]> {
  const now = new Date();

  const rows = await prisma.promotion.findMany({
    where: {
      status: 'ACTIVE',
      startsAt: { lte: now },
      endsAt: { gt: now },
      track: { status: 'APPROVED', isBlocked: false, artist: { isBlocked: false } },
    },
    orderBy: [{ position: 'asc' }, { startsAt: 'asc' }],
    select: {
      id: true,
      position: true,
      endsAt: true,
      track: { select: PROMOTED_TRACK_SELECT },
    },
  });

  return rows.map((row) => ({
    promotionId: row.id,
    position: row.position,
    endsAt: row.endsAt,
    track: row.track,
  }));
}

/**
 * Aprueba una solicitud y le da hueco en la fila.
 *
 * La posición nueva va al final de las activas. Reordenar es una acción
 * aparte y explícita del admin: colocar automáticamente una campaña recién
 * aprobada por encima de otra ya en marcha sería cambiar lo que otro
 * anunciante contrató sin que nadie lo decidiera.
 */
export async function approvePromotion(promotionId: string, adminId: string): Promise<void> {
  const promotion = await prisma.promotion.findUnique({
    where: { id: promotionId },
    select: { id: true, days: true, status: true },
  });
  if (!promotion) throw new Error('La promoción ya no existe');

  const last = await prisma.promotion.aggregate({
    where: { status: 'ACTIVE' },
    _max: { position: true },
  });

  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + promotion.days * 24 * 60 * 60 * 1000);

  await prisma.promotion.update({
    where: { id: promotionId },
    data: {
      status: 'ACTIVE',
      startsAt,
      endsAt,
      position: (last._max.position ?? -1) + 1,
      reviewedById: adminId,
      reviewedAt: new Date(),
      rejectionReason: null,
    },
  });
}

/**
 * Reordena la fila completa.
 *
 * Recibe los ids en el orden deseado y reescribe todas las posiciones en una
 * transacción. Actualizar de una en una dejaría estados intermedios con dos
 * campañas en la misma posición, y el orden que devolviera una lectura en
 * ese instante sería arbitrario.
 */
export async function reorderPromotions(orderedIds: string[]): Promise<void> {
  await prisma.$transaction(
    orderedIds.map((id, index) => prisma.promotion.update({ where: { id }, data: { position: index } })),
  );
}
