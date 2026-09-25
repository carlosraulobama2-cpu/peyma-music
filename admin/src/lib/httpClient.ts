/**
 * Peyma Music (panel admin) — Cliente HTTP
 *
 * Mismo backend, mismo contrato JWT que la app móvil y `web/` — ver
 * src/services/httpClient.ts (Expo) y web/src/lib/httpClient.ts (Next.js).
 * Acá el token vive en localStorage propio de este origen (puerto 5173):
 * no se comparte con `web/` (localStorage es por origen), así que este
 * panel tiene su propio login aunque pegue al mismo backend.
 */
const API_URL = import.meta.env.VITE_API_URL as string | undefined;
if (!API_URL) {
  throw new Error('VITE_API_URL no está definida. Copia .env.example a .env.');
}

const TOKEN_KEY = 'peyma-admin-token';

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

export const getAuthToken = (): string | null => localStorage.getItem(TOKEN_KEY);
export const setAuthToken = (token: string): void => localStorage.setItem(TOKEN_KEY, token);
export const clearAuthToken = (): void => localStorage.removeItem(TOKEN_KEY);

/**
 * Aviso global de sesión caducada.
 *
 * El token dura 7 días y no se renueva. Hasta ahora sólo se miraba el 401 al
 * restaurar la sesión al arrancar: si caducaba con el panel ya abierto, cada
 * pantalla fallaba con un error genérico y la interfaz seguía mostrando al
 * administrador dentro. Se borra el token y se avisa una vez.
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

function extractErrorMessage(data: unknown, status: number): string {
  if (data && typeof data === 'object') {
    const body = data as { error?: string; details?: ZodFlattenedError };
    const firstFieldError = body.details?.fieldErrors ? Object.values(body.details.fieldErrors).flat()[0] : undefined;
    return firstFieldError ?? body.details?.formErrors?.[0] ?? body.error ?? `Error del servidor (${status})`;
  }
  return `Error del servidor (${status})`;
}

/**
 * Error de "no llegué al servidor".
 *
 * El navegador lanza el MISMO TypeError si la API está apagada y si la
 * respuesta llegó pero CORS la bloqueó — por seguridad no revela cuál de
 * las dos fue. Como no se pueden distinguir desde aquí, el mensaje nombra
 * la URL a la que se intentó llegar y el origen desde el que se llamó: con
 * eso se ve de un vistazo si el puerto o el host son los esperados, que es
 * la causa habitual (Vite mudándose a 5174, o abrir el panel por
 * 127.0.0.1 cuando CORS sólo permite localhost).
 */
function unreachableError(): ApiError {
  const origen = typeof window !== 'undefined' ? window.location.origin : 'este origen';
  return new ApiError(
    `No se pudo contactar con la API en ${API_URL}. Comprobá que esté levantada y que ${origen} figure en CORS_ORIGINS del backend.`,
    0,
    'network_error',
  );
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  skipAuth?: boolean;
}

async function request<T>(path: string, { method = 'GET', body, skipAuth }: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!skipAuth) {
    const token = getAuthToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw unreachableError();
  }

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await response.json().catch(() => undefined) : undefined;

  if (!response.ok) {
    // Un 401 con token es una sesión que ya no vale. `skipAuth` queda fuera:
    // el login devuelve 401 con la contraseña mal, y eso no es caducidad.
    if (response.status === 401 && !skipAuth && getAuthToken()) {
      clearAuthToken();
      notifyUnauthorized();
    }

    throw new ApiError(extractErrorMessage(data, response.status), response.status, (data as { code?: string })?.code);
  }
  return data as T;
}

export const http = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) => request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'PUT', body }),
  delete: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'DELETE' }),
};

/**
 * Subida de archivos (multipart). NO se fija `Content-Type` a mano: el
 * navegador tiene que generarlo con el `boundary` del FormData, y ponerlo
 * manualmente rompe el parseo del lado del servidor.
 */
export async function uploadFile<T>(path: string, formData: FormData): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { method: 'POST', headers, body: formData });
  } catch {
    throw unreachableError();
  }

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await response.json().catch(() => undefined) : undefined;

  if (!response.ok) {
    // Un 401 aquí siempre es la sesión: esta función va siempre autenticada.
    if (response.status === 401 && getAuthToken()) {
      clearAuthToken();
      notifyUnauthorized();
    }

    throw new ApiError(extractErrorMessage(data, response.status), response.status, (data as { code?: string })?.code);
  }
  return data as T;
}
