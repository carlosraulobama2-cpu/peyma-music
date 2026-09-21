/**
 * Peyma Music API — Registro de auditoría del panel
 *
 * Cada acción con consecuencias (aprobar, rechazar, verificar, bloquear,
 * borrar, despublicar) deja una fila. Sólo se inserta: no hay ninguna ruta
 * que actualice ni borre de esta tabla, porque un log que se puede editar no
 * sirve como auditoría.
 *
 * `record` NUNCA lanza. Es deliberado: si guardar la bitácora fallara y eso
 * tumbara la petición, un problema de registro se convertiría en un fallo de
 * la operación real, y el admin vería un error después de que la acción ya
 * se aplicó. Se prefiere perder una línea de log (y dejar constancia en el
 * log del servidor) antes que romper la acción.
 */
import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../prismaClient';
import { logger } from '../logger';
import type { AuthRequest } from '../middleware/auth';

export interface AuditEntry {
  action: string;
  targetType: string;
  targetId?: string | null;
  targetLabel?: string | null;
  metadata?: Prisma.InputJsonValue;
}

/**
 * IP real del cliente.
 *
 * `app.set('trust proxy', 1)` ya hace que Express resuelva `req.ip` mirando
 * `X-Forwarded-For`, así que no hace falta parsear la cabecera a mano (y
 * hacerlo sería peor: confiar en ella sin el ajuste de proxy permite que
 * cualquiera falsifique su IP en el registro).
 */
function clientIp(req: Request): string | null {
  return req.ip ?? null;
}

export async function record(req: AuthRequest, entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: req.user?.id ?? null,
        // El email se guarda en texto además del id: si la cuenta se borra,
        // la fila tiene que seguir diciendo quién hizo qué.
        actorEmail: req.user?.email ?? 'desconocido',
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId ?? null,
        targetLabel: entry.targetLabel ?? null,
        ...(entry.metadata !== undefined && { metadata: entry.metadata }),
        ipAddress: clientIp(req),
      },
    });
  } catch (error) {
    logger.error({ err: error, entry }, 'No se pudo escribir en el registro de auditoría');
  }
}
