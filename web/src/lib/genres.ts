import { http } from "./httpClient";

/** Un ritmo del vocabulario curado (tabla `MusicGenre`, editable desde Ritmos en el panel). */
export interface GenreOption {
  id: string;
  name: string;
  slug: string;
  color: string;
}

/**
 * Catálogo completo de ritmos activos, con id.
 *
 * Usa `/genres/options` y no `/genres`, porque esa otra ruta descarta las
 * categorías que todavía no tienen canciones: con ella, un ritmo recién
 * creado en el panel nunca podría elegirse al subir, y por tanto nunca
 * llegaría a tener canciones.
 */
export async function fetchGenreCatalog(): Promise<GenreOption[]> {
  const res = await http.get<{ genres: GenreOption[] }>("/genres/options");
  return res.genres;
}

/**
 * Nombres de ritmo para las casillas de perfil de artista y de gustos.
 *
 * Ahí el vocabulario es `Artist.genres` / `User.favoriteGenres`, que son
 * arrays de TEXTO libre y no la relación de `Track.genre`. Por eso esto
 * devuelve nombres y no ids.
 *
 * `yaSeleccionados` se fusiona con el catálogo a propósito: si alguien tiene
 * guardado un ritmo que luego se desactivó en el panel, sin esto la casilla
 * desaparecería de la pantalla mientras el valor seguiría en su perfil, y al
 * guardar de nuevo lo perdería sin haber pedido perderlo.
 */
export async function fetchGenreOptions(yaSeleccionados: string[] = []): Promise<string[]> {
  const catalogo = await fetchGenreCatalog();
  const nombres = new Set(catalogo.map((g) => g.name));
  for (const nombre of yaSeleccionados) nombres.add(nombre);
  return [...nombres].sort((a, b) => a.localeCompare(b, "es"));
}
