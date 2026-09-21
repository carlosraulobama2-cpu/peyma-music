"use client";

import { useCallback, useEffect, useState } from "react";
import { http } from "./httpClient";
import type { CatalogTrack } from "./catalog";
import type { EditorialSection } from "./editorial";

/**
 * Portada de Inicio en UNA sola petición, con caché en memoria.
 *
 * Antes esta pantalla lanzaba cinco llamadas en paralelo (novedades,
 * tendencias, para ti, álbumes, playlists), cada una con su estado de carga
 * y su error. Ahora `/home` devuelve todo junto y la composición de la
 * portada la decide el servidor, que es el único sitio donde puede quedar
 * igual para la web y para la app.
 *
 * La caché vive en un módulo, no en el componente: al navegar a un artista
 * y volver, el componente se desmonta y se vuelve a montar, y un estado
 * local haría una petición nueva cada vez. Con el módulo, volver a Inicio
 * es instantáneo.
 *
 * Estrategia stale-while-revalidate: si hay datos de menos de 5 minutos se
 * muestran al instante; si son más viejos se muestran igual y se refresca
 * por detrás. El usuario nunca ve un esqueleto por datos que ya tenía.
 */

const FRESH_MS = 5 * 60 * 1000;

export interface HeroItem {
  promotionId: string;
  position: number;
  endsAt: string | null;
  track: CatalogTrack & { dominantColor?: string | null };
}

export interface QuickAccessItem {
  kind: "playlist" | "track";
  id: string;
  title: string;
  coverUrl: string | null;
  subtitle: string;
}

export interface HomeRow {
  key: string;
  title: string;
  tracks: (CatalogTrack & { dominantColor?: string | null; playCount?: number })[];
}

export interface PopularArtist {
  id: string;
  name: string;
  imageUrl: string;
  isVerified: boolean;
  listeners: number;
}

export interface HomeFeed {
  hero: HeroItem[];
  quickAccess: QuickAccessItem[];
  rows: HomeRow[];
  artists: PopularArtist[];
  sections: EditorialSection[];
  generatedAt: string;
}

/**
 * Caché a nivel de módulo.
 *
 * `inFlight` evita el problema clásico: si dos componentes piden a la vez (o
 * el usuario vuelve mientras aún carga), sin esto saldrían dos peticiones
 * idénticas. Con la promesa compartida, la segunda espera a la primera.
 */
let cache: { data: HomeFeed; at: number } | null = null;
let inFlight: Promise<HomeFeed> | null = null;

/**
 * `force` salta la petición ya en curso.
 *
 * Reutilizarla estaría bien para dos montajes simultáneos, pero no para un
 * "actualizar": quien lo pulsa quiere datos de AHORA, y devolverle la
 * respuesta de una petición que salió antes de que él tocara nada le entrega
 * exactamente lo que estaba intentando renovar.
 */
async function load(force = false): Promise<HomeFeed> {
  if (inFlight && !force) return inFlight;

  const request = http
    .get<HomeFeed>("/home")
    .then((data) => {
      cache = { data, at: Date.now() };
      return data;
    })
    .finally(() => {
      // Sólo se limpia si sigue siendo la petición vigente: una forzada que
      // termina después de otra no debe borrar el marcador de esa otra.
      if (inFlight === request) inFlight = null;
    });

  inFlight = request;
  return request;
}

/**
 * Invalida la caché. La llaman el "actualizar" y, sobre todo, el cambio de
 * sesión.
 *
 * Esto último no es cosmético: la caché vive en el módulo y Next navega sin
 * recargar la página, así que sin invalidarla al entrar o salir de una cuenta
 * el siguiente usuario del mismo navegador vería durante cinco minutos los
 * accesos rápidos y el "escuchado recientemente" del anterior.
 */
export function invalidateHomeFeed(): void {
  clearCache();
  // Vaciar la caché no basta: el componente ya está montado y su efecto no
  // volverá a correr solo, así que seguiría pintando en pantalla los datos
  // del usuario anterior. Hay que avisarle.
  for (const listener of listeners) listener();
}

/**
 * Tira la caché SIN avisar a los hooks montados.
 *
 * Es lo que quiere el botón de actualizar: ya se encarga él de volver a
 * pedir, y notificar además dispararía una segunda petición y un parpadeo
 * del esqueleto sobre datos que el usuario está mirando.
 */
function clearCache(): void {
  cache = null;
  inFlight = null;
}

/** Hooks montados que quieren enterarse de una invalidación. */
const listeners = new Set<() => void>();

export function useHomeFeed() {
  // Estado inicial desde la caché: si hay datos, el primer render ya los
  // pinta y no se ve ningún esqueleto.
  const [data, setData] = useState<HomeFeed | null>(cache?.data ?? null);
  const [loading, setLoading] = useState(cache === null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    clearCache();
    try {
      setData(await load(true));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar Inicio.");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const fetchIfStale = () => {
      // Datos frescos: no se toca la red.
      if (cache !== null && Date.now() - cache.at < FRESH_MS) return;

      load()
        .then((fresh) => {
          if (cancelled) return;
          setData(fresh);
          setError(null);
        })
        .catch((err: unknown) => {
          // Si ya había datos viejos en pantalla se mantienen: un fallo de red
          // al refrescar no debe vaciar una portada que ya funcionaba.
          if (!cancelled && cache === null) {
            setError(err instanceof Error ? err.message : "No se pudo cargar Inicio.");
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };

    /**
     * Al invalidar (típicamente un cambio de sesión) se vacía lo que hay en
     * pantalla ANTES de pedir lo nuevo. Enseñar un esqueleto un instante es
     * correcto; seguir enseñando la portada de otra cuenta mientras llega la
     * respuesta, no.
     */
    const onInvalidated = () => {
      if (cancelled) return;
      setData(null);
      setLoading(true);
      fetchIfStale();
    };

    listeners.add(onInvalidated);
    fetchIfStale();

    return () => {
      cancelled = true;
      listeners.delete(onInvalidated);
    };
  }, []);

  return { data, loading, error, refresh };
}
