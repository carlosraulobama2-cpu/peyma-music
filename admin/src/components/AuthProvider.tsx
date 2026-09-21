import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { http, ApiError, getAuthToken, setAuthToken, clearAuthToken } from '../lib/httpClient';
import { AuthContext, AuthError, type AdminUser } from '../lib/authContext';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      // Leyendo localStorage (sistema externo) — no hay forma de evitar este
      // set del lado de "no hay sesión guardada".
      // oxlint-disable-next-line react/set-state-in-effect
      setIsLoading(false);
      return;
    }
    http
      .get<{ user: AdminUser }>('/auth/me')
      .then(({ user }) => setUser(user))
      .catch((error) => {
        if (error instanceof ApiError && error.status === 401) clearAuthToken();
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setIsSubmitting(true);
    try {
      const { user, token } = await http.post<{ user: AdminUser; token: string }>(
        '/auth/login',
        { email: email.trim().toLowerCase(), password },
        { skipAuth: true },
      );
      if (user.role !== 'ADMIN') {
        throw new AuthError('Esta cuenta no tiene permisos de administrador.');
      }
      setAuthToken(token);
      setUser(user);
    } catch (error) {
      if (error instanceof AuthError) throw error;
      if (error instanceof ApiError) throw new AuthError(error.message);
      throw new AuthError('No se pudo iniciar sesión.');
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await http.post('/auth/logout');
    } catch {
      // JWT sin estado: no bloquea el logout local un fallo de red.
    }
    clearAuthToken();
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, isLoading, isSubmitting, login, logout }}>{children}</AuthContext.Provider>;
}
