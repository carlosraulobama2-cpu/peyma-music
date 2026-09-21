import { http } from "./httpClient";
import type { CatalogTrack, CatalogPlaylist } from "./catalog";

export interface FollowedArtist {
  id: string;
  name: string;
  imageUrl: string;
  genres: string[];
  monthlyListeners: number;
  _count?: { albums: number; tracks: number; followers: number };
}

export async function fetchLikedTracks(limit = 50): Promise<CatalogTrack[]> {
  const res = await http.get<{ tracks: CatalogTrack[] }>(`/tracks/liked?limit=${limit}`);
  return res.tracks;
}

export async function fetchFollowedArtists(limit = 50): Promise<FollowedArtist[]> {
  const res = await http.get<{ artists: FollowedArtist[] }>(`/users/following?limit=${limit}`);
  return res.artists;
}

export async function fetchMyPlaylistsFull(limit = 50): Promise<CatalogPlaylist[]> {
  const res = await http.get<{ playlists: CatalogPlaylist[] }>(`/users/playlists?limit=${limit}`);
  return res.playlists;
}

export function createPlaylist(title: string): Promise<{ playlist: CatalogPlaylist }> {
  return http.post<{ playlist: CatalogPlaylist }>("/playlists", { title });
}

/**
 * Notificaciones del usuario.
 *
 * Mismo endpoint que la app. Viven aquí y no en su propio módulo porque la
 * biblioteca es donde la web ya agrupa "lo mío".
 */
export interface UserNotification {
  id: string;
  kind: string;
  title: string;
  body: string;
  targetType: string | null;
  targetId: string | null;
  readAt: string | null;
  createdAt: string;
}

export function fetchNotifications(): Promise<{ notifications: UserNotification[]; unread: number }> {
  return http.get("/notifications?limit=50");
}

export function markAllNotificationsRead(): Promise<{ marked: number }> {
  return http.patch("/notifications/read");
}
