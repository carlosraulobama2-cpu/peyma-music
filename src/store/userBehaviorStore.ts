/**
 * Peyma Music — Motor de comportamiento del usuario (Affinity Engine)
 *
 * Registra eventos de escucha (completar, repetir el mismo día, guardar en
 * favoritos, saltar en los primeros 10s) y los agrega en un "Affinity
 * Score" por canción/artista/género, con desintegración temporal: una
 * escucha de esta semana pesa 3x más que una de hace un mes. `useRecommendations`
 * consume el snapshot (`metrics`), nunca la lista cruda de eventos.
 *
 * Separación de responsabilidades a propósito:
 *  - `libraryStore` guarda QUÉ le gusta al usuario (favoritos, follows).
 *  - `userBehaviorStore` interpreta CÓMO escucha, para inferir afinidad.
 * Son cosas distintas — mezclarlas en un solo store habría acoplado "estado
 * de biblioteca" (CRUD simple) con "modelo de comportamiento" (agregación,
 * decay, debounce), que evolucionan por razones distintas.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Genre } from '../types';
import { AFFINITY_POINTS, GENRES, type GenreScore, type ArtistScore, type ListeningEvent, type ListeningEventType, type UserMetrics } from '../types/music';

/** Cuántos eventos crudos se conservan — suficiente historial sin crecer sin límite. */
const MAX_EVENTS = 300;
/** Debounce del recálculo de métricas: varios eventos seguidos → un solo re-render "pesado". */
const RECOMPUTE_DEBOUNCE_MS = 30_000;
/** Ventana "reciente" con peso 3x, tal como pide el spec ("últimos 7 días vs. hace un mes"). */
const RECENT_WINDOW_DAYS = 7;
const RECENT_WEIGHT = 3;
const BASE_WEIGHT = 1;

function emptyGenreScores(): Record<Genre, number> {
  return Object.fromEntries(GENRES.map((g) => [g, 0])) as Record<Genre, number>;
}

function ageInDays(iso: string, now: number): number {
  return (now - new Date(iso).getTime()) / 86_400_000;
}

/** Desintegración temporal: eventos de los últimos 7 días pesan 3x más que los más viejos. */
function timeDecayWeight(occurredAt: string, now: number): number {
  return ageInDays(occurredAt, now) <= RECENT_WINDOW_DAYS ? RECENT_WEIGHT : BASE_WEIGHT;
}

function computeMetrics(events: ListeningEvent[]): UserMetrics {
  const now = Date.now();
  const genreScores = emptyGenreScores();
  const artistScores: Record<string, number> = {};
  const trackScores: Record<string, number> = {};

  for (const event of events) {
    const weighted = event.points * timeDecayWeight(event.occurredAt, now);
    if (event.genre) genreScores[event.genre] += weighted;
    artistScores[event.artistId] = (artistScores[event.artistId] ?? 0) + weighted;
    trackScores[event.trackId] = (trackScores[event.trackId] ?? 0) + weighted;
  }

  const topGenres: GenreScore[] = GENRES.map((genre) => ({ genre, score: genreScores[genre] }))
    .filter((g) => g.score > 0)
    .sort((a, b) => b.score - a.score);

  const topArtists: ArtistScore[] = Object.entries(artistScores)
    .map(([artistId, score]) => ({ artistId, score }))
    .filter((a) => a.score > 0)
    .sort((a, b) => b.score - a.score);

  return { genreScores, artistScores, trackScores, topGenres, topArtists };
}

interface RecordEventInput {
  trackId: string;
  artistId: string;
  genre: Genre | null;
  type: ListeningEventType;
}

interface UserBehaviorStore {
  events: ListeningEvent[];
  /** Snapshot agregado y con decay ya aplicado — esto es lo que debe leer la UI. */
  metrics: UserMetrics;

  recordEvent: (input: RecordEventInput) => void;
  /** Fuerza el recálculo ya mismo, sin esperar el debounce (p. ej. en tests). */
  recomputeNow: () => void;
  reset: () => void;
}

let recomputeHandle: ReturnType<typeof setTimeout> | null = null;

export const useUserBehaviorStore = create<UserBehaviorStore>()(
  persist(
    (set, get) => ({
      events: [],
      metrics: computeMetrics([]),

      recordEvent: (input) => {
        const event: ListeningEvent = {
          id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          trackId: input.trackId,
          artistId: input.artistId,
          genre: input.genre,
          type: input.type,
          occurredAt: new Date().toISOString(),
          points: AFFINITY_POINTS[input.type],
        };

        set((state) => ({ events: [event, ...state.events].slice(0, MAX_EVENTS) }));

        // Debounce a 30s: N eventos seguidos (p. ej. escuchar 5 canciones
        // seguidas) recalculan las métricas una sola vez, no N veces — evita
        // re-renderizar cada sección de Inicio que lee `metrics` en cada tick.
        if (recomputeHandle) clearTimeout(recomputeHandle);
        recomputeHandle = setTimeout(() => {
          recomputeHandle = null;
          set((state) => ({ metrics: computeMetrics(state.events) }));
        }, RECOMPUTE_DEBOUNCE_MS);
      },

      recomputeNow: () => {
        if (recomputeHandle) {
          clearTimeout(recomputeHandle);
          recomputeHandle = null;
        }
        set({ metrics: computeMetrics(get().events) });
      },

      reset: () => {
        if (recomputeHandle) {
          clearTimeout(recomputeHandle);
          recomputeHandle = null;
        }
        set({ events: [], metrics: computeMetrics([]) });
      },
    }),
    {
      name: 'peyma-user-behavior',
      storage: createJSONStorage(() => AsyncStorage),
      // Sólo se persisten los eventos crudos; `metrics` se recalcula al
      // arrancar (ver `onRehydrateStorage`) para que el decay temporal
      // siempre esté al día con el reloj actual, no con el de la última sesión.
      partialize: (state) => ({ events: state.events }),
      onRehydrateStorage: () => (state) => {
        state?.recomputeNow();
      },
    },
  ),
);
