import { http } from "./httpClient";
import type { CatalogTrack, CatalogAlbum, TrackArtist } from "./catalog";

/** Las pistas anidadas en `GET /artists/:id` no repiten la relación `artist` (ya se sabe cuál es), así que llegan sin ella. */
interface ArtistDetailTrack extends Omit<CatalogTrack, "artist"> {
  _count: { favorites: number; playlists: number; recentlyPlayed: number };
}

interface ArtistDetailResponse {
  artist: {
    id: string;
    name: string;
    imageUrl: string;
    genres: string[];
    bio: string | null;
    monthlyListeners: number;
    /** Check otorgado desde el panel de control. */
    isVerified: boolean;
    isFollowing: boolean;
    albums: (Omit<CatalogAlbum, "artist"> & { _count: { tracks: number } })[];
    tracks: ArtistDetailTrack[];
    _count: { albums: number; tracks: number; followers: number };
  };
}

export interface DiscographyAlbum extends CatalogAlbum {
  trackCount: number;
}

export interface ArtistProfile {
  id: string;
  name: string;
  imageUrl: string;
  genres: string[];
  bio: string | null;
  monthlyListeners: number;
  followers: number;
  /** Check otorgado desde el panel de control. */
  isVerified: boolean;
  isFollowing: boolean;
  albums: DiscographyAlbum[];
  /** Ordenadas por reproducciones reales (`_count.recentlyPlayed`), no por fecha. */
  popularTracks: CatalogTrack[];
}

export async function fetchArtist(artistId: string): Promise<ArtistProfile> {
  const { artist } = await http.get<ArtistDetailResponse>(`/artists/${artistId}`);
  const artistRef: TrackArtist = { id: artist.id, name: artist.name, imageUrl: artist.imageUrl, isVerified: artist.isVerified };

  return {
    id: artist.id,
    name: artist.name,
    imageUrl: artist.imageUrl,
    genres: artist.genres,
    bio: artist.bio,
    monthlyListeners: artist.monthlyListeners,
    followers: artist._count.followers,
    isVerified: artist.isVerified,
    isFollowing: artist.isFollowing,
    albums: artist.albums.map((album) => ({ ...album, artist: artistRef, trackCount: album._count.tracks })),
    popularTracks: [...artist.tracks]
      .sort((a, b) => b._count.recentlyPlayed - a._count.recentlyPlayed)
      .map((track) => ({ ...track, artist: artistRef })),
  };
}

export function toggleFollow(artistId: string): Promise<{ isFollowing: boolean }> {
  return http.post<{ isFollowing: boolean }>(`/artists/${artistId}/follow`);
}

export function fetchArtistStats(artistId: string): Promise<{ followers: number; monthlyListeners: number }> {
  return http.get<{ followers: number; monthlyListeners: number }>(`/artists/${artistId}/stats`);
}

export interface ArtistSummary {
  id: string;
  name: string;
  imageUrl: string;
  isVerified: boolean;
}

/**
 * Listado corto de artistas, para el selector de la pantalla de subida.
 *
 * Usa el endpoint público de catálogo, no el del panel: un artista que sube
 * su canción no es administrador y `/admin/artists` le devolvería 403.
 *
 * Sólo lo usa un administrador, que sí puede publicar en nombre de
 * cualquiera. Un creador normal sube a SU perfil (`fetchMyArtistProfile`):
 * ofrecerle la lista entera lo empujaba a elegir un artista ajeno, y el
 * backend ahora se lo rechaza.
 */
export async function fetchArtists(): Promise<ArtistSummary[]> {
  const { artists } = await http.get<{ artists: ArtistSummary[] }>("/artists?limit=100");
  return artists;
}

/** El perfil de artista de quien pregunta, o `null` si todavía no tiene. */
export async function fetchMyArtistProfile(): Promise<ArtistSummary | null> {
  const { artist } = await http.get<{ artist: ArtistSummary | null }>("/artists/me/profile");
  return artist;
}

export interface CreateArtistInput {
  name: string;
  imageUrl: string;
  bio?: string;
  genres?: string[];
}

/**
 * Crea el perfil de artista de quien llama y lo deja como dueño.
 *
 * El backend promueve la cuenta a ARTIST en la misma operación, así que
 * después de esto hace falta refrescar la sesión para que la interfaz vea
 * el rol nuevo.
 */
export async function createArtistProfile(input: CreateArtistInput): Promise<ArtistSummary> {
  const { artist } = await http.post<{ artist: ArtistSummary }>("/artists", input);
  return artist;
}
