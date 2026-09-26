"use client";

/**
 * Peyma Music (web) — Radio en vivo (Radio Browser)
 *
 * Espejo exacto de `app/src/services/radioApi.ts` (la app móvil) — mismo
 * proveedor (radio-browser.info, gratis, sin API key), mismos espejos, misma
 * regla: contenido de TERCEROS, no pasa por el proxy del backend ni por
 * `streamTracker`/`/streams/log` — ver el guard `isRadioTrack` en
 * `PlayerDeck.tsx`.
 */
import type { CatalogTrack } from "./catalog";
import { http } from "./httpClient";

const MIRRORS = [
  "https://de1.api.radio-browser.info",
  "https://de2.api.radio-browser.info",
  "https://nl1.api.radio-browser.info",
  "https://at1.api.radio-browser.info",
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
    name: raw.name?.trim() || "Radio sin nombre",
    streamUrl: raw.url_resolved || raw.url,
    favicon: raw.favicon || null,
    tags: raw.tags
      ? raw.tags
          .split(",")
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
  if (!params) return "";
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== "");
  if (entries.length === 0) return "";
  return "?" + entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join("&");
}

/** Prueba los espejos en orden; el primero que responda gana. */
async function radioFetch<T>(path: string, params?: Record<string, string | number | boolean>): Promise<T> {
  const query = buildQuery(params);
  let lastError: unknown;

  for (const mirror of MIRRORS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(`${mirror}${path}${query}`, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`Radio Browser respondió ${res.status}`);
      return (await res.json()) as T;
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("No se pudo contactar ningún espejo de Radio Browser.");
}

const SEARCH_DEFAULTS = { hidebroken: true, order: "clickcount", reverse: true } as const;

export function searchStations(opts: { tag?: string; name?: string; limit?: number } = {}): Promise<RadioStation[]> {
  return radioFetch<RawStation[]>("/json/stations/search", {
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

/** Avisa a Radio Browser que esta estación se va a reproducir — alimenta el contador de clics comunitario. Se dispara y se olvida. */
export function registerStationClick(stationId: string): void {
  radioFetch(`/json/url/${stationId}`).catch(() => {});
}

/**
 * Avisa a nuestro propio backend que se abrió la sección — sólo un conteo
 * por plataforma para el panel ("¿se usa esto?"), nunca qué estación: eso
 * es contenido de un tercero que Peyma no modera. Se dispara y se olvida.
 */
export function logRadioOpen(): void {
  http.post("/radio/opened", { platform: "WEB" }).catch(() => {});
}

export interface RadioPlaylist {
  id: string;
  name: string;
  stations: RadioStation[];
}

/** Espejo de la lista curada en la app móvil — ver `src/services/radioApi.ts`. */
const AUTO_PLAYLIST_TAGS: { id: string; name: string }[] = [
  { id: "", name: "Las más escuchadas" },
  { id: "pop", name: "Radios de Pop" },
  { id: "rock", name: "Radios de Rock" },
  { id: "reggaeton", name: "Radios de Reggaetón" },
  { id: "electronic", name: "Radios de Electrónica" },
  { id: "jazz", name: "Radios de Jazz" },
];

/**
 * "Playlists" automáticas de ESTACIONES agrupadas por género y ya
 * nombradas — se arman de nuevo cada vez que se entra a la pantalla, no se
 * guardan en ningún lado. Ver la versión de la app para la explicación
 * completa de por qué es esto y no canciones extraídas de la radio.
 */
export async function getAutoRadioPlaylists(stationsPerPlaylist = 10): Promise<RadioPlaylist[]> {
  const results = await Promise.allSettled(
    AUTO_PLAYLIST_TAGS.map(async (tag) => {
      const stations = tag.id
        ? await searchStations({ tag: tag.id, limit: stationsPerPlaylist })
        : await getTopStations(stationsPerPlaylist);
      return { id: tag.id || "top", name: tag.name, stations };
    }),
  );

  return results
    .filter((r): r is PromiseFulfilledResult<RadioPlaylist> => r.status === "fulfilled")
    .map((r) => r.value)
    .filter((playlist) => playlist.stations.length > 0);
}

/**
 * "Sonando ahora" de una estación — un `<audio>` de navegador nunca ve la
 * metadata ICY que sí lee la app (react-native-track-player la expone
 * nativa), así que acá hay que pedírsela a nuestro propio backend, que abre
 * la conexión por nosotros y la relee — ver backend/src/services/icyMetadata.ts.
 * `null` si la estación no anuncia esa metadata (muchas no lo hacen).
 */
export async function fetchNowPlaying(stationId: string, streamUrl: string): Promise<string | null> {
  try {
    const res = await http.get<{ title: string | null }>(
      `/radio/now-playing?stationId=${encodeURIComponent(stationId)}&streamUrl=${encodeURIComponent(streamUrl)}`,
    );
    return res.title;
  } catch {
    return null;
  }
}

/** Prefijo que distingue una estación de radio de una pista real del catálogo. */
export const RADIO_TRACK_ID_PREFIX = "radio:";

export function isRadioTrack(track: { id: string }): boolean {
  return track.id.startsWith(RADIO_TRACK_ID_PREFIX);
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Adapta una estación al mismo `CatalogTrack` que usa el resto del
 * reproductor web — así `usePlayerStore`, `PlayerDeck` y `NowPlayingPanel`
 * funcionan sin duplicar nada. `duration: 0` es la señal que ya usan para
 * tratarla como transmisión en vivo.
 */
export function stationToCatalogTrack(station: RadioStation): CatalogTrack {
  const cover = station.favicon || `https://picsum.photos/seed/${station.id}/300/300`;
  return {
    id: `${RADIO_TRACK_ID_PREFIX}${station.id}`,
    title: station.name,
    duration: 0,
    coverUrl: cover,
    audioUrl: station.streamUrl,
    genre: station.tags[0] ? capitalize(station.tags[0]) : null,
    createdAt: new Date().toISOString(),
    artist: {
      id: "",
      name: station.tags[0] ? capitalize(station.tags[0]) : "Radio en vivo",
      imageUrl: cover,
      isVerified: false,
    },
    album: {
      id: "",
      title: "Radio en vivo",
      coverUrl: cover,
    },
  };
}
