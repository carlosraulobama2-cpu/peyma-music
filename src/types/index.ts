/**
 * Peyma Music — Tipos e interfaces compartidas
 */

/**
 * Universo cerrado de géneros para los carruseles dedicados de Inicio y el
 * motor de recomendaciones. Vive aquí (no en `types/music.ts`) porque
 * `Track` lo referencia directamente — `music.ts` lo re-exporta desde acá
 * para no crear una dependencia circular entre los dos archivos.
 */
export type Genre = 'lofi' | 'jazz' | 'ambient' | 'pop' | 'hiphop' | 'classical' | 'electronic' | 'rock';

export interface Track {
  id: string;
  title: string;
  artist: string;
  artistId: string;
  album: string;
  albumId: string;
  /** Segundos. */
  duration: number;
  coverUrl: string;
  audioUrl: string;
  isLiked: boolean;
  /** Reproducciones totales, tal como las cuenta `StreamLog`. Ausente donde el endpoint no las envía. */
  playCount?: number;
  /** Créditos — ausentes donde el endpoint no los incluye, nunca vacíos por diseño. */
  composer?: string;
  producer?: string;
  label?: string;
  isrc?: string;
  isExplicit?: boolean;

  // --- Campos del motor de recomendaciones (ver src/types/music.ts) ---
  // Opcionales a propósito: son aditivos sobre el `Track` que ya usan ~15
  // pantallas. Un track sin `primaryGenre` simplemente no entra en ningún
  // carrusel de género ni en el motor de afinidad — no rompe nada existente.
  /** Género principal — determina en qué `GenreCarousel` puede aparecer. */
  primaryGenre?: Genre;
  /** Géneros adicionales *declarados* (no inferidos) en los que también puede aparecer. */
  secondaryGenres?: Genre[];
  /** Fecha ISO de lanzamiento, para "Novedades" (últimos 30 días). */
  releaseDate?: string;
  /** Pulsaciones por minuto — usado por el 20% de "exploración" del motor de recomendaciones. */
  bpm?: number;
  /** `true` fuerza su inclusión en "Novedades" sin importar `releaseDate`. */
  isNewRelease?: boolean;
}

export interface Artist {
  id: string;
  name: string;
  imageUrl: string;
  genres: string[];
  monthlyListeners: number;
  bio?: string;
  /** Check de verificación otorgado desde el panel de control. */
  isVerified?: boolean;
  /** Artista destacado del momento — alimenta `FeaturedArtistBanner` en Inicio. */
  isFeatured?: boolean;
}

export interface Album {
  id: string;
  title: string;
  artistId: string;
  artistName: string;
  coverUrl: string;
  releaseYear: number;
  tracks: Track[];
  /** Fecha ISO exacta de lanzamiento; si falta, se usa `releaseYear` como aproximación. */
  releaseDate?: string;
}

export interface Playlist {
  id: string;
  title: string;
  description?: string;
  coverUrl: string;
  ownerId: string;
  ownerName: string;
  tracks: Track[];
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export type AccountType = 'listener' | 'artist';

/** Espejo del enum `LocationConsent` de Prisma. */
export type LocationConsentValue = 'NOT_ASKED' | 'GRANTED' | 'DENIED';

export interface User {
  id: string;
  displayName: string;
  email: string;
  avatarUrl?: string;
  favoriteGenres: string[];
  createdAt: string;
  accountType: AccountType;
  locationConsent: LocationConsentValue;
}

/** Desglose de oyentes por país, para el panel "Dónde te escuchan" del artista. */
/**
 * Una pista en el ranking propio del artista. Forma plana, igual que la
 * devuelve `GET /artists/:id/stats`: no es un `Track` completo porque el
 * endpoint de métricas no tiene por qué cargar el catálogo entero.
 */
export interface ArtistTrackStat {
  trackId: string;
  title: string;
  coverUrl: string | null;
  duration: number;
  streams: number;
}

/**
 * Métricas reales del artista, calculadas sobre `StreamLog` y `Follow`.
 *
 * No hay reparto por países: `StreamLog` guarda coordenadas redondeadas
 * (y sólo con consentimiento), no un país, y el proyecto no tiene
 * geocodificador. Antes el Studio mostraba un top de países sacado de una
 * lista fija; se quitó en vez de seguir enseñándolo.
 */
export interface ArtistStats {
  monthlyListeners: number;
  followers: number;
  totalStreams: number;
  /** Reproducciones de los últimos 14 días, del día más antiguo al más reciente. */
  streamsLast14Days: number[];
  topTracks: ArtistTrackStat[];
}

export type RepeatMode = 'off' | 'track' | 'queue';

/**
 * Forma canónica del estado del reproductor — lo que expone `useAudioPlayer()`.
 * `playerStore` la extiende con sus acciones; no hay dos definiciones del
 * mismo estado por separado.
 */
export interface PlayerState {
  currentTrack: Track | null;
  queue: Track[];
  queueIndex: number;
  isPlaying: boolean;
  /** `true` mientras se resuelve un `play()` (antes de que TrackPlayer confirme el arranque). */
  isBuffering: boolean;
  isShuffled: boolean;
  repeatMode: RepeatMode;
  /** Segundos transcurridos. */
  progress: number;
  /** Duración total en segundos. */
  duration: number;
  /** 0–1. */
  volume: number;
  /** Mensaje listo para mostrar al usuario si la última operación de red/buffering falló; `null` si todo va bien. */
  playbackError: string | null;
}

/** Duraciones ofrecidas por el temporizador de apagado, en minutos. */
export type SleepTimerDuration = 15 | 30 | 45 | 60;

export interface SleepTimer {
  isActive: boolean;
  /** Epoch ms en el que se pausará la reproducción, o `null` si no hay temporizador activo. */
  endsAt: number | null;
  /** Minutos restantes, redondeados hacia arriba; `null` si no hay temporizador activo. */
  minutesRemaining: number | null;
}

export interface SearchResults {
  tracks: Track[];
  artists: Artist[];
  albums: Album[];
  playlists: Playlist[];
}

export type SearchCategory = 'all' | 'tracks' | 'artists' | 'albums' | 'playlists';

/**
 * Paginación por cursor. Es la que escala: `skip/take` obliga a la base a
 * contar y descartar filas, y se degrada a medida que crece el offset.
 */
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  total?: number;
}

/** Estado de una carga asíncrona, para que las pantallas no reinventen flags. */
export type AsyncState = 'idle' | 'loading' | 'refreshing' | 'success' | 'error';

export type { TrendingTrack, TrendingChart } from './trending';
