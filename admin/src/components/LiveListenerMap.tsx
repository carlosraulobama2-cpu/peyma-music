import { useEffect, useState } from 'react';
import { Radio, ShieldCheck } from 'lucide-react';
import { http } from '../lib/httpClient';

/**
 * Mapa de oyentes en vivo.
 *
 * Proyección equirectangular en SVG puro, sin Mapbox ni Leaflet. Los
 * motivos: Mapbox necesita una clave de API y factura por carga de mapa, y
 * Leaflet arrastra ~150 KB más las teselas de OpenStreetMap, todo para
 * pintar unos pocos puntos de densidad sobre un fondo. Con una proyección
 * lineal y una rejilla de referencia se ve dónde está la gente, que es la
 * pregunta que responde esta tarjeta.
 *
 * El límite es honesto: no hay contornos de países. Si algún día hace falta
 * distinguir Portugal de España a simple vista, ahí sí toca una librería de
 * mapas — y este componente se reemplaza sin tocar nada más.
 *
 * Privacidad: los puntos llegan ya agregados y redondeados a ~11 km desde
 * el servidor, y sólo de usuarios que dieron permiso explícito. Aquí nunca
 * hay identidades, sólo conteos.
 */

interface MapPoint {
  lat: number;
  lon: number;
  listeners: number;
}

interface LiveMapResponse {
  windowMinutes: number;
  points: MapPoint[];
  consent: { granted: number; totalUsers: number };
}

const REFRESH_MS = 30_000;
const WIDTH = 720;
const HEIGHT = 360;

/** Equirectangular: longitud → x, latitud → y. Lineal en ambos ejes. */
function project(lat: number, lon: number): { x: number; y: number } {
  return {
    x: ((lon + 180) / 360) * WIDTH,
    y: ((90 - lat) / 180) * HEIGHT,
  };
}

export function LiveListenerMap() {
  const [data, setData] = useState<LiveMapResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      http
        .get<LiveMapResponse>('/admin/audience/live-map?minutes=60')
        .then((res) => {
          if (!cancelled) {
            setData(res);
            setError(null);
          }
        })
        .catch((err: unknown) => {
          if (!cancelled) setError(err instanceof Error ? err.message : 'No se pudo cargar el mapa.');
        });
    };

    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const totalListeners = data?.points.reduce((sum, point) => sum + point.listeners, 0) ?? 0;
  const maxAtPoint = Math.max(1, ...(data?.points.map((point) => point.listeners) ?? [1]));

  return (
    <section className="rounded-xl border border-white/10 bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <Radio size={15} className="text-brand" aria-hidden />
          Dónde se escucha ahora
        </h2>
        <p className="text-xs text-muted">Última hora · se actualiza cada 30 s</p>
      </div>

      {error && <p className="mt-3 text-sm font-semibold text-danger">{error}</p>}

      <div className="mt-4 overflow-hidden rounded-lg bg-black/40">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-auto w-full" role="img" aria-label="Mapa de oyentes">
          {/* Rejilla de referencia cada 30°: sin contornos de países, es lo
              que permite situar un punto aproximadamente. */}
          {[-60, -30, 0, 30, 60].map((lat) => (
            <line
              key={`lat-${lat}`}
              x1={0}
              x2={WIDTH}
              y1={project(lat, 0).y}
              y2={project(lat, 0).y}
              stroke="rgba(255,255,255,0.07)"
              strokeWidth={1}
            />
          ))}
          {[-120, -60, 0, 60, 120].map((lon) => (
            <line
              key={`lon-${lon}`}
              y1={0}
              y2={HEIGHT}
              x1={project(0, lon).x}
              x2={project(0, lon).x}
              stroke="rgba(255,255,255,0.07)"
              strokeWidth={1}
            />
          ))}
          {/* Ecuador y meridiano de Greenwich, algo más marcados. */}
          <line x1={0} x2={WIDTH} y1={HEIGHT / 2} y2={HEIGHT / 2} stroke="rgba(255,255,255,0.14)" strokeWidth={1} />
          <line x1={WIDTH / 2} x2={WIDTH / 2} y1={0} y2={HEIGHT} stroke="rgba(255,255,255,0.14)" strokeWidth={1} />

          {data?.points.map((point) => {
            const { x, y } = project(point.lat, point.lon);
            // El radio crece con la raíz del conteo: con escala lineal, un
            // punto con 100 oyentes taparía media pantalla.
            const radius = 4 + Math.sqrt(point.listeners / maxAtPoint) * 14;
            return (
              <g key={`${point.lat},${point.lon}`}>
                <circle cx={x} cy={y} r={radius} fill="var(--brand)" opacity={0.25} />
                <circle cx={x} cy={y} r={4} fill="var(--brand)">
                  <title>{`${point.listeners} oyente(s) cerca de ${point.lat}, ${point.lon}`}</title>
                </circle>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        <span className="text-muted">
          <strong className="text-foreground">{totalListeners}</strong> reproducción(es) situadas en{' '}
          <strong className="text-foreground">{data?.points.length ?? 0}</strong> zona(s)
        </span>
        {data && (
          // Sin esta cobertura, un mapa con tres puntos parecería que la
          // plataforma tiene tres oyentes, cuando lo que pasa es que sólo
          // tres dieron permiso.
          <span className="flex items-center gap-1.5 text-muted">
            <ShieldCheck size={13} aria-hidden />
            {data.consent.granted} de {data.consent.totalUsers} usuarios dieron permiso
          </span>
        )}
      </div>

      {data?.points.length === 0 && (
        <p className="mt-3 rounded-lg bg-white/5 px-3 py-2 text-xs text-muted">
          Todavía nadie con permiso ha escuchado algo en la última hora. El mapa sólo muestra a quien aceptó
          compartir su zona.
        </p>
      )}
    </section>
  );
}
