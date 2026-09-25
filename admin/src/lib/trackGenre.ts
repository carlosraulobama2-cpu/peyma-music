import { http } from './httpClient';

/** Un ritmo del vocabulario curado (tabla `MusicGenre`, la que edita Ritmos). */
export interface GenreOption {
  id: string;
  name: string;
  slug: string;
  color: string;
}

/**
 * Ritmos disponibles para etiquetar una canción.
 *
 * Usa el endpoint público `/genres/options` y no el de Ritmos del panel
 * porque aquí sólo hacen falta los ACTIVOS: un ritmo retirado no debería
 * poder asignarse a una canción nueva, aunque las que ya lo tengan lo
 * conserven.
 */
export async function fetchGenreOptions(): Promise<GenreOption[]> {
  const res = await http.get<{ genres: GenreOption[] }>('/genres/options');
  return res.genres;
}

/**
 * Cambia el ritmo de una canción, o se lo quita con `null`.
 *
 * Quitarlo tiene que poderse: durante un tiempo el género lo ponía el
 * analizador eligiendo uno al azar, así que hay canciones en el catálogo con
 * etiquetas que no significan nada y "sin ritmo" es más honesto que dejarlas.
 */
export async function setTrackGenre(trackId: string, genreId: string | null): Promise<void> {
  await http.patch(`/admin/tracks/${trackId}/genre`, { genreId });
}
