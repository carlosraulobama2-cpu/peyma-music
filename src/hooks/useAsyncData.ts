/**
 * Peyma Music — Carga de datos genérica
 *
 * Las pantallas de Álbum, Artista y Playlist repetían el mismo patrón
 * (loading/error/data + fetch en useEffect). Este hook lo centraliza,
 * cancela peticiones obsoletas vía AbortSignal y evita el clásico
 * "setState después de desmontar".
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { isAbortError } from '../services/api';

interface UseAsyncDataResult<T> {
  data: T | null;
  isLoading: boolean;
  /** `true` sólo en la recarga manual (`refresh`), para no tapar el contenido con un skeleton. */
  isRefreshing: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * @param fetcher Recibe un AbortSignal; debe pasarlo a `api.*` para que las
 * peticiones abandonadas (navegación rápida, cambio de `deps`) no pisen el
 * resultado de la petición vigente.
 * @param deps Se re-ejecuta cuando cambian, igual que un array de useEffect.
 */
export function useAsyncData<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
  errorMessage = 'Ocurrió un error al cargar. Intenta de nuevo.',
): UseAsyncDataResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const run = useCallback(
    (signal: AbortSignal, isRefresh: boolean) => {
      if (isRefresh) setIsRefreshing(true);
      else setIsLoading(true);
      setError(null);

      fetcherRef
        .current(signal)
        .then((result) => {
          if (signal.aborted) return;
          setData(result);
        })
        .catch((err) => {
          if (signal.aborted || isAbortError(err)) return;
          console.error('[useAsyncData]', err);
          setError(errorMessage);
        })
        .finally(() => {
          if (signal.aborted) return;
          setIsLoading(false);
          setIsRefreshing(false);
        });
    },
    [errorMessage],
  );

  useEffect(() => {
    const controller = new AbortController();
    // `run` fetches data and, once resolved, syncs the result into state —
    // this is the standard "encapsulated data hook" pattern React's own docs
    // recommend in place of an inline fetch effect; the lint rule can't tell
    // the two apart, so it's silenced here rather than reached for a reducer.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    run(controller.signal, false);
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const refresh = useCallback(() => {
    const controller = new AbortController();
    run(controller.signal, true);
  }, [run]);

  return { data, isLoading, isRefreshing, error, refresh };
}
