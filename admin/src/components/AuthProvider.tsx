import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { http, ApiError, getAuthToken, setAuthToken, clearAuthToken } from '../lib/httpClient';
import { AuthContext, AuthError, type AuthenticatedAdmin } from '../lib/authContext';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthenticatedAdmin | null>(null);
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
      .get<{ user: AuthenticatedAdmin }>('/auth/me')
      .then(({ user }) => setUser(user))
      .catch((error) => {
        if (error instanceof ApiError && error.status === 401) clearAuthToken();
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setIsSubmitting(true);
    try {
      const { user, token } = await http.post<{ user: AuthenticatedAdmin; token: string }>(
        '/auth/login',
        { email: email.trim().toLowerCase(), password },
        { skipAuth: true },
      );
      if (user.role !== 'ADMIN') {
        // El token NO se guarda: la sesión es válida para la app pública,
        // pero este origen es sólo el panel y dejarla a medias haría que al
        // recargar se viera "Cargando…" y otra vez el login, sin explicación.
        throw new AuthError('Esa cuenta existe, pero no tiene permisos de administrador.', 'forbidden');
      }
      setAuthToken(token);
      setUser(user);
    } catch (error) {
      if (error instanceof AuthError) throw error;
      // Se traduce el estado HTTP a una causa: la pantalla de login decide
      // qué decir y qué ofrecer según eso (ver LoginPage).
      if (error instanceof ApiError) {
        if (error.status === 0) throw new AuthError(error.message, 'network');
        if (error.status === 401) throw new AuthError(error.message, 'credentials');
        if (error.status === 429) throw new AuthError(error.message, 'rate-limited');
        throw new AuthError(error.message, 'server');
      }
      throw new AuthError('No se pudo iniciar sesión.', 'server');
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
