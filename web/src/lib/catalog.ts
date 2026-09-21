/**
 * Peyma Music (web) — Catálogo real para el Main Stage
 *
 * Todo esto pega contra el backend ya construido y probado (mismo que usa
 * la app móvil) — nada mockeado. Se mantiene la forma nativa que devuelve
 * Prisma (artist: {id,name,imageUrl}, etc.) en vez de mapear a un tipo
 * intermedio: acá no hay ~15 pantallas legadas que dependan de una forma
 * distinta, así que agregar una capa de adaptación sería trabajo sin uso.
 */
import { http } from "./httpClient";

export interface TrackArtist {
  id: string;
  name: string;
  imageUrl: string;
  /** Check azul otorgado desde el panel de control. */
  isVerified?: boolean;
}

export interface TrackAlbum {
  id: string;
  title: string;
  coverUrl: string;
}

export interface CatalogTrack {
  id: string;
  title: string;
  duration: number;
  coverUrl: string;
  audioUrl: string;
  genre: string | null;
  /** Reproducciones totales. Ausente en los endpoints que no las calculan. */
  playCount?: number;
  createdAt: string;
  artist: TrackArtist;
  album: TrackAlbum;

  // Créditos de catálogo — nulos en pistas cargadas antes de que existieran estos campos.
  composer?: string | null;
  producer?: string | null;
  label?: string | null;
  isrc?: string | null;
  isExplicit?: boolean;
}

export interface TrendingTrack extends CatalogTrack {
  rank: number;
  previousRank: number;
  streams: number;
}

export interface CatalogAlbum {
  id: string;
  title: string;
  coverUrl: string;
  releaseYear: number;
  artist: TrackArtist;
}

export interface CatalogPlaylist {
  id: string;
  title: string;
  coverUrl: string | null;
  updatedAt: string;
}

interface Paginated<T> {
  tracks?: T[];
  albums?: T[];
  playlists?: T[];
  pagination: { total: number; totalPages: number };
}

export async function fetchLatestTracks(limit = 12): Promise<CatalogTrack[]> {
  const res = await http.get<Paginated<CatalogTrack>>(`/tracks?limit=${limit}`);
  return res.tracks ?? [];
}

export async function fetchTrending(limit = 12): Promise<TrendingTrack[]> {
  const res = await http.get<{ tracks: TrendingTrack[] }>(`/recommendations/trending?limit=${limit}`);
  return res.tracks;
}

/** Vacío si el usuario todavía no tiene historial de escucha — no es un error, el caller decide qué mostrar en su lugar. */
export async function fetchForYou(limit = 12): Promise<CatalogTrack[]> {
  const res = await http.get<{ tracks: CatalogTrack[]; hasHistory: boolean }>(`/recommendations/for-you?limit=${limit}`);
  return res.tracks;
}

export async function fetchAlbums(limit = 12): Promise<CatalogAlbum[]> {
  const res = await http.get<Paginated<CatalogAlbum>>(`/albums?limit=${limit}`);
  return res.albums ?? [];
}

export async function fetchArtistTracks(artistId: string, limit = 30): Promise<CatalogTrack[]> {
  const res = await http.get<Paginated<CatalogTrack>>(`/tracks?artistId=${artistId}&limit=${limit}`);
  return res.tracks ?? [];
}

export async function fetchMyPlaylists(limit = 8): Promise<CatalogPlaylist[]> {
  const res = await http.get<Paginated<CatalogPlaylist>>(`/users/playlists?limit=${limit}`);
  return res.playlists ?? [];
}

/**
 * Canciones de una categoría.
 *
 * Acepta los DOS vocabularios porque el backend los filtra distinto:
 * `primaryGenre` es el enum cerrado de `Track.genre` y `genre` son las
 * etiquetas libres de `Artist.genres`. Pasar uno donde va el otro devuelve
 * cero resultados sin error, que es la forma más difícil de depurar.
 */
export async function fetchTracksByGenre(
  filter: { primaryGenre: string } | { genre: string } | { mood: string },
): Promise<CatalogTrack[]> {
  const params = new URLSearchParams({ limit: "50" });
  if ("primaryGenre" in filter) params.set("primaryGenre", filter.primaryGenre);
  else if ("mood" in filter) params.set("mood", filter.mood);
  else params.set("genre", filter.genre);

  const res = await http.get<Paginated<CatalogTrack>>(`/tracks?${params}`);
  // `tracks` es opcional en el tipo paginado compartido: la misma forma
  // sirve para álbumes y playlists, y sólo viene la clave que corresponde.
  return res.tracks ?? [];
}
