/**
 * Peyma Music — Tipos del motor de géneros y recomendaciones
 *
 * `Track`, `Artist`, `Album` y `Playlist` YA existen en `./index` (los usan
 * ~15 pantallas) — este archivo no los vuelve a declarar, sólo los
 * re-exporta junto con lo nuevo, para que Home pueda importar todo desde
 * un solo sitio: `import { Genre, Track, MediaItem } from '@/types/music'`.
 */
import type { Track, Artist, Album, Playlist, Genre } from './index';
export type { Track, Artist, Album, Playlist, Genre };

// `Genre` es un `type` (unión de literales), no un TS `enum`: los enums
// generan un objeto extra en el bundle de runtime que no hace falta acá —
// una unión de string literals ya da autocompletado, exhaustividad en
// `switch` y validación en compilación sin ese costo. Vive en
// `types/index.ts` porque `Track` la referencia directamente.

export const GENRES: readonly Genre[] = [
  'lofi',
  'jazz',
  'ambient',
  'pop',
  'hiphop',
  'classical',
  'electronic',
  'rock',
];

export const GENRE_LABEL: Record<Genre, string> = {
  lofi: 'Lo-Fi',
  jazz: 'Jazz',
  ambient: 'Ambient',
  pop: 'Pop',
  hiphop: 'Hip-Hop',
  classical: 'Clásica',
  electronic: 'Electrónica',
  rock: 'Rock',
};

/** Guarda de tipo: `string` de cualquier fuente (API, input) → `Genre` validado. */
export function isGenre(value: string): value is Genre {
  return (GENRES as readonly string[]).includes(value);
}

/**
 * Único punto de la app que decide si un ítem pertenece a la sección de un
 * género. Se usa en `GenreCarousel` antes de renderizar cualquier cosa.
 *
 * Por qué no se pueden mezclar los géneros: cada `GenreCarousel` es una
 * promesa implícita al usuario ("esto es Jazz"). Si coláramos ahí una pista
 * de Lo-Fi porque comparte artista o porque "es parecida", el carrusel deja
 * de ser confiable como filtro y el usuario pierde la capacidad de curar su
 * propio descubrimiento por estilo — exactamente el problema que
 * `secondaryGenres` existe para resolver de otra forma: una pista puede
 * *aparecer* en más de un carrusel (géneros secundarios), pero sólo si ese
 * género está *declarado*, nunca por similitud implícita/heurística.
 */
export function isValidGenreForSection(
  item: { primaryGenre?: Genre; secondaryGenres?: Genre[] },
  sectionGenre: Genre,
): boolean {
  if (item.primaryGenre === sectionGenre) return true;
  return item.secondaryGenres?.includes(sectionGenre) ?? false;
}

// ---------------------------------------------------------------------------
// Motor de comportamiento / afinidad
// ---------------------------------------------------------------------------

export type ListeningEventType = 'completed' | 'repeated_same_day' | 'liked' | 'skipped_early';

/** Puntos por tipo de evento — ver `UserAnalyticsEngine`. */
export const AFFINITY_POINTS: Record<ListeningEventType, number> = {
  completed: 10,
  repeated_same_day: 15,
  liked: 25,
  skipped_early: -15,
};

export interface ListeningEvent {
  id: string;
  trackId: string;
  artistId: string;
  genre: Genre | null;
  type: ListeningEventType;
  /** ISO. Determina el peso por desintegración temporal (últimos 7 días = 3x). */
  occurredAt: string;
  points: number;
}

export interface GenreScore {
  genre: Genre;
  /** Suma de puntos ya ponderados por desintegración temporal. */
  score: number;
}

export interface ArtistScore {
  artistId: string;
  score: number;
}

export interface TrackAffinity {
  trackId: string;
  score: number;
  lastInteractionAt: string;
}

/** Snapshot agregado que consume la UI — nunca la lista cruda de eventos. */
export interface UserMetrics {
  genreScores: Record<Genre, number>;
  artistScores: Record<string, number>;
  trackScores: Record<string, number>;
  /** Top-N ya ordenado, para no recalcular `sort()` en cada render de Home. */
  topGenres: GenreScore[];
  topArtists: ArtistScore[];
}

// ---------------------------------------------------------------------------
// Media unificado — lo que renderiza `MediaCard`
// ---------------------------------------------------------------------------

export type MediaKind = 'track' | 'album' | 'playlist' | 'artist';

export interface MediaItem {
  kind: MediaKind;
  id: string;
  title: string;
  subtitle?: string;
  coverUrl: string;
  /** Avatar circular (artistas) en vez de carátula cuadrada. */
  isCircular?: boolean;
  /** 0–1, "Continuar escuchando" — dibuja una barra de progreso sobre la carátula. */
  progressRatio?: number;
}

/** Por qué un ítem llegó a "Especialmente para ti": afinidad alta o exploración 20%. */
export type RecommendationReason = 'affinity' | 'exploration';

export interface RecommendationItem {
  track: Track;
  reason: RecommendationReason;
}
