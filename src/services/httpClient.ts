/**
 * Peyma Music — Cliente HTTP
 *
 * Único punto de contacto real con el backend (Express/Prisma/Neon): arma la
 * URL a partir de `EXPO_PUBLIC_API_URL`, adjunta el JWT guardado en
 * SecureStore y traduce el formato de error del middleware central del
 * backend (`{error, code?, details?}`) a algo que las pantallas puedan
 * mostrar directo.
 */
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'peyma-token';

const API_URL = process.env.EXPO_PUBLIC_API_URL;
if (!API_URL) {
  throw new Error('EXPO_PUBLIC_API_URL no está definida. Copia .env.example a .env y reinicia Expo.');
}

/**
 * Aviso global de mantenimiento.
 *
 * Un emisor mínimo y no un store de Zustand: esto lo dispara el cliente
 * HTTP, que se importa desde sitios sin árbol de React, y añadir una
 * dependencia del store aquí crearía un ciclo de importación.
 */
type MaintenanceListener = (message: string) => void;
const maintenanceListeners = new Set<MaintenanceListener>();

export function onMaintenance(listener: MaintenanceListener): () => void {
  maintenanceListeners.add(listener);
  return () => {
    maintenanceListeners.delete(listener);
  };
}

function notifyMaintenance(message: string): void {
  for (const listener of maintenanceListeners) listener(message);
}

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export const getAuthToken = (): Promise<string | null> => SecureStore.getItemAsync(TOKEN_KEY);
export const setAuthToken = (token: string): Promise<void> => SecureStore.setItemAsync(TOKEN_KEY, token);
export const clearAuthToken = (): Promise<void> => SecureStore.deleteItemAsync(TOKEN_KEY);

/**
 * Aviso global de sesión caducada.
 *
 * El token dura 7 días y no se renueva. Hasta ahora sólo se miraba el 401 al
 * restaurar la sesión al arrancar: si caducaba con la app abierta, cada
 * pantalla fallaba con un error genérico y la interfaz seguía mostrando la
 * sesión iniciada, con su nombre y su avatar. El store se suscribe aquí para
 * cerrarla de verdad.
 */
type UnauthorizedListener = () => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

export function onUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

function notifyUnauthorized(): void {
  for (const listener of unauthorizedListeners) listener();
}

interface ZodFlattenedError {
  fieldErrors?: Record<string, string[]>;
  formErrors?: string[];
}

/**
 * El validador central del backend devuelve `{error: 'Validación fallida',
 * details: err.flatten()}` para cualquier body inválido — sin esto, la UI
 * sólo mostraría el genérico "Validación fallida" en vez del motivo real
 * (p. ej. "La contraseña debe tener al menos 8 caracteres").
 */
function extractErrorMessage(data: unknown, status: number): string {
  if (data && typeof data === 'object') {
    const body = data as { error?: string; details?: ZodFlattenedError };
    const firstFieldError = body.details?.fieldErrors
      ? Object.values(body.details.fieldErrors).flat()[0]
      : undefined;
    return firstFieldError ?? body.details?.formErrors?.[0] ?? body.error ?? `Error del servidor (${status})`;
  }
  return `Error del servidor (${status})`;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  /** Login/registro/Google: todavía no hay token que adjuntar. */
  skipAuth?: boolean;
}

async function request<T>(path: string, { method = 'GET', body, signal, skipAuth }: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (!skipAuth) {
    const token = await getAuthToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError('No se pudo conectar con el servidor. Revisa tu conexión.', 0, 'network_error');
  }

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await response.json().catch(() => undefined) : undefined;

  if (!response.ok) {
    const code = (data as { code?: string })?.code;

    /**
     * Mantenimiento: se avisa a TODA la app de una vez en vez de dejar que
     * cada pantalla muestre su propio error. Con varias llamadas fallando
     * a la vez, varios "no se pudo cargar" no le dicen a nadie que la
     * plataforma está en mantenimiento.
     */
    if (response.status === 503 && code === 'maintenance_mode') {
      notifyMaintenance(extractErrorMessage(data, response.status));
    }

    /**
     * Un 401 con token es una sesión que ya no vale. `skipAuth` queda
     * fuera: el login devuelve 401 con la contraseña mal, y eso no es una
     * sesión caducada sino un intento fallido.
     */
    if (response.status === 401 && !skipAuth) {
      notifyUnauthorized();
    }

    throw new ApiError(extractErrorMessage(data, response.status), response.status, code);
  }

  return data as T;
}

export const http = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) => request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) => request<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) => request<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) => request<T>(path, { ...options, method: 'DELETE' }),
};

/** `true` cuando el error viene de un `AbortController.abort()` — nunca es un fallo real. */
/**
 * 409 — el recurso ya existe en el estado que se pedía crear.
 *
 * Quien llama suele querer tratarlo como éxito (añadir a una playlist una
 * canción que ya estaba deja la playlist como se quería), y distinguirlo por
 * el texto del mensaje sería frágil.
 */
export function isConflictError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/**
 * Subida de archivos (multipart).
 *
 * NO se fija `Content-Type` a mano: el runtime tiene que generarlo con el
 * `boundary` del FormData, y ponerlo manualmente rompe el parseo del lado
 * del servidor. Es el mismo motivo que en la web y en el panel.
 */
export async function uploadFile<T>(path: string, formData: FormData): Promise<T> {
  const token = await getAuthToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { method: 'POST', headers, body: formData });
  } catch {
    throw new ApiError('No se pudo conectar con el servidor. Revisa tu conexión.', 0, 'network_error');
  }

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await response.json().catch(() => undefined) : undefined;

  if (!response.ok) {
    // Aquí siempre se va autenticado: un 401 es la sesión, no las credenciales.
    if (response.status === 401) notifyUnauthorized();
    throw new ApiError(extractErrorMessage(data, response.status), response.status, (data as { code?: string })?.code);
  }
  return data as T;
}
