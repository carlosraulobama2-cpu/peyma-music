/**
 * Peyma Music (web) — Cliente HTTP
 *
 * Mismo backend, mismo contrato JWT que la app móvil (ver
 * src/services/httpClient.ts del lado de Expo) — el token vive en
 * localStorage en vez de SecureStore porque acá no hay un keychain nativo,
 * pero el resto del comportamiento (adjuntar Bearer, traducir errores de
 * Zod) es idéntico.
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL;
if (!API_URL) {
  throw new Error("NEXT_PUBLIC_API_URL no está definida. Copia .env.example a .env.local.");
}

const TOKEN_KEY = "peyma-token";

/**
 * Aviso global de mantenimiento.
 *
 * Un emisor mínimo en vez de un contexto de React: esto lo dispara el
 * cliente HTTP, que no vive dentro del árbol de componentes y no puede
 * usar hooks.
 */
type MaintenanceListener = (message: string) => void;
const maintenanceListeners = new Set<MaintenanceListener>();

export function onMaintenance(listener: MaintenanceListener): () => void {
  maintenanceListeners.add(listener);
  return () => maintenanceListeners.delete(listener);
}

function notifyMaintenance(message: string): void {
  for (const listener of maintenanceListeners) listener(message);
}

/**
 * Aviso global de sesión caducada.
 *
 * El token dura 7 días y no se renueva, así que caduca tarde o temprano con
 * la app abierta. Hasta ahora sólo se miraba el 401 al restaurar la sesión
 * al arrancar: si caducaba a mitad de uso, cada pantalla fallaba con un
 * error genérico y la interfaz seguía diciendo que estabas dentro, con tu
 * nombre y tu avatar. Se borra el token y se avisa una sola vez, igual que
 * con el mantenimiento.
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

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/** `localStorage` no existe durante el render en el servidor (SSR/RSC) — todo lo que lo toca es cliente-only. */
function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function getAuthToken(): string | null {
  if (!isBrowser()) return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearAuthToken(): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(TOKEN_KEY);
}

interface ZodFlattenedError {
  fieldErrors?: Record<string, string[]>;
  formErrors?: string[];
}

function extractErrorMessage(data: unknown, status: number): string {
  if (data && typeof data === "object") {
    const body = data as { error?: string; details?: ZodFlattenedError };
    const firstFieldError = body.details?.fieldErrors
      ? Object.values(body.details.fieldErrors).flat()[0]
      : undefined;
    return firstFieldError ?? body.details?.formErrors?.[0] ?? body.error ?? `Error del servidor (${status})`;
  }
  return `Error del servidor (${status})`;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  skipAuth?: boolean;
  /** Para cancelar peticiones en curso (p. ej. al navegar rápido entre páginas) — igual que en la app. */
  signal?: AbortSignal;
}

async function request<T>(path: string, { method = "GET", body, skipAuth, signal }: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };

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
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError("No se pudo conectar con el servidor. Revisa tu conexión.", 0, "network_error");
  }

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await response.json().catch(() => undefined) : undefined;

  if (!response.ok) {
    const code = (data as { code?: string })?.code;

    /**
     * Mantenimiento: se avisa a TODA la app de una vez en vez de dejar que
     * cada pantalla muestre su propio error.
     *
     * Con quince llamadas fallando a la vez, quince mensajes de "no se pudo
     * cargar" no le dicen a nadie que la plataforma está en mantenimiento.
     * Un solo evento global permite mostrar una pantalla que lo explica.
     */
    if (response.status === 503 && code === 'maintenance_mode') {
      notifyMaintenance(extractErrorMessage(data, response.status));
    }

    /**
     * Un 401 con token es una sesión que ya no vale. Se excluye `skipAuth`
     * a propósito: el login devuelve 401 cuando la contraseña está mal, y
     * eso no es una sesión caducada sino un intento fallido.
     */
    if (response.status === 401 && !skipAuth && getAuthToken()) {
      clearAuthToken();
      notifyUnauthorized();
    }

    throw new ApiError(extractErrorMessage(data, response.status), response.status, code);
  }

  return data as T;
}

export const http = {
  get: <T>(path: string, options?: Omit<RequestOptions, "method" | "body">) => request<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">) =>
    request<T>(path, { ...options, method: "POST", body }),
  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">) =>
    request<T>(path, { ...options, method: "PATCH", body }),
  delete: <T>(path: string, options?: Omit<RequestOptions, "method" | "body">) =>
    request<T>(path, { ...options, method: "DELETE" }),
};

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/**
 * Subida de archivos (multipart) — misma forma de error que `request()`
 * (incluido el aviso de mantenimiento), a diferencia de la subida a pelo que
 * tenía antes `uploadPipeline.ts` con su propio `fetch` y un `Error` plano.
 *
 * NO se fija `Content-Type` a mano: el navegador tiene que generarlo con el
 * `boundary` del FormData, y ponerlo manualmente rompe el parseo del lado
 * del servidor. Mismo motivo que en la app y el panel.
 */
export async function uploadFile<T>(path: string, formData: FormData): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { method: "POST", headers, body: formData });
  } catch {
    throw new ApiError("No se pudo conectar con el servidor. Revisa tu conexión.", 0, "network_error");
  }

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await response.json().catch(() => undefined) : undefined;

  if (!response.ok) {
    const code = (data as { code?: string })?.code;
    if (response.status === 503 && code === "maintenance_mode") {
      notifyMaintenance(extractErrorMessage(data, response.status));
    }
    throw new ApiError(extractErrorMessage(data, response.status), response.status, code);
  }
  return data as T;
}
