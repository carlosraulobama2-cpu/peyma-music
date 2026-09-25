/**
 * Peyma Music (web) — Datos de la portada pública
 *
 * La portada la ve gente sin cuenta, así que se sirve desde el servidor y
 * tira del MISMO endpoint agregado que usa Inicio (`GET /api/home`). Ese
 * endpoint va con `optionalAuthMiddleware`: sin token devuelve lo público
 * (tendencias, novedades, artistas) y omite lo personal. No hace falta un
 * endpoint de marketing aparte, que acabaría mostrando un catálogo distinto
 * al real en cuanto alguien tocara uno de los dos.
 *
 * Regla de esta capa: **nunca tirar la página**. Si el backend está caído,
 * lento o el catálogo está vacío, se devuelve una vitrina vacía y la portada
 * se dibuja igual sin la parte de catálogo. Una web de marketing que
 * devuelve 500 porque la API no contesta pierde justo a quien venía a
 * registrarse.
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL;

/** Cuánto se reutiliza la respuesta antes de volver a pedirla. */
const REVALIDATE_SECONDS = 300;

/**
 * Tope de espera. No aborta la petición (un `signal` desactiva la caché de
 * `fetch` en Next), sólo deja de esperarla: la portada se pinta sin
 * catálogo en vez de quedarse colgada del backend.
 *
 * Es holgado a propósito. Esta página se prerenderiza y se revalida en
 * segundo plano, así que esperar unos segundos de más no se lo come ningún
 * visitante — pero quedarse corto sí tiene coste visible: con un tope de
 * 3,5 s, un arranque en frío de la base (`/api/home` hace varias consultas y
 * un `$queryRaw`) llegaba tarde y la portada se publicaba sin catálogo
 * durante todo el ciclo de revalidación, en silencio.
 */
const TIMEOUT_MS = 10_000;

export interface LandingTrack {
  id: string;
  title: string;
  coverUrl: string | null;
  genre: string | null;
  artist: { id: string; name: string; isVerified: boolean };
}

export interface LandingArtist {
  id: string;
  name: string;
  imageUrl: string | null;
  isVerified: boolean;
  listeners: number;
}

export interface LandingShowcase {
  tracks: LandingTrack[];
  artists: LandingArtist[];
}

const VITRINA_VACIA: LandingShowcase = { tracks: [], artists: [] };

/** Forma parcial de `GET /api/home` — sólo lo que la portada usa. */
interface HomeResponse {
  rows?: { key?: unknown; tracks?: unknown }[];
  artists?: unknown[];
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null;
}

/**
 * Normaliza una pista del feed.
 *
 * Se valida campo a campo en vez de confiar en el tipo: esto viene de la
 * red, y una fila a medias (una portada nula, un artista sin nombre) tiene
 * que caerse sola sin arrastrar a las demás.
 */
function aTrack(valor: unknown): LandingTrack | null {
  if (!esObjeto(valor)) return null;
  const { id, title, coverUrl, genre, artist } = valor;
  if (typeof id !== 'string' || typeof title !== 'string') return null;
  if (!esObjeto(artist) || typeof artist.name !== 'string') return null;

  return {
    id,
    title,
    coverUrl: typeof coverUrl === 'string' && coverUrl.length > 0 ? coverUrl : null,
    genre: typeof genre === 'string' && genre.length > 0 ? genre : null,
    artist: {
      id: typeof artist.id === 'string' ? artist.id : '',
      name: artist.name,
      isVerified: artist.isVerified === true,
    },
  };
}

function aArtist(valor: unknown): LandingArtist | null {
  if (!esObjeto(valor)) return null;
  const { id, name, imageUrl, isVerified, listeners } = valor;
  if (typeof id !== 'string' || typeof name !== 'string') return null;

  return {
    id,
    name,
    imageUrl: typeof imageUrl === 'string' && imageUrl.length > 0 ? imageUrl : null,
    isVerified: isVerified === true,
    listeners: typeof listeners === 'number' && Number.isFinite(listeners) ? listeners : 0,
  };
}

/** Quita repetidos por `id` conservando el orden de llegada. */
function sinRepetidos<T extends { id: string }>(items: T[]): T[] {
  const vistos = new Set<string>();
  return items.filter((item) => (vistos.has(item.id) ? false : (vistos.add(item.id), true)));
}

export async function fetchLandingShowcase(): Promise<LandingShowcase> {
  if (!API_URL) return VITRINA_VACIA;

  let payload: HomeResponse;
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  try {
    const respuesta = await Promise.race([
      fetch(`${API_URL}/home`, {
        headers: { Accept: 'application/json' },
        next: { revalidate: REVALIDATE_SECONDS },
      }),
      // Se guarda el identificador para cancelarlo en el `finally`: si no, el
      // temporizador mantiene vivo el bucle de eventos y el build tarda en
      // cerrar aunque la respuesta haya llegado en el primer segundo.
      new Promise<null>((resolve) => {
        temporizador = setTimeout(() => resolve(null), TIMEOUT_MS);
      }),
    ]);

    if (!respuesta || !respuesta.ok) return VITRINA_VACIA;
    payload = (await respuesta.json()) as HomeResponse;
  } catch {
    // Backend caído, DNS, TLS, JSON roto… da igual cuál: la portada no
    // depende de esto para cumplir su trabajo.
    return VITRINA_VACIA;
  } finally {
    clearTimeout(temporizador);
  }

  // Se prefieren las tendencias y se completa con novedades: en un catálogo
  // recién estrenado todavía no hay escuchas, y una vitrina vacía se lee
  // como "esto no tiene música", que es lo contrario de lo que se quiere
  // transmitir en la página de entrada.
  const filas = Array.isArray(payload.rows) ? payload.rows : [];
  const porClave = (clave: string) => {
    const fila = filas.find((row) => row?.key === clave);
    return Array.isArray(fila?.tracks) ? fila.tracks : [];
  };

  const tracks = sinRepetidos(
    [...porClave('trending'), ...porClave('new')].map(aTrack).filter((track): track is LandingTrack => track !== null),
  );

  const artists = (Array.isArray(payload.artists) ? payload.artists : [])
    .map(aArtist)
    .filter((artist): artist is LandingArtist => artist !== null);

  return { tracks, artists };
}
