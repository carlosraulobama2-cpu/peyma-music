import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { http, ApiError, getAuthToken, setAuthToken, clearAuthToken, onUnauthorized } from '../lib/httpClient';
import { AuthContext, AuthError, type AuthenticatedAdmin } from '../lib/authContext';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthenticatedAdmin | null>(null);
  /**
   * Sólo se "comprueba la sesión" si hay algo que comprobar.
   *
   * Leer `localStorage` es síncrono, así que se puede saber antes del primer
   * render. Arrancando siempre en `true` había que apagarlo desde el efecto
   * en el caso "no hay token", y eso es un set síncrono dentro del efecto:
   * un render en cascada y una pantalla de "Cargando…" que aparecía y
   * desaparecía sin que nadie estuviera cargando nada.
   */
  const [isLoading, setIsLoading] = useState(() => getAuthToken() !== null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    // Sin token no hay nada que comprobar: `isLoading` ya arrancó en false
    // (ver su `useState`), así que no hay ningún estado que tocar aquí.
    if (!getAuthToken()) return;

    http
      .get<{ user: AuthenticatedAdmin }>('/auth/me')
      .then(({ user }) => setUser(user))
      .catch((error) => {
        if (error instanceof ApiError && error.status === 401) clearAuthToken();
      })
      .finally(() => setIsLoading(false));
  }, []);

  /**
   * Si el token caduca con el panel abierto, el cliente HTTP ya lo borró y
   * avisa aquí. Sin esto quedaba una sesión imposible: el panel mostraba al
   * administrador dentro y cada acción fallaba.
   */
  useEffect(() => onUnauthorized(() => setUser(null)), []);

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
