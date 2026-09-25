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

export function fetchArtists(search = ''): Promise<ArtistsResponse> {
  const q = search.trim() ? `&search=${encodeURIComponent(search.trim())}` : '';
  return http.get<ArtistsResponse>(`/admin/artists?limit=100${q}`);
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
