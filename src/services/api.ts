/**
 * Peyma Music — Capa de API
 *
 * Cliente real contra el backend (Express/Prisma/Neon) — ver `httpClient.ts`
 * para el transporte y `mappers.ts` para la conversión de forma. Las firmas
 * son las mismas que tenía la versión mock, a propósito: ninguna pantalla
 * tuvo que cambiar para dejar de leer `mockData.ts`.
 */
import type { Track, Artist, Album, Playlist, SearchResults, Genre, TrendingChart } from '../types';
import { http, isAbortError, isConflictError } from './httpClient';
import {
  mapTrack,
  mapArtist,
  mapAlbum,
  mapPlaylist,
  mapTrendingTrack,
  type BackendTrack,
  type BackendArtist,
  type BackendAlbum,
  type BackendPlaylist,
  type BackendTrendingTrack,
} from './mappers';

/**
 * Lo que devuelve `GET /artists/:id/stats`, tal cual.
 *
 * No incluye países: `StreamLog` guarda coordenadas redondeadas, no un país,
 * y no hay geocodificador en el proyecto. Antes el Studio mostraba un top de
 * países inventado; es preferible no enseñar ese bloque a enseñarlo falso.
 */
export interface BackendArtistStats {
  followers: number;
  monthlyListeners: number;
  totalStreams: number;
  streamsLast14Days: number[];
  topTracks: { trackId: string; title: string; coverUrl: string | null; duration: number; streams: number }[];
}

export interface PagedResult<T> {
  items: T[];
  /** `true` si una próxima página (`page + 1`) devolvería más resultados. */
  hasMore: boolean;
}

export interface RankedAlbum extends Album {
  rank: number;
  streams: number;
}

export interface ApiOptions {
  signal?: AbortSignal;
}

interface Paginated<T> {
  pagination: { page: number; totalPages: number };
  items: T[];
}

async function paginatedGet<TRaw>(
  path: string,
  key: string,
  params: Record<string, string | number | undefined>,
  { signal }: ApiOptions = {},
): Promise<Paginated<TRaw>> {
  const query = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  const data = await http.get<Record<string, unknown>>(`${path}${query ? `?${query}` : ''}`, { signal });
  return { items: data[key] as TRaw[], pagination: data.pagination as Paginated<TRaw>['pagination'] };
}

export const api = {
  // Canciones
  async getTracks({ signal }: ApiOptions = {}): Promise<Track[]> {
    const { items } = await paginatedGet<BackendTrack>('/tracks', 'tracks', { limit: 50 }, { signal });
    return items.map((t) => mapTrack(t));
  },

  async getTrackById(id: string, { signal }: ApiOptions = {}): Promise<Track | undefined> {
    try {
      const { track } = await http.get<{ track: BackendTrack }>(`/tracks/${id}`, { signal });
      return mapTrack(track);
    } catch (error) {
      if (isAbortError(error)) throw error;
      return undefined;
    }
  },

  // Artistas
  async getArtists({ signal }: ApiOptions = {}): Promise<Artist[]> {
    const { items } = await paginatedGet<BackendArtist>('/artists', 'artists', { limit: 50 }, { signal });
    return items.map(mapArtist);
  },

  async getArtistById(id: string, { signal }: ApiOptions = {}): Promise<Artist | undefined> {
    try {
      const { artist } = await http.get<{ artist: BackendArtist }>(`/artists/${id}`, { signal });
      return mapArtist(artist);
    } catch (error) {
      if (isAbortError(error)) throw error;
      return undefined;
    }
  },

  async getArtistTracks(artistId: string, { signal }: ApiOptions = {}): Promise<Track[]> {
    const { items } = await paginatedGet<BackendTrack>('/tracks', 'tracks', { artistId, limit: 50 }, { signal });
    return items.map((t) => mapTrack(t));
  },

  /**
   * TODAS las canciones del artista de quien pregunta, en cualquier estado
   * de moderación — a diferencia de `getArtistTracks`/`getTracks`, que sólo
   * devuelven lo ya `APPROVED`. Es lo que alimenta "Tus lanzamientos" en el
   * panel de artista: sin esto, una canción recién publicada era invisible
   * (y no reproducible) hasta que un admin la aprobara.
   */
  async getMyTracks({ signal }: ApiOptions = {}): Promise<Track[]> {
    const { tracks } = await http.get<{ tracks: BackendTrack[] }>('/artists/me/tracks', { signal });
    return tracks.map((t) => mapTrack(t));
  },

  // Álbumes
  async getAlbums({ signal }: ApiOptions = {}): Promise<Album[]> {
    const { items } = await paginatedGet<BackendAlbum>('/albums', 'albums', { limit: 50 }, { signal });
    return items.map(mapAlbum);
  },

  async getAlbumById(id: string, { signal }: ApiOptions = {}): Promise<Album | undefined> {
    try {
      const { album } = await http.get<{ album: BackendAlbum }>(`/albums/${id}`, { signal });
      return mapAlbum(album);
    } catch (error) {
      if (isAbortError(error)) throw error;
      return undefined;
    }
  },

  /** "Top 100 álbumes" — reproducciones reales de los últimos 28 días, sin sencillos. */
  async getTopAlbums(limit = 100, { signal }: ApiOptions = {}): Promise<RankedAlbum[]> {
    const { albums } = await http.get<{ albums: (BackendAlbum & { rank: number; streams: number })[] }>(
      `/recommendations/top-albums?limit=${limit}`,
      { signal },
    );
    return albums.map((a) => ({ ...mapAlbum(a), rank: a.rank, streams: a.streams }));
  },

  // Playlists (públicas + propias del usuario logueado, según decide el backend)
  async getPlaylists({ signal }: ApiOptions = {}): Promise<Playlist[]> {
    const { items } = await paginatedGet<BackendPlaylist>('/playlists', 'playlists', { limit: 50 }, { signal });
    return items.map(mapPlaylist);
  },

  async getPlaylistById(id: string, { signal }: ApiOptions = {}): Promise<Playlist | undefined> {
    try {
      const { playlist } = await http.get<{ playlist: BackendPlaylist }>(`/playlists/${id}`, { signal });
      return mapPlaylist(playlist);
    } catch (error) {
      if (isAbortError(error)) throw error;
      return undefined;
    }
  },

  // Búsqueda — en paralelo contra los cuatro endpoints, cada uno con su propio filtro `search`.
  async search(query: string, { signal }: ApiOptions = {}): Promise<SearchResults> {
    const q = query.trim();
    if (!q) return { tracks: [], artists: [], albums: [], playlists: [] };

    const [tracks, artists, albums, playlists] = await Promise.all([
      paginatedGet<BackendTrack>('/tracks', 'tracks', { search: q, limit: 15 }, { signal }),
      paginatedGet<BackendArtist>('/artists', 'artists', { search: q, limit: 15 }, { signal }),
      paginatedGet<BackendAlbum>('/albums', 'albums', { search: q, limit: 15 }, { signal }),
      paginatedGet<BackendPlaylist>('/playlists', 'playlists', { search: q, limit: 15 }, { signal }),
    ]);

    return {
      tracks: tracks.items.map((t) => mapTrack(t)),
      artists: artists.items.map(mapArtist),
      albums: albums.items.map(mapAlbum),
      playlists: playlists.items.map(mapPlaylist),
    };
  },

  // Explorar por género (etiqueta libre del artista — ver comentario en mappers/schema del backend)
  /** Banner informativo configurable desde el panel (Ajustes → Anuncio) — no bloquea nada, a diferencia del modo mantenimiento. */
  async getAnnouncement({ signal }: ApiOptions = {}): Promise<{ enabled: boolean; message: string }> {
    return http.get<{ enabled: boolean; message: string }>('/config/announcement', { signal, skipAuth: true });
  },

  async getGenres({ signal }: ApiOptions = {}): Promise<string[]> {
    const { items } = await paginatedGet<BackendArtist>('/artists', 'artists', { limit: 100 }, { signal });
    return Array.from(new Set(items.flatMap((a) => a.genres))).sort();
  },

  async getTracksByGenre(genre: string, { signal }: ApiOptions = {}): Promise<Track[]> {
    const { items } = await paginatedGet<BackendTrack>('/tracks', 'tracks', { genre, limit: 50 }, { signal });
    return items.map((t) => mapTrack(t));
  },

  /** Universo cerrado de 8 géneros de `Track.genre` — para los `GenreCarousel` de Inicio. */
  async getTracksByPrimaryGenre(genre: Genre, { signal }: ApiOptions = {}): Promise<Track[]> {
    const { items } = await paginatedGet<BackendTrack>('/tracks', 'tracks', { primaryGenre: genre, limit: 50 }, { signal });
    return items.map((t) => mapTrack(t));
  },

  /** Página del carrusel de un género — soporta `onEndReached` en `GenreCarousel`. */
  async getTracksByPrimaryGenrePaged(
    genre: Genre,
    page: number,
    pageSize: number,
    { signal }: ApiOptions = {},
  ): Promise<PagedResult<Track>> {
    const { items, pagination } = await paginatedGet<BackendTrack>(
      '/tracks',
      'tracks',
      { primaryGenre: genre, page: page + 1, limit: pageSize }, // el backend pagina desde 1, el carrusel desde 0
      { signal },
    );
    return { items: items.map((t) => mapTrack(t)), hasMore: page + 1 < pagination.totalPages };
  },

  /** El backend no tiene un flag "destacado" — se toma el de más oyentes mensuales reales entre los primeros artistas. */
  async getFeaturedArtist({ signal }: ApiOptions = {}): Promise<Artist | undefined> {
    const { items } = await paginatedGet<BackendArtist>('/artists', 'artists', { limit: 20 }, { signal });
    if (items.length === 0) return undefined;
    const top = items.reduce((best, a) => (a.monthlyListeners > best.monthlyListeners ? a : best));
    return mapArtist(top);
  },

  /** "Novedades": las pistas más recientes del catálogo (ya vienen ordenadas por fecha de publicación), acotadas a los últimos 30 días. */
  async getNewReleaseTracks({ signal }: ApiOptions = {}): Promise<Track[]> {
    const { items } = await paginatedGet<BackendTrack>('/tracks', 'tracks', { limit: 30 }, { signal });
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    return items.filter((t) => now - new Date(t.createdAt).getTime() <= THIRTY_DAYS_MS).map((t) => mapTrack(t));
  },

  /**
   * "Radio" a partir de una canción: usa el motor real de recomendaciones
   * (similitud de coseno sobre el análisis de audio). Si la pista todavía no
   * tiene análisis (p. ej. catálogo de ejemplo sin pasar por el pipeline de
   * subida), cae de vuelta al mismo criterio que antes: mismo artista +
   * resto del catálogo mezclado — nunca deja la radio vacía.
   */
  async getRadioQueue(seedTrack: Track, { signal }: ApiOptions = {}): Promise<Track[]> {
    try {
      const { tracks: similar } = await http.get<{ tracks: (BackendTrack & { similarity: number })[] }>(
        `/recommendations/similar/${seedTrack.id}?limit=19`,
        { signal },
      );
      if (similar.length > 0) return [seedTrack, ...similar.map((t) => mapTrack(t))];
    } catch (error) {
      if (isAbortError(error)) throw error;
    }

    const { items } = await paginatedGet<BackendTrack>('/tracks', 'tracks', { limit: 30 }, { signal });
    const rest = items.filter((t) => t.id !== seedTrack.id);
    const shuffled = [...rest].sort(() => Math.random() - 0.5);
    return [seedTrack, ...shuffled.map((t) => mapTrack(t))].slice(0, 20);
  },

  /**
   * Ranking real de tendencias — reproducciones de `StreamLog` de los
   * últimos 7 días, `rank`/`previousRank` para saber si sube o baja. Sólo
   * hay chart global (no hay datos de ubicación del oyente en el backend
   * todavía), así que `locationLabel`/`usingGlobalFallback` siempre
   * reflejan eso — nada de simular un top "por país" que no existe.
   */
  async getTrending(limit = 100, { signal }: ApiOptions = {}): Promise<TrendingChart> {
    const { tracks } = await http.get<{ tracks: BackendTrendingTrack[] }>(`/recommendations/trending?limit=${limit}`, { signal });
    return { locationLabel: 'Global', topTracks: tracks.map(mapTrendingTrack) };
  },

  /**
   * Crea el perfil de artista de quien llama y se lo asigna.
   *
   * Antes esto vivía sólo en un store local del teléfono: el perfil nunca
   * existía en el servidor, así que su id era inventado y cualquier subida
   * con él habría sido rechazada.
   */
  async createArtistProfile(
    input: { name: string; imageUrl: string; bio?: string; genres?: string[] },
    { signal }: ApiOptions = {},
  ): Promise<Artist> {
    const { artist } = await http.post<{ artist: BackendArtist }>('/artists', input, { signal });
    return mapArtist(artist);
  },

  /** El perfil de artista propio, o null si todavía no tiene. */
  async getMyArtistProfile({ signal }: ApiOptions = {}): Promise<Artist | null> {
    const { artist } = await http.get<{ artist: BackendArtist | null }>('/artists/me/profile', { signal });
    return artist ? mapArtist(artist) : null;
  },

  /** Una sección concreta por slug — el destino de /seccion/:slug. */
  async getEditorialSectionBySlug(slug: string, { signal }: ApiOptions = {}): Promise<EditorialSection | null> {
    try {
      const { section } = await http.get<{ section: BackendEditorialSection }>(
        `/editorial/${encodeURIComponent(slug)}`,
        { signal },
      );
      return {
        id: section.id,
        title: section.title,
        slug: section.slug,
        subtitle: section.subtitle ?? undefined,
        layout: section.layout,
        tracks: section.tracks.map((t) => mapTrack(t)),
        albums: section.albums.map((a) => ({ id: a.id, title: a.title, coverUrl: a.coverUrl, artistName: a.artist.name })),
        artists: section.artists.map((a) => ({ id: a.id, name: a.name, imageUrl: a.imageUrl, isVerified: a.isVerified })),
      };
    } catch (error) {
      if (isAbortError(error)) throw error;
      // Una sección despublicada desde el panel es un caso normal, no un
      // error: la pantalla muestra un mensaje en vez de romperse.
      return null;
    }
  },

  /**
   * Portada completa en UNA petición.
   *
   * Es el MISMO endpoint que usa la web, y `hero`/`quickAccess`/`artists`
   * se pintan igual en los dos clientes: lo que decide un curador desde el
   * panel se ve en ambos sin desplegar nada.
   *
   * `rows` es la excepción: la app móvil ya trae "Escuchado recientemente",
   * "Tendencias" (/charts) y "Novedades" con sus propios componentes, cada
   * uno cargando y fallando por separado (ver el comentario al principio de
   * `app/(tabs)/index.tsx`), así que pintar además las filas de acá
   * duplicaría esas secciones. Se sigue mapeando para no bifurcar el tipo
   * `HomeFeed` entre plataformas, pero el cliente móvil no la renderiza.
   */
  async getHomeFeed({ signal }: ApiOptions = {}): Promise<HomeFeed> {
    const raw = await http.get<BackendHomeFeed>('/home', { signal });
    return {
      hero: raw.hero.map((item) => ({
        promotionId: item.promotionId,
        endsAt: item.endsAt,
        track: mapTrack(item.track),
        dominantColor: item.track.dominantColor ?? null,
      })),
      quickAccess: raw.quickAccess,
      rows: raw.rows.map((row) => ({ key: row.key, title: row.title, tracks: row.tracks.map((t) => mapTrack(t)) })),
      artists: raw.artists ?? [],
    };
  },

  /**
   * Secciones de la portada definidas en el panel de control ("Lo nuevo",
   * "Mola", "Los mejores álbumes"…).
   *
   * Es el MISMO endpoint que consume la web. Que las dos pidan lo mismo es
   * el punto: el curador cambia el orden o el contenido en un sitio y se
   * refleja en los dos clientes sin desplegar nada.
   */
  async getEditorialSections({ signal }: ApiOptions = {}): Promise<EditorialSection[]> {
    const { sections } = await http.get<{ sections: BackendEditorialSection[] }>('/editorial', { signal });
    return sections.map((section) => ({
      id: section.id,
      title: section.title,
      slug: section.slug,
      subtitle: section.subtitle ?? undefined,
      layout: section.layout,
      tracks: section.tracks.map((t) => mapTrack(t)),
      albums: section.albums.map((a) => ({
        id: a.id,
        title: a.title,
        coverUrl: a.coverUrl,
        artistName: a.artist.name,
      })),
      artists: section.artists.map((a) => ({
        id: a.id,
        name: a.name,
        imageUrl: a.imageUrl,
        isVerified: a.isVerified,
      })),
    }));
  },

  /* ------------------------------------------------------------------ *
   * Escrituras de biblioteca
   *
   * Hasta aquí este fichero era de sólo lectura salvo `createArtistProfile`:
   * los "me gusta", los seguidos y las playlists se guardaban únicamente en
   * el teléfono. Parecían funcionar, pero no existían para el servidor, así
   * que no se veían en la web ni en el panel y se perdían al reinstalar.
   * ------------------------------------------------------------------ */

  /** Alterna el "me gusta". Devuelve el estado REAL que quedó en el servidor. */
  async toggleLike(trackId: string, { signal }: ApiOptions = {}): Promise<boolean> {
    const { liked } = await http.post<{ liked: boolean }>(`/tracks/${trackId}/like`, {}, { signal });
    return liked;
  },

  /** Alterna el seguimiento de un artista. Devuelve el estado real resultante. */
  async toggleFollowArtist(artistId: string, { signal }: ApiOptions = {}): Promise<boolean> {
    const { isFollowing } = await http.post<{ isFollowing: boolean }>(
      `/artists/${artistId}/follow`,
      {},
      { signal },
    );
    return isFollowing;
  },

  /** Las canciones que el usuario marcó como favoritas, según el servidor. */
  async getLikedTracks({ signal }: ApiOptions = {}): Promise<Track[]> {
    const { tracks } = await http.get<{ tracks: BackendTrack[] }>('/tracks/liked?limit=100', { signal });
    return tracks.map((t) => mapTrack(t));
  },

  /** Los ids de los artistas que sigue el usuario. */
  async getFollowedArtistIds({ signal }: ApiOptions = {}): Promise<string[]> {
    const { artists } = await http.get<{ artists: { id: string }[] }>('/users/following?limit=100', { signal });
    return artists.map((a) => a.id);
  },

  async createPlaylist(
    input: { title: string; description?: string },
    { signal }: ApiOptions = {},
  ): Promise<Playlist> {
    const { playlist } = await http.post<{ playlist: BackendPlaylist }>('/playlists', input, { signal });
    return mapPlaylist(playlist);
  },

  async updatePlaylist(
    playlistId: string,
    patch: { title?: string; description?: string; coverUrl?: string; isPublic?: boolean },
    { signal }: ApiOptions = {},
  ): Promise<void> {
    await http.patch(`/playlists/${playlistId}`, patch, { signal });
  },

  async deletePlaylist(playlistId: string, { signal }: ApiOptions = {}): Promise<void> {
    await http.delete(`/playlists/${playlistId}`, { signal });
  },

  /**
   * Añade una pista a una playlist.
   *
   * El servidor responde 409 si ya estaba. Para quien llama eso no es un
   * fallo — el resultado deseado (la canción está en la playlist) ya se
   * cumple — así que se traga y se sigue, igual que hacía el store local.
   */
  async addTrackToPlaylist(playlistId: string, trackId: string, { signal }: ApiOptions = {}): Promise<void> {
    try {
      await http.post(`/playlists/${playlistId}/tracks`, { trackId }, { signal });
    } catch (error) {
      if (!isConflictError(error)) throw error;
    }
  },

  async removeTrackFromPlaylist(
    playlistId: string,
    trackId: string,
    { signal }: ApiOptions = {},
  ): Promise<void> {
    await http.delete(`/playlists/${playlistId}/tracks/${trackId}`, { signal });
  },

  /** Métricas reales del artista, calculadas sobre `StreamLog` y `Follow`. */
  async getArtistStats(artistId: string, { signal }: ApiOptions = {}): Promise<BackendArtistStats> {
    return http.get<BackendArtistStats>(`/artists/${artistId}/stats`, { signal });
  },
};

/** Forma cruda de `GET /home`. */
interface BackendHomeFeed {
  hero: { promotionId: string; endsAt: string | null; track: BackendTrack & { dominantColor?: string | null } }[];
  quickAccess: { kind: 'playlist' | 'track'; id: string; title: string; coverUrl: string | null; subtitle: string }[];
  rows: { key: string; title: string; tracks: BackendTrack[] }[];
  artists: { id: string; name: string; imageUrl: string; isVerified: boolean; listeners: number }[];
}

/** Portada ya mapeada a los tipos de la app. */
export interface HomeFeed {
  hero: { promotionId: string; endsAt: string | null; track: Track; dominantColor: string | null }[];
  quickAccess: { kind: 'playlist' | 'track'; id: string; title: string; coverUrl: string | null; subtitle: string }[];
  rows: { key: string; title: string; tracks: Track[] }[];
  artists: { id: string; name: string; imageUrl: string; isVerified: boolean; listeners: number }[];
}

/** Forma cruda que devuelve `GET /editorial`. */
interface BackendEditorialSection {
  id: string;
  title: string;
  slug: string;
  subtitle: string | null;
  layout: 'CAROUSEL' | 'GRID' | 'HERO';
  tracks: BackendTrack[];
  albums: { id: string; title: string; coverUrl: string; artist: { name: string } }[];
  artists: { id: string; name: string; imageUrl: string; isVerified: boolean }[];
}

/** Sección ya mapeada a los tipos de la app. */
export interface EditorialSection {
  id: string;
  title: string;
  slug: string;
  subtitle?: string;
  layout: 'CAROUSEL' | 'GRID' | 'HERO';
  tracks: Track[];
  albums: { id: string; title: string; coverUrl: string; artistName: string }[];
  artists: { id: string; name: string; imageUrl: string; isVerified: boolean }[];
}

export { isAbortError };
