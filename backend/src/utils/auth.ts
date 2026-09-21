import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { UnauthorizedError } from './errors';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '7d';
const BCRYPT_ROUNDS = 12;

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  // Fallar rápido en el arranque es mejor que firmar tokens con un secreto
  // débil y descubrirlo en producción cuando alguien los falsifique.
  throw new Error(
    'JWT_SECRET no está definido o es demasiado corto (mínimo 32 caracteres). Revisa tu archivo .env.',
  );
}

export interface JwtPayload {
  userId: string;
  email: string;
}

export const hashPassword = async (password: string): Promise<string> => {
  const salt = await bcrypt.genSalt(BCRYPT_ROUNDS);
  return bcrypt.hash(password, salt);
};

export const comparePassword = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};

export const generateToken = (payload: JwtPayload): string => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

export const verifyToken = (token: string): JwtPayload => {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    throw new UnauthorizedError('Token inválido o expirado');
  }
};

export const extractTokenFromHeader = (authHeader: string | undefined): string | null => {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
};
