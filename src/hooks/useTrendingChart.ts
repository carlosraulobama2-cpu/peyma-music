/**
 * Peyma Music — Top Charts
 * Ranking real (GET /recommendations/trending), con soporte de refresh y cancelación.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import type { TrendingChart } from '../types';
import { api, isAbortError } from '../services';

interface UseTrendingChartResult {
  chart: TrendingChart | null;
  loading: boolean;
  error: string | null;
  /** Siempre `true`: el backend todavía no tiene datos de ubicación del oyente, sólo un chart global. */
  usingGlobalFallback: boolean;
  refresh: () => void;
}

export function useTrendingChart(): UseTrendingChartResult {
  const [chart, setChart] = useState<TrendingChart | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchChart = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    api
      .getTrending({ signal: controller.signal })
      .then(setChart)
      .catch((err) => {
        if (isAbortError(err)) return;
        setError(err instanceof Error ? err.message : 'Error al cargar las tendencias. Intenta de nuevo.');
      })
      .finally(() => {
        if (abortRef.current === controller) setLoading(false);
      });
  }, []);

  useEffect(() => {
    // `fetchChart` es un hook de datos autocontenido, el patrón que React
    // recomienda en su lugar — ver la nota equivalente en useAsyncData.ts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchChart();
    return () => abortRef.current?.abort();
  }, [fetchChart]);

  return { chart, loading, error, usingGlobalFallback: true, refresh: fetchChart };
}
