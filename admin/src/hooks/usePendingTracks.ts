import { useCallback, useEffect, useState } from 'react';
import { fetchPendingTracks, type ModerationTrack } from '../lib/moderation';

export function usePendingTracks() {
  const [tracks, setTracks] = useState<ModerationTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchPendingTracks()
      .then((res) => setTracks(res.tracks))
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo cargar la cola de moderación.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    // Carga inicial desde la API (sistema externo) — `refresh` hace sets
    // síncronos al arrancar, es justamente lo que tiene que pasar acá.
    // oxlint-disable-next-line react/set-state-in-effect
    refresh();
  }, [refresh]);

  const removeTrack = useCallback((trackId: string) => {
    setTracks((prev) => prev.filter((t) => t.id !== trackId));
  }, []);

  return { tracks, loading, error, removeTrack, refresh };
}
