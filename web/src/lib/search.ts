import { http } from "./httpClient";
import type { CatalogTrack, CatalogAlbum, TrackArtist } from "./catalog";

export interface SearchArtist extends TrackArtist {
  genres: string[];
  monthlyListeners: number;
}

export interface SearchResults {
  tracks: CatalogTrack[];
  artists: SearchArtist[];
  albums: CatalogAlbum[];
}

/**
 * El backend no tiene un endpoint `/search` único — cada recurso ya acepta
 * `?search=`, así que se consultan los tres en paralelo. Mismo criterio que
 * usa `api.search()` en la app móvil, para que los resultados coincidan.
 */
export async function search(query: string): Promise<SearchResults> {
  const q = query.trim();
  if (!q) return { tracks: [], artists: [], albums: [] };
  const encoded = encodeURIComponent(q);

  const [tracks, artists, albums] = await Promise.all([
    http.get<{ tracks: CatalogTrack[] }>(`/tracks?search=${encoded}&limit=20`),
    http.get<{ artists: SearchArtist[] }>(`/artists?search=${encoded}&limit=12`),
    http.get<{ albums: CatalogAlbum[] }>(`/albums?search=${encoded}&limit=12`),
  ]);

  return { tracks: tracks.tracks, artists: artists.artists, albums: albums.albums };
}
