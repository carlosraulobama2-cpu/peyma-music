import { http } from "./httpClient";
import type { CatalogTrack } from "./catalog";

interface PlaylistDetailResponse {
  playlist: {
    id: string;
    title: string;
    description: string | null;
    coverUrl: string | null;
    isPublic: boolean;
    ownerId: string;
    owner: { id: string; displayName: string; avatarUrl: string | null };
    tracks: { position: number; track: CatalogTrack }[];
    _count: { tracks: number };
  };
}

export interface PlaylistDetail {
  id: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  ownerId: string;
  ownerName: string;
  tracks: CatalogTrack[];
}

export async function fetchPlaylist(playlistId: string): Promise<PlaylistDetail> {
  const { playlist } = await http.get<PlaylistDetailResponse>(`/playlists/${playlistId}`);
  return {
    id: playlist.id,
    title: playlist.title,
    description: playlist.description,
    coverUrl: playlist.coverUrl,
    ownerId: playlist.ownerId,
    ownerName: playlist.owner.displayName,
    tracks: [...playlist.tracks].sort((a, b) => a.position - b.position).map((pt) => pt.track),
  };
}

export function addTrackToPlaylist(playlistId: string, trackId: string): Promise<unknown> {
  return http.post(`/playlists/${playlistId}/tracks`, { trackId });
}

export function removeTrackFromPlaylist(playlistId: string, trackId: string): Promise<unknown> {
  return http.delete(`/playlists/${playlistId}/tracks/${trackId}`);
}
