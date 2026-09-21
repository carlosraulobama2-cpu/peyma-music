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
    throw new ApiError('No se pudo conectar con el servidor. Revisa tu conexión.', 0, 'network_error');
  }

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await response.json().catch(() => undefined) : undefined;

  if (!response.ok) {
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
    throw new ApiError('No se pudo conectar con el servidor. Revisa tu conexión.', 0, 'network_error');
  }

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await response.json().catch(() => undefined) : undefined;

  if (!response.ok) {
    throw new ApiError(extractErrorMessage(data, response.status), response.status, (data as { code?: string })?.code);
  }
  return data as T;
}
