/**
 * Peyma Music — Motor de recomendaciones ("Especialmente para ti")
 *
 * Regla de diversidad 80/20 (exploración vs. explotación): el 80% de la
 * lista sale de los géneros/artistas de mayor afinidad (explotación — lo
 * que ya sabemos que le gusta); el 20% restante es "exploración": pistas
 * fuera de su top-3 pero con un BPM parecido al de lo que más escucha, para
 * no encerrarlo en una burbuja de filtro. Sin esto, el motor sólo le
 * mostraría siempre más de lo mismo y nunca lo dejaría descubrir nada.
 */
import { useMemo } from 'react';
import { useUserBehaviorStore } from '../store/userBehaviorStore';
import { useAsyncData } from './useAsyncData';
import { api } from '../services/api';
import type { Track } from '../types';
import type { RecommendationItem } from '../types/music';

const EXPLOIT_RATIO = 0.8;
const TOP_N = 3;
/** Ventana de BPM para la exploración — "parecido", no idéntico. */
const BPM_SIMILARITY_WINDOW = 15;

interface UseRecommendationsResult {
  items: RecommendationItem[];
  isLoading: boolean;
  error: string | null;
  /** `true` cuando aún no hay suficiente historial y se muestra un catálogo genérico. */
  isColdStart: boolean;
  refresh: () => void;
}

function averageBpm(tracks: Track[]): number | null {
  const withBpm = tracks.filter((t): t is Track & { bpm: number } => typeof t.bpm === 'number');
  if (withBpm.length === 0) return null;
  return withBpm.reduce((sum, t) => sum + t.bpm, 0) / withBpm.length;
}

export function useRecommendations(limit = 16): UseRecommendationsResult {
  const metrics = useUserBehaviorStore((s) => s.metrics);

  const { data: catalog, isLoading, error, refresh } = useAsyncData<Track[]>(
    (signal) => api.getTracks({ signal }),
    [],
    'No pudimos cargar tus recomendaciones.',
  );

  const result = useMemo<Pick<UseRecommendationsResult, 'items' | 'isColdStart'>>(() => {
    if (!catalog || catalog.length === 0) return { items: [], isColdStart: true };

    const topGenreIds = new Set(metrics.topGenres.slice(0, TOP_N).map((g) => g.genre));
    const topArtistIds = new Set(metrics.topArtists.slice(0, TOP_N).map((a) => a.artistId));
    const isColdStart = topGenreIds.size === 0 && topArtistIds.size === 0;

    // Arranque en frío: sin historial todavía no hay afinidad que explotar —
    // se muestra una selección general en vez de una sección vacía.
    if (isColdStart) {
      const items: RecommendationItem[] = [...catalog]
        .sort((a, b) => (b.releaseDate ?? '').localeCompare(a.releaseDate ?? ''))
        .slice(0, limit)
        .map((track) => ({ track, reason: 'exploration' as const }));
      return { items, isColdStart: true };
    }

    const affinityTracks = catalog.filter(
      (t) => (t.primaryGenre && topGenreIds.has(t.primaryGenre)) || topArtistIds.has(t.artistId),
    );
    // No pisa el catálogo real: si no le gusta nada afín, no inventa un 80%.
    const targetAffinityCount = Math.round(limit * EXPLOIT_RATIO);
    const affinitySelection = [...affinityTracks]
      .sort((a, b) => (metrics.trackScores[b.id] ?? 0) - (metrics.trackScores[a.id] ?? 0))
      .slice(0, targetAffinityCount);

    const selectedIds = new Set(affinitySelection.map((t) => t.id));
    const targetBpm = averageBpm(affinitySelection);

    const explorationPool = catalog.filter((t) => {
      if (selectedIds.has(t.id)) return false;
      const isOutsideAffinity = !(t.primaryGenre && topGenreIds.has(t.primaryGenre)) && !topArtistIds.has(t.artistId);
      if (!isOutsideAffinity) return false;
      if (targetBpm === null || typeof t.bpm !== 'number') return true;
      return Math.abs(t.bpm - targetBpm) <= BPM_SIMILARITY_WINDOW;
    });

    const explorationSelection = explorationPool.slice(0, limit - affinitySelection.length);

    // Dedup explícito: si por algún motivo se solaparan (no debería, vienen
    // de conjuntos disjuntos), un `Map` por id garantiza cero duplicados.
    const merged = new Map<string, RecommendationItem>();
    for (const track of affinitySelection) merged.set(track.id, { track, reason: 'affinity' });
    for (const track of explorationSelection) merged.set(track.id, { track, reason: 'exploration' });

    return { items: Array.from(merged.values()).slice(0, limit), isColdStart: false };
  }, [catalog, metrics, limit]);

  return { ...result, isLoading, error, refresh };
}
