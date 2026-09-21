import type { Request, Response, NextFunction } from 'express';
import type { Role } from '@prisma/client';
import { verifyToken, extractTokenFromHeader } from '../utils/auth';
import { prisma } from '../prismaClient';
import { ForbiddenError, UnauthorizedError } from '../utils/errors';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    displayName: string;
    role: Role;
  };
}

/** Requiere una sesión válida; rechaza con 401 si no la hay. */
export const authMiddleware = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const token = extractTokenFromHeader(req.headers.authorization);
    if (!token) throw new UnauthorizedError('No se envió token de sesión');

    const decoded = verifyToken(token);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, displayName: true, role: true },
    });

    if (!user) throw new UnauthorizedError('El usuario de este token ya no existe');

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Igual que `authMiddleware` pero acepta además `?token=` en la query.
 *
 * Sólo para rutas que un elemento multimedia del navegador tiene que poder
 * pedir por sí mismo: `<audio src>` y `<img src>` no pueden mandar la
 * cabecera `Authorization`. NO se usa como middleware general, porque un
 * token en la URL acaba en logs de acceso, en el historial y en la cabecera
 * `Referer`. Para todo lo demás sigue valiendo sólo la cabecera.
 */
export const authFromHeaderOrQuery = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const headerToken = extractTokenFromHeader(req.headers.authorization);
    const queryToken = typeof req.query.token === 'string' ? req.query.token : null;
    const token = headerToken ?? queryToken;
    if (!token) throw new UnauthorizedError('No se envió token de sesión');

    const decoded = verifyToken(token);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, displayName: true, role: true },
    });

    if (!user) throw new UnauthorizedError('El usuario de este token ya no existe');

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

/** Va DESPUÉS de `authMiddleware` en la cadena — asume que `req.user` ya existe. */
export const requireRole = (...roles: Role[]) => {
  return (req: AuthRequest, _res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      next(new ForbiddenError('No tienes permiso para hacer esto'));
      return;
    }
    next();
  };
};

/** Adjunta el usuario si hay token válido, pero no bloquea la petición si no lo hay. */
export const optionalAuthMiddleware = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  const token = extractTokenFromHeader(req.headers.authorization);
  if (!token) {
    next();
    return;
  }

  try {
    const decoded = verifyToken(token);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, displayName: true, role: true },
    });
    if (user) req.user = user;
  } catch (error) {
    // Token presente pero inválido/expirado: se trata como anónimo en vez de
    // romper una ruta pública. Se deja constancia para poder monitorear abuso.
    console.warn('[auth] Token opcional inválido, continuando como anónimo:', error);
  }
  next();
};
