"use client";

import { useEffect, useState } from "react";

/** Cada sección del Main Stage resuelve por separado — así una que tarda más no bloquea a las demás. */
export function useCatalogSection<T>(fetcher: () => Promise<T[]>): { items: T[]; loading: boolean } {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetcher()
      .then((data) => {
        if (!cancelled) setItems(data);
      })
      .catch(() => {
        // Una sección que falla se queda vacía y se oculta — no tira abajo el resto del Main Stage.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `fetcher` se pasa como función estable inline en cada callsite, no como dependencia reactiva
  }, []);

  return { items, loading };
}
