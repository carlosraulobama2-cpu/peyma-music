/**
 * Peyma Music — Adaptadores backend → tipos de la app
 *
 * El backend (Prisma) y la app tienen formas distintas para lo mismo (p. ej.
 * `track.artist` es un objeto `{id,name,imageUrl}` en el backend pero un
 * `string` en el `Track` de la app, que ya usan ~15 pantallas). Mapear acá,
 * en un solo lugar, evita tocar cada pantalla cuando cambia la forma de la API.
 */
import type { Track, Artist, Album, Playlist, Genre, TrendingTrack } from '../types';

const FALLBACK_PLAYLIST_COVER = 'https://picsum.photos/seed/playlist-cover/300/300';

interface BackendArtistRef {
  id: string;
  name: string;
  imageUrl: string;
}

interface BackendAlbumRef {
  id: string;
  title: string;
  coverUrl: string;
}

export interface BackendTrack {
  id: string;
  title: string;
  duration: number;
  coverUrl: string;
  audioUrl: string;
  genre: Genre | null;
  createdAt: string;
  artistId: string;
  albumId: string;
  artist?: BackendArtistRef;
  album?: BackendAlbumRef;
  isLiked?: boolean;
  playCount?: number;
  composer?: string | null;
  producer?: string | null;
  label?: string | null;
  isrc?: string | null;
  isExplicit?: boolean;
}

export function mapTrack(
  raw: BackendTrack,
  context?: { artist?: BackendArtistRef; album?: BackendAlbumRef },
): Track {
  const artist = raw.artist ?? context?.artist;
  const album = raw.album ?? context?.album;
  if (!artist || !album) {
    throw new Error(`mapTrack: falta artist/album para la pista ${raw.id} — revisa el include del endpoint.`);
  }

  return {
    id: raw.id,
    title: raw.title,
    artist: artist.name,
    artistId: raw.artistId,
    album: album.title,
    albumId: raw.albumId,
    duration: raw.duration,
    coverUrl: raw.coverUrl,
    audioUrl: raw.audioUrl,
    isLiked: raw.isLiked ?? false,
    primaryGenre: raw.genre ?? undefined,
    playCount: raw.playCount,
    releaseDate: raw.createdAt,
    composer: raw.composer ?? undefined,
    producer: raw.producer ?? undefined,
    label: raw.label ?? undefined,
    isrc: raw.isrc ?? undefined,
    isExplicit: raw.isExplicit,
  };
}

export interface BackendArtist {
  id: string;
  name: string;
  imageUrl: string;
  genres: string[];
  bio?: string | null;
  monthlyListeners: number;
  isVerified?: boolean;
}

export function mapArtist(raw: BackendArtist): Artist {
  return {
    id: raw.id,
    name: raw.name,
    imageUrl: raw.imageUrl,
    genres: raw.genres,
    monthlyListeners: raw.monthlyListeners,
    bio: raw.bio ?? undefined,
    isVerified: raw.isVerified ?? false,
  };
}

export interface BackendAlbum {
  id: string;
  title: string;
  coverUrl: string;
  releaseYear: number;
  artistId: string;
  artist: BackendArtistRef;
  tracks?: Omit<BackendTrack, 'artist' | 'album'>[];
}

export function mapAlbum(raw: BackendAlbum): Album {
  const albumRef: BackendAlbumRef = { id: raw.id, title: raw.title, coverUrl: raw.coverUrl };
  return {
    id: raw.id,
    title: raw.title,
    artistId: raw.artistId,
    artistName: raw.artist.name,
    coverUrl: raw.coverUrl,
    releaseYear: raw.releaseYear,
    tracks: (raw.tracks ?? []).map((t) => mapTrack(t, { artist: raw.artist, album: albumRef })),
  };
}

export interface BackendPlaylist {
  id: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  ownerId: string;
  owner: { id: string; displayName: string; avatarUrl: string | null };
  tracks?: { position: number; track: BackendTrack }[];
}

export function mapPlaylist(raw: BackendPlaylist): Playlist {
  return {
    id: raw.id,
    title: raw.title,
    description: raw.description ?? undefined,
    coverUrl: raw.coverUrl ?? FALLBACK_PLAYLIST_COVER,
    ownerId: raw.ownerId,
    ownerName: raw.owner.displayName,
    tracks: [...(raw.tracks ?? [])].sort((a, b) => a.position - b.position).map((pt) => mapTrack(pt.track)),
    isPublic: raw.isPublic,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

export interface BackendTrendingTrack extends BackendTrack {
  rank: number;
  previousRank: number;
  streams: number;
}

export function mapTrendingTrack(raw: BackendTrendingTrack): TrendingTrack {
  return { ...mapTrack(raw), rank: raw.rank, previousRank: raw.previousRank, streams: raw.streams };
}
