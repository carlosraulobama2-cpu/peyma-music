/**
 * Peyma Music API — Registro de altas fallidas
 *
 * Existe porque un alta que falla no deja ningún `User`: sin esta tabla, el
 * fallo es completamente invisible y no se distingue de "nadie intentó
 * registrarse". Es la única forma de responder cuántas cuentas fracasaron y
 * en qué paso.
 *
 * `record` NUNCA lanza, igual que la auditoría: un problema al registrar el
 * fallo no debe convertirse en un segundo error encima del que ya ocurrió.
 */
import type { Request } from 'express';
import type { SignupStage } from '@prisma/client';
import { prisma } from '../prismaClient';
import { logger } from '../logger';

export async function recordSignupFailure(
  req: Request,
  stage: SignupStage,
  reason: string,
  email?: string | null,
): Promise<void> {
  try {
    await prisma.signupAttempt.create({
      data: {
        // El correo se guarda para poder detectar a alguien que reintenta
        // muchas veces. Nunca se guarda la contraseña, ni siquiera hasheada:
        // no hace falta para diagnosticar y sería un dato sensible de más.
        email: email ?? null,
        stage,
        reason: reason.slice(0, 300),
        ipAddress: req.ip ?? null,
      },
    });
  } catch (error) {
    logger.error({ err: error, stage }, 'No se pudo registrar el intento de alta fallido');
  }
}
