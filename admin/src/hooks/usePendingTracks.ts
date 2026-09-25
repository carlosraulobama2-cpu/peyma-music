import { useCallback, useEffect, useState } from 'react';
import { fetchPendingTracks, type ModerationTrack } from '../lib/moderation';

export function usePendingTracks() {
  const [tracks, setTracks] = useState<ModerationTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Trae la cola. No toca el estado de forma SÍNCRONA: todo lo que escribe
   * va dentro de los callbacks de la promesa.
   *
   * Esa separación es la que permite llamarla desde el efecto de montaje sin
   * provocar un render en cascada. Antes el efecto llamaba a `refresh`, que
   * empieza poniendo `loading: true`, y eso es un set síncrono dentro del
   * efecto — además de redundante, porque el estado ya nace en "cargando".
   */
  const cargar = useCallback(
    () =>
      fetchPendingTracks()
        .then((res) => setTracks(res.tracks))
        .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo cargar la cola de moderación.'))
        .finally(() => setLoading(false)),
    [],
  );

  /**
   * Recarga a petición (el botón de refrescar, o tras moderar una pista).
   * Aquí sí se vuelve a "cargando", que es lo que el usuario espera ver
   * cuando pulsa él.
   */
  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    void cargar();
  }, [cargar]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const removeTrack = useCallback((trackId: string) => {
    setTracks((prev) => prev.filter((t) => t.id !== trackId));
  }, []);

  return { tracks, loading, error, removeTrack, refresh };
}
