"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { http, ApiError, getAuthToken, setAuthToken, clearAuthToken } from "./httpClient";
import { GOOGLE_CLIENT_ID } from "./googleAuthConfig";
import { invalidateHomeFeed } from "./useHomeFeed";

export type Role = "USER" | "ARTIST" | "ADMIN";

export interface BackendUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  favoriteGenres: string[];
  role: Role;
  createdAt: string;
}

export class AuthError extends Error {}

interface AuthContextValue {
  user: BackendUser | null;
  /** Sesión todavía no resuelta (primer render / validando el token guardado). */
  isLoading: boolean;
  isSubmitting: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  /** `idToken` lo entrega el botón de Google (Google Identity Services) en el cliente — ver services/googleAuth.ts del backend para la verificación. */
  loginWithGoogle: (idToken: string) => Promise<void>;
  logout: () => Promise<void>;
  /**
   * Vuelve a leer el usuario del servidor.
   *
   * Hace falta tras editar el perfil: sin esto, la cabecera y el resto de
   * la app seguirían mostrando el nombre y el avatar viejos hasta recargar.
   */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function toAuthError(error: unknown, fallback: string): AuthError {
  if (error instanceof AuthError) return error;
  if (error instanceof ApiError) return new AuthError(error.message);
  return new AuthError(fallback);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<BackendUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      // Leyendo localStorage (un sistema externo), no derivando de props/estado
      // — no hay forma de evitar este set del lado de "no hay sesión guardada".
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsLoading(false);
      return;
    }
    http
      .get<{ user: BackendUser }>("/auth/me")
      .then(({ user }) => setUser(user))
      .catch((error) => {
        // Token vencido/inválido: no dejar una sesión fantasma en el cliente.
        if (error instanceof ApiError && error.status === 401) clearAuthToken();
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setIsSubmitting(true);
    try {
      const { user, token } = await http.post<{ user: BackendUser; token: string }>(
        "/auth/login",
        { email: email.trim().toLowerCase(), password },
        { skipAuth: true },
      );
      setAuthToken(token);
      setUser(user);
      // La portada cacheada es la del usuario anterior (o la anónima): trae
      // sus playlists y su historial. Se descarta al cambiar de cuenta.
      invalidateHomeFeed();
    } catch (error) {
      throw toAuthError(error, "No se pudo iniciar sesión.");
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  const register = useCallback(async (email: string, password: string, displayName: string) => {
    setIsSubmitting(true);
    try {
      const { user, token } = await http.post<{ user: BackendUser; token: string }>(
        "/auth/register",
        { email: email.trim().toLowerCase(), password, displayName: displayName.trim() },
        { skipAuth: true },
      );
      setAuthToken(token);
      setUser(user);
      // La portada cacheada es la del usuario anterior (o la anónima): trae
      // sus playlists y su historial. Se descarta al cambiar de cuenta.
      invalidateHomeFeed();
    } catch (error) {
      throw toAuthError(error, "No se pudo crear la cuenta.");
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  const loginWithGoogle = useCallback(async (idToken: string) => {
    setIsSubmitting(true);
    try {
      const { user, token } = await http.post<{ user: BackendUser; token: string }>(
        "/auth/google/token",
        { idToken },
        { skipAuth: true },
      );
      setAuthToken(token);
      setUser(user);
      // La portada cacheada es la del usuario anterior (o la anónima): trae
      // sus playlists y su historial. Se descarta al cambiar de cuenta.
      invalidateHomeFeed();
    } catch (error) {
      throw toAuthError(error, "No se pudo iniciar sesión con Google.");
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const { user: fresh } = await http.get<{ user: BackendUser }>('/auth/me');
      setUser(fresh);
    } catch {
      // Token caducado o sin red: se deja el usuario que había. Cerrar la
      // sesión por un fallo de refresco sería peor que mostrar datos de
      // hace un momento.
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await http.post("/auth/logout");
    } catch {
      // JWT sin estado: no hay sesión de servidor que bloquee el logout local.
    }
    clearAuthToken();
    setUser(null);
    invalidateHomeFeed();
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, isSubmitting, login, register, loginWithGoogle, logout, refresh }}>
      {/* GoogleOAuthProvider tolera un clientId vacío (no revienta al montar) —
          sólo falla al intentar usar de verdad el botón, y eso ya está
          cubierto por isGoogleSignInConfigured() en las pantallas. */}
      <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>{children}</GoogleOAuthProvider>
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth() debe usarse dentro de <AuthProvider>");
  return ctx;
}
