import { http } from './httpClient';
import type { TrackReviewStatus } from './moderation';

export interface AdminArtist {
  id: string;
  name: string;
  imageUrl: string;
  genres: string[];
  bio: string | null;
  isBlocked: boolean;
  isVerified: boolean;
  verifiedAt: string | null;
  _count: { tracks: number; albums: number; followers: number };
}

interface ArtistsResponse {
  artists: AdminArtist[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export async function fetchArtists(search = ''): Promise<ArtistsResponse> {
  const q = search.trim() ? `&search=${encodeURIComponent(search.trim())}` : '';

  // Todas las páginas, no sólo la primera. La respuesta ya traía `total` y
  // `totalPages` y se descartaban: el desplegable de "Subir canción" se
  // quedaba en 100 artistas sin decirlo, y el 101 no era elegible.
  const primera = await http.get<ArtistsResponse>(`/admin/artists?limit=100&page=1${q}`);
  const artists = [...primera.artists];

  for (let page = 2; page <= primera.pagination.totalPages; page += 1) {
    const siguiente = await http.get<ArtistsResponse>(`/admin/artists?limit=100&page=${page}${q}`);
    if (siguiente.artists.length === 0) break;
    artists.push(...siguiente.artists);
  }

  return { artists, pagination: { ...primera.pagination, page: 1, limit: artists.length } };
}

export function setArtistBlocked(artistId: string, isBlocked: boolean): Promise<{ artist: AdminArtist }> {
  return http.patch<{ artist: AdminArtist }>(`/admin/artists/${artistId}/block`, { isBlocked });
}

export function setArtistVerified(artistId: string, isVerified: boolean): Promise<{ artist: AdminArtist }> {
  return http.patch<{ artist: AdminArtist }>(`/admin/artists/${artistId}/verify`, { isVerified });
}

export function deleteArtist(artistId: string): Promise<{ message: string }> {
  return http.delete<{ message: string }>(`/admin/artists/${artistId}`);
}

export function deleteTrack(trackId: string): Promise<{ message: string }> {
  return http.delete<{ message: string }>(`/admin/tracks/${trackId}`);
}

export interface VerificationCandidate {
  id: string;
  name: string;
  imageUrl: string;
  listeners: number;
  streams: number;
  score: number;
  _count: { followers: number; tracks: number };
}

/**
 * Artistas sin verificar, ordenados por el mismo ranking compuesto que
 * decide quién va en primera fila (oyentes + reproducciones + seguidores).
 * No es una cola de solicitudes — es "a quién le tocaría el check si
 * alguien se pusiera a revisar ahora".
 */
export function fetchVerificationCandidates(limit = 30): Promise<{ candidates: VerificationCandidate[] }> {
  return http.get(`/admin/artists/verification-candidates?limit=${limit}`);
}

export interface ArtistGrowth {
  artistId: string;
  name: string;
  imageUrl: string;
  isVerified: boolean;
  currentListeners: number;
  previousListeners: number;
  growthPct: number | null;
}

/** Crecimiento período a período (oyentes distintos), comparando `days` contra los `days` anteriores. */
export const fetchArtistGrowth = (days = 7, limit = 25) =>
  http.get<{ days: number; artists: ArtistGrowth[] }>(`/admin/artists/growth?days=${days}&limit=${limit}`);

export interface InactiveArtist {
  artistId: string;
  name: string;
  imageUrl: string;
  isVerified: boolean;
  trackCount: number;
  lastUploadAt: string;
}

/** Artistas con catálogo pero sin publicar nada en `months` meses. */
export const fetchInactiveArtists = (months = 3, limit = 50) =>
  http.get<{ months: number; artists: InactiveArtist[] }>(`/admin/artists/inactive?months=${months}&limit=${limit}`);

/** Una canción tal como la ve el panel: incluye las pendientes y bloqueadas. */
export interface AdminArtistTrack {
  id: string;
  title: string;
  coverUrl: string;
  duration: number;
  genre: string | null;
  status: TrackReviewStatus;
  isBlocked: boolean;
  blockedReason: string | null;
  createdAt: string;
  playCount: number;
  album: { id: string; title: string } | null;
}

export interface AdminArtistDetail {
  artist: AdminArtist & {
    bio: string | null;
    genres: string[];
    owner: { id: string; email: string; displayName: string } | null;
    _count: { albums: number; tracks: number; followers: number };
  };
  stats: {
    followers: number;
    monthlyListeners: number;
    totalStreams: number;
    streamsLast14Days: number[];
    topTracks: { trackId: string; title: string; coverUrl: string | null; duration: number; streams: number }[];
  };
  denunciasPendientes: number;
  tracks: AdminArtistTrack[];
}

export const fetchArtistDetail = (id: string) => http.get<AdminArtistDetail>(`/admin/artists/${id}`);

/**
 * Asigna o retira la titularidad de un artista.
 *
 * Existe porque subir una canción ya no se apropia de un artista sin dueño
 * (antes sí, y cualquier cuenta nueva podía quedarse con un artista del
 * catálogo). Reclamar un perfil importado pasa ahora por aquí, que es
 * donde hay con qué comprobar quién es quién.
 *
 * `null` retira el dueño y devuelve el artista al catálogo común.
 */
export const setArtistOwner = (artistId: string, ownerEmail: string | null) =>
  http.patch<{ artist: { id: string; name: string; owner: { id: string; email: string; displayName: string } | null } }>(
    `/admin/artists/${artistId}/owner`,
    { ownerEmail },
  );

/** Bloquea o restaura varias canciones de golpe. Reversible. */
export const bulkBlockTracks = (artistId: string, trackIds: string[], isBlocked: boolean, reason?: string) =>
  http.post<{ updated: number }>(`/admin/artists/${artistId}/tracks/block`, {
    trackIds,
    isBlocked,
    ...(reason ? { reason } : {}),
  });

/** Borra varias canciones. NO es reversible. */
export const bulkDeleteTracks = (artistId: string, trackIds: string[]) =>
  http.post<{ deleted: number }>(`/admin/artists/${artistId}/tracks/delete`, { trackIds });

/** Lo que devuelve la inspección: un borrador que todavía no existe en el catálogo. */
export interface ExtractedTrack {
  importId: string;
  title: string;
  artistName: string | null;
  albumTitle: string | null;
  durationSeconds: number;
  audioUrl: string;
  coverUrl: string | null;
  originalLufs: number | null;
  sourceUrl: string;
  metadataSource: 'id3' | 'opengraph' | 'filename';
}

/** Paso 1: descarga, normaliza y sube al bucket. NO crea la pista. */
export const inspectImportUrl = (url: string) =>
  http.post<{ extracted: ExtractedTrack }>('/admin/import/inspect', { url });

/** Paso 2: crea la pista con los datos ya revisados y corregidos. */
export const confirmImport = (payload: {
  importId: string;
  audioUrl: string;
  coverUrl?: string;
  title: string;
  artistId: string;
  durationSeconds: number;
  sourceUrl: string;
  rightsConfirmed: true;
}) => http.post<{ track: { id: string; title: string } }>('/admin/import/confirm', payload);
