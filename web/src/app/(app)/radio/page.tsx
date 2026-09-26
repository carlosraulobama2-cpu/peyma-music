"use client";

import { useCallback, useEffect, useState } from "react";
import { usePlayerStore } from "../../../store/usePlayerStore";
import {
  searchStations,
  getTopStations,
  registerStationClick,
  logRadioOpen,
  stationToCatalogTrack,
  RADIO_TRACK_ID_PREFIX,
  type RadioStation,
} from "../../../lib/radioApi";
import { CoverImage } from "../../../components/CoverImage";

/**
 * Radio en vivo, vía Radio Browser (radio-browser.info) — misma base
 * comunitaria y gratuita que usa la app móvil (ver `app/radio/index.tsx`).
 *
 * Es contenido de terceros, no del catálogo propio: no usa
 * `useCatalogSection` (que asume que un fallo puede quedarse en silencio
 * como "sección vacía" para una fila más del Main Stage) porque acá SÍ hace
 * falta re-consultar cuando cambia el filtro de género, algo que ese hook
 * no soporta.
 */
const TAGS: { id: string; label: string }[] = [
  { id: "", label: "Populares" },
  { id: "pop", label: "Pop" },
  { id: "rock", label: "Rock" },
  { id: "reggaeton", label: "Reggaetón" },
  { id: "latin", label: "Latina" },
  { id: "electronic", label: "Electrónica" },
  { id: "jazz", label: "Jazz" },
  { id: "classical", label: "Clásica" },
  { id: "news", label: "Noticias" },
  { id: "sports", label: "Deportes" },
  { id: "talk", label: "Talk" },
];

export default function RadioPage() {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const play = usePlayerStore((s) => s.play);
  const togglePlay = usePlayerStore((s) => s.togglePlay);

  const [activeTag, setActiveTag] = useState("");
  const [stations, setStations] = useState<RadioStation[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    logRadioOpen();
  }, []);

  const load = useCallback((tag: string, cancelledRef: { current: boolean }) => {
    setStations(null);
    setFailed(false);
    const fetcher = tag ? searchStations({ tag }) : getTopStations();
    fetcher
      .then((data) => {
        if (!cancelledRef.current) setStations(data);
      })
      .catch(() => {
        if (!cancelledRef.current) {
          setStations([]);
          setFailed(true);
        }
      });
  }, []);

  useEffect(() => {
    const cancelledRef = { current: false };
    // Hook de carga de una sola sección (mismo patrón que `useAsyncData` en
    // la app y `useCatalogSection` acá en la web): la sincronización real es
    // "cuando cambia el tag, volvé a pedir", el estado que arma la vista se
    // escribe desde los callbacks de la promesa.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(activeTag, cancelledRef);
    return () => {
      cancelledRef.current = true;
    };
  }, [activeTag, load]);

  const activeStationId = currentTrack?.id.startsWith(RADIO_TRACK_ID_PREFIX)
    ? currentTrack.id.slice(RADIO_TRACK_ID_PREFIX.length)
    : null;

  const handleStationClick = (station: RadioStation) => {
    if (!stations) return;
    if (activeStationId === station.id) {
      togglePlay();
      return;
    }
    registerStationClick(station.id);
    play(stationToCatalogTrack(station), stations.map(stationToCatalogTrack));
  };

  return (
    <main className="flex-1 px-6 py-8 pb-32 sm:px-10">
      <header className="mb-8">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-[#FF5A5A]" aria-hidden />
          Radio en vivo
        </p>
        <h1 className="mt-1 text-4xl font-extrabold tracking-tight sm:text-5xl">Miles de emisoras, en directo</h1>
        <p className="mt-2 text-sm text-muted">
          Estaciones reales de todo el mundo, vía Radio Browser — contenido de terceros, no pasa por el catálogo de
          Peyma.
        </p>
      </header>

      <div className="mb-6 flex flex-wrap gap-2">
        {TAGS.map((tag) => (
          <button
            key={tag.id}
            onClick={() => setActiveTag(tag.id)}
            aria-pressed={activeTag === tag.id}
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
              activeTag === tag.id ? "bg-foreground text-background" : "bg-white/10 text-muted hover:text-foreground"
            }`}
          >
            {tag.label}
          </button>
        ))}
      </div>

      {stations === null ? (
        <div className="flex flex-col gap-2">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-white/5" />
          ))}
        </div>
      ) : stations.length === 0 ? (
        <p className="text-sm text-muted">
          {failed
            ? "No pudimos conectar con Radio Browser — puede que sus servidores estén ocupados. Probá de nuevo en un momento."
            : "No encontramos estaciones para este género. Probá con otro."}
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {stations.map((station) => {
            const isActive = activeStationId === station.id;
            return (
              <li key={station.id}>
                <button
                  onClick={() => handleStationClick(station)}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-white/5"
                >
                  <CoverImage src={station.favicon} alt={station.name} size={48} rounded="rounded-lg" glow={false} />
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-sm font-semibold ${isActive ? "text-brand" : ""}`}>{station.name}</p>
                    <p className="truncate text-xs uppercase text-muted">
                      {[station.tags[0], station.countryCode, station.bitrate ? `${station.bitrate} kbps` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white/10 text-sm">
                    {isActive && isPlaying ? "⏸" : "▶"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
