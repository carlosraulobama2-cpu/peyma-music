import { http } from './httpClient';

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
  status: string;
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
    topTracks: { trackId: string; title: string; streams: number }[];
  };
  denunciasPendientes: number;
  tracks: AdminArtistTrack[];
}

export const fetchArtistDetail = (id: string) => http.get<AdminArtistDetail>(`/admin/artists/${id}`);

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
