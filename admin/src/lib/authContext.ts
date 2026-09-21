import { createContext } from 'react';

export type Role = 'USER' | 'ARTIST' | 'ADMIN';

export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
}

/**
 * Por qué falló el inicio de sesión.
 *
 * El mensaje suelto no alcanza: "correo o contraseña incorrectos" y "llevás
 * 20 intentos, esperá unos minutos" piden respuestas distintas de la
 * interfaz, y una cuenta que existe pero no es administradora no es un error
 * de tipeo — decirle "revisá la contraseña" manda a la persona a probar de
 * nuevo algo que nunca va a funcionar.
 */
export type AuthErrorKind =
  /** Correo o contraseña que no coinciden. */
  | 'credentials'
  /** La cuenta existe y la clave es correcta, pero no tiene rol ADMIN. */
  | 'forbidden'
  /** El backend cortó por exceso de intentos (429). */
  | 'rate-limited'
  /** No se llegó al servidor. */
  | 'network'
  /** Cualquier otra cosa: 5xx, respuesta inesperada. */
  | 'server';

export class AuthError extends Error {
  readonly kind: AuthErrorKind;

  constructor(message: string, kind: AuthErrorKind = 'server') {
    super(message);
    this.name = 'AuthError';
    this.kind = kind;
  }
}

export interface AuthContextValue {
  user: AdminUser | null;
  isLoading: boolean;
  isSubmitting: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
