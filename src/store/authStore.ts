/**
 * Peyma Music — Auth Store (Zustand)
 * Sesión de usuario contra el backend real (JWT). El token vive en SecureStore
 * (cifrado); `user` se cachea en AsyncStorage sólo para pintar la UI al
 * instante en el siguiente arranque — `isAuthenticated` nunca se persiste,
 * siempre se deriva del token real, así no hay un frame mostrando una sesión
 * que en realidad ya expiró o fue revocada.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User, AccountType } from '../types';
import { http, ApiError, getAuthToken, setAuthToken, clearAuthToken } from '../services/httpClient';
import { useLibraryStore } from './libraryStore';

export class AuthError extends Error {}

/**
 * La biblioteca (favoritos, seguidos, playlists) pertenece a la cuenta, no al
 * teléfono, así que sigue al ciclo de vida de la sesión: se trae del servidor
 * al entrar y se borra al salir.
 *
 * Se llama sin `await` a propósito: el login no debe quedarse esperando a que
 * carguen tres listas. Si falla, `syncFromServer` conserva lo que ya hubiera.
 */
function adoptSessionLibrary(): void {
  void useLibraryStore.getState().syncFromServer().catch(() => {});
}

function dropSessionLibrary(): void {
  useLibraryStore.getState().clearAccountData();
}

/** Forma exacta de `PUBLIC_USER_SELECT` en backend/src/routes/auth.ts. */
interface BackendUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  favoriteGenres: string[];
  createdAt: string;
}

interface AuthStore {
  user: User | null;
  isAuthenticated: boolean;
  /** Sólo cubre `loadStoredSession`, para la pantalla de arranque. */
  isLoading: boolean;
  /** Cubre login/register, independiente del arranque. */
  isSubmitting: boolean;
  token: string | null;

  login: (email: string, password: string) => Promise<void>;
  /**
   * `acceptedTerms` es obligatorio y sin valor por defecto: el backend lo
   * exige (`registerSchema`) y dejarlo opcional aquí permitiría que una
   * pantalla nueva olvidara pedirlo y el alta fallara en producción con un
   * 400 en vez de no compilar.
   */
  register: (input: {
    email: string;
    password: string;
    displayName: string;
    favoriteGenres?: string[];
    acceptedTerms: boolean;
  }) => Promise<void>;
  /**
   * `acceptedTerms` sólo hace falta cuando la llamada puede crear la cuenta
   * (el botón desde la pantalla de alta). Desde el login se omite: si la
   * cuenta no existe, el backend responde con el código `terms_required`.
   */
  loginWithGoogle: (idToken: string, acceptedTerms?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  loadStoredSession: () => Promise<void>;
  /** Parches locales al perfil (cambiar a cuenta de artista, editar nombre, etc.) — no todo campo del `User` local vive en el backend. */
  updateUser: (patch: Partial<User>) => void;
}

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

function assertValidEmail(email: string): void {
  if (!EMAIL_PATTERN.test(email)) throw new AuthError('Ingresa un correo electrónico válido.');
}

/** El backend acepta cualquier contraseña no vacía al loguear — la cuenta ya existe, no hay nada que "validar" localmente más que evitar un submit vacío. */
function assertLoginPassword(password: string): void {
  if (password.length === 0) throw new AuthError('Ingresa tu contraseña.');
}

/** Mismo mínimo que `registerSchema` en el backend — mejor avisar antes de gastar una llamada de red que dejar que el 400 de Zod sea la primera noticia. */
function assertRegisterCredentials(password: string, displayName: string): void {
  if (password.length < 8) throw new AuthError('La contraseña debe tener al menos 8 caracteres.');
  if (displayName.trim().length < 2) throw new AuthError('Ingresa un nombre de al menos 2 caracteres.');
}

/** `accountType` no existe en el backend (es un concepto sólo de la app, ver `become-artist.tsx`) — se preserva el que ya tenía la sesión local, si había una. */
function mapBackendUser(backendUser: BackendUser, previousAccountType?: AccountType): User {
  return {
    id: backendUser.id,
    displayName: backendUser.displayName,
    email: backendUser.email,
    avatarUrl: backendUser.avatarUrl ?? undefined,
    favoriteGenres: backendUser.favoriteGenres,
    createdAt: backendUser.createdAt,
    accountType: previousAccountType ?? 'listener',
  };
}

function toAuthError(error: unknown, fallback: string): AuthError {
  if (error instanceof AuthError) return error;
  if (error instanceof ApiError) return new AuthError(error.message);
  return new AuthError(fallback);
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      isSubmitting: false,
      token: null,

      login: async (email, password) => {
        assertValidEmail(email);
        assertLoginPassword(password);
        set({ isSubmitting: true });
        try {
          const { user, token } = await http.post<{ user: BackendUser; token: string }>(
            '/auth/login',
            { email: email.trim().toLowerCase(), password },
            { skipAuth: true },
          );
          await setAuthToken(token);
          set({ user: mapBackendUser(user), isAuthenticated: true, token, isSubmitting: false });
          adoptSessionLibrary();
        } catch (error) {
          set({ isSubmitting: false });
          throw toAuthError(error, 'No se pudo iniciar sesión.');
        }
      },

      register: async ({ email, password, displayName, favoriteGenres, acceptedTerms }) => {
        assertValidEmail(email);
        assertRegisterCredentials(password, displayName);
        // Se corta antes de la red: el backend lo rechazaría igual, pero el
        // mensaje llegaría como un error de validación genérico en vez de
        // decir exactamente qué falta.
        if (!acceptedTerms) throw new AuthError('Tenés que aceptar los términos y la política de privacidad.');
        set({ isSubmitting: true });
        try {
          const { user, token } = await http.post<{ user: BackendUser; token: string }>(
            '/auth/register',
            {
              email: email.trim().toLowerCase(),
              password,
              displayName: displayName.trim(),
              favoriteGenres,
              acceptedTerms: true,
            },
            { skipAuth: true },
          );
          await setAuthToken(token);
          set({ user: mapBackendUser(user), isAuthenticated: true, token, isSubmitting: false });
          adoptSessionLibrary();
        } catch (error) {
          set({ isSubmitting: false });
          throw toAuthError(error, 'No se pudo crear la cuenta.');
        }
      },

      /** El id_token lo entrega el SDK nativo de Google en el cliente — ver services/googleAuth.ts del lado del backend para la verificación. */
      loginWithGoogle: async (idToken, acceptedTerms) => {
        set({ isSubmitting: true });
        try {
          const { user, token } = await http.post<{ user: BackendUser; token: string }>(
            '/auth/google/token',
            { idToken, ...(acceptedTerms ? { acceptedTerms: true } : {}) },
            { skipAuth: true },
          );
          await setAuthToken(token);
          set({ user: mapBackendUser(user), isAuthenticated: true, token, isSubmitting: false });
          adoptSessionLibrary();
        } catch (error) {
          set({ isSubmitting: false });
          // `terms_required` significa que esa cuenta de Google todavía no
          // existe acá, así que entrar con ella sería un alta. Se traduce a
          // algo accionable: desde la pantalla de login no hay ninguna
          // casilla de términos que marcar.
          if (error instanceof ApiError && error.code === 'terms_required') {
            throw new AuthError('No hay ninguna cuenta con ese Google todavía. Creala desde "Empieza aquí" y aceptá los términos.');
          }
          throw toAuthError(error, 'No se pudo iniciar sesión con Google.');
        }
      },

      updateUser: (patch) =>
        set((state) => (state.user ? { user: { ...state.user, ...patch } } : state)),

      logout: async () => {
        try {
          await http.post('/auth/logout');
        } catch (error) {
          // JWT sin estado: no hay razón para bloquear el logout local por
          // un fallo de red o un token ya vencido del lado del servidor.
          console.error('[authStore] Logout en el servidor falló (se cierra igual localmente):', error);
        }
        await clearAuthToken();
        set({ user: null, isAuthenticated: false, token: null });
        dropSessionLibrary();
      },

      loadStoredSession: async () => {
        set({ isLoading: true });
        const token = await getAuthToken().catch(() => null);
        if (!token) {
          set({ isAuthenticated: false, token: null, isLoading: false });
          return;
        }

        try {
          const { user } = await http.get<{ user: BackendUser }>('/auth/me');
          set({ user: mapBackendUser(user, get().user?.accountType), isAuthenticated: true, token, isLoading: false });
          adoptSessionLibrary();
        } catch (error) {
          if (error instanceof ApiError && error.status === 401) {
            // Token realmente inválido/expirado: ahí sí hay que cerrar la sesión.
            await clearAuthToken();
            set({ user: null, isAuthenticated: false, token: null, isLoading: false });
            dropSessionLibrary();
            return;
          }
          // Sin red u otro fallo transitorio: seguir con la sesión cacheada
          // en vez de deslogear a alguien sólo porque no hay conexión al abrir la app.
          set((state) => ({ isAuthenticated: Boolean(state.user), token, isLoading: false }));
        }
      },
    }),
    {
      name: 'peyma-auth',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ user: state.user }),
    },
  ),
);
