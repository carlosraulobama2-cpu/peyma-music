/**
 * Peyma Music — Radio en vivo (Radio Browser)
 *
 * Radio Browser (radio-browser.info) es una base comunitaria y gratuita de
 * estaciones de radio de internet: sin API key, sin límite de uso. No hay
 * un servidor central único — la comunidad mantiene varios espejos
 * independientes — así que cada pedido prueba una lista corta de espejos
 * conocidos EN ORDEN y se queda con el primero que responda. Son máquinas
 * voluntarias: que una esté caída no debería tumbar la función.
 *
 * Esto es contenido de TERCEROS que Peyma no aloja ni modera: cada estación
 * transmite lo que decida su propio dueño. No pasa por `streamTracker` (no
 * son reproducciones del catálogo propio) ni por el proxy del backend (no
 * hay nada que moderar del lado de Peyma) — ver `isRadioTrack` en
 * `playerStore`.
 */
import type { Track } from '../types';
import { http } from './httpClient';

const MIRRORS = [
  'https://de1.api.radio-browser.info',
  'https://de2.api.radio-browser.info',
  'https://nl1.api.radio-browser.info',
  'https://at1.api.radio-browser.info',
];

const REQUEST_TIMEOUT_MS = 6000;

export interface RadioStation {
  id: string;
  name: string;
  streamUrl: string;
  favicon: string | null;
  tags: string[];
  countryCode: string;
  bitrate: number;
  codec: string;
  clickCount: number;
}

interface RawStation {
  stationuuid: string;
  name: string;
  url_resolved: string;
  url: string;
  favicon: string;
  tags: string;
  countrycode: string;
  bitrate: number;
  codec: string;
  clickcount: number;
}

function mapStation(raw: RawStation): RadioStation {
  return {
    id: raw.stationuuid,
    name: raw.name?.trim() || 'Radio sin nombre',
    streamUrl: raw.url_resolved || raw.url,
    favicon: raw.favicon || null,
    tags: raw.tags
      ? raw.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
      : [],
    countryCode: raw.countrycode,
    bitrate: raw.bitrate,
    codec: raw.codec,
    clickCount: raw.clickcount,
  };
}

function buildQuery(params?: Record<string, string | number | boolean>): string {
  if (!params) return '';
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '');
  if (entries.length === 0) return '';
  return '?' + entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&');
}

/** Prueba los espejos en orden; el primero que responda gana. Si ninguno contesta, se propaga el último error para poder mostrar un mensaje real. */
async function radioFetch<T>(path: string, params?: Record<string, string | number | boolean>): Promise<T> {
  const query = buildQuery(params);
  let lastError: unknown;

  for (const mirror of MIRRORS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(`${mirror}${path}${query}`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`Radio Browser respondió ${res.status}`);
      return (await res.json()) as T;
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('No se pudo contactar ningún espejo de Radio Browser.');
}

const SEARCH_DEFAULTS = { hidebroken: true, order: 'clickcount', reverse: true } as const;

export function searchStations(opts: { tag?: string; name?: string; limit?: number } = {}): Promise<RadioStation[]> {
  return radioFetch<RawStation[]>('/json/stations/search', {
    ...SEARCH_DEFAULTS,
    limit: opts.limit ?? 40,
    ...(opts.tag ? { tag: opts.tag } : {}),
    ...(opts.name ? { name: opts.name } : {}),
  }).then((rows) => rows.map(mapStation));
}

export function getTopStations(limit = 40): Promise<RadioStation[]> {
  return radioFetch<RawStation[]>(`/json/stations/topclick/${limit}`, { hidebroken: true }).then((rows) =>
    rows.map(mapStation),
  );
}

/**
 * Avisa a Radio Browser que esta estación se va a reproducir — alimenta el
 * contador de clics que ordena "populares" para toda la comunidad, no sólo
 * para nosotros. Se dispara y se olvida: si falla, la radio igual suena.
 */
export function registerStationClick(stationId: string): void {
  radioFetch(`/json/url/${stationId}`).catch(() => {});
}

/**
 * Avisa a nuestro propio backend que se abrió la sección — sólo un conteo
 * por plataforma para el panel ("¿se usa esto?"), nunca qué estación: eso
 * es contenido de un tercero que Peyma no modera. Se dispara y se olvida.
 */
export function logRadioOpen(): void {
  http.post('/radio/opened', { platform: 'APP' }).catch(() => {});
}

/** Prefijo que distingue una estación de radio de una pista real del catálogo — ver `isRadioTrack` y `playerStore`. */
export const RADIO_TRACK_ID_PREFIX = 'radio:';

export function isRadioTrack(track: { id: string }): boolean {
  return track.id.startsWith(RADIO_TRACK_ID_PREFIX);
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Adapta una estación al mismo `Track` que usa el resto del reproductor —
 * así `useAudioPlayer`, `playerStore`, `MiniPlayer` y los controles de
 * segundo plano funcionan sin duplicar nada. `duration: 0` es la señal que ya
 * usa el store para tratarla como transmisión en vivo (sin barra de progreso
 * con sentido, sin fin de pista).
 */
export function stationToTrack(station: RadioStation): Track {
  return {
    id: `${RADIO_TRACK_ID_PREFIX}${station.id}`,
    title: station.name,
    artist: station.tags[0] ? capitalize(station.tags[0]) : 'Radio en vivo',
    artistId: '',
    album: 'Radio en vivo',
    albumId: '',
    duration: 0,
    // Semilla por estación, no una imagen fija: sin favicon, que no todas
    // las estaciones publican, es preferible variar la portada a que un
    // centenar de filas muestren exactamente la misma imagen.
    coverUrl: station.favicon || `https://picsum.photos/seed/${station.id}/300/300`,
    audioUrl: station.streamUrl,
    isLiked: false,
  };
}
