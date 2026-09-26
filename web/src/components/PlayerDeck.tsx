"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePlayerStore } from "../store/usePlayerStore";
import { CoverImage } from "./CoverImage";
import { http } from "../lib/httpClient";
import { getStoredCoords } from "./LocationConsentBanner";
import { prefetchTrack, getPrefetchedUrl, purgeExcept } from "../lib/audioPrefetch";
import { usePeymaConnect } from "../lib/usePeymaConnect";
import { useKeyboardShortcuts } from "../lib/useKeyboardShortcuts";
import { QueueDrawer } from "./QueueDrawer";
import { SpectrumVisualizer } from "./SpectrumVisualizer";
import { initAudioEngine, resumeAudioContext, setLofiEnabled } from "../lib/audioEngine";
import { useUiStore } from "../store/useUiStore";
import { isRadioTrack } from "../lib/radioApi";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Barra inferior fija (90px), fuera del árbol de cada página — vive en el
 * layout raíz para no desmontarse al navegar entre rutas. El `<audio>` real
 * está acá adentro; el resto de la app sólo lee/escribe `usePlayerStore`.
 */
export function PlayerDeck() {
  const { currentTrack, isPlaying, progress, duration, volume, togglePlay, next, previous, setProgress, setDuration, setVolume } =
    usePlayerStore();
  const remoteDeviceName = usePlayerStore((s) => s.remoteDeviceName);
  const seekNonce = usePlayerStore((s) => s.seekNonce);
  const queue = usePlayerStore((s) => s.queue);
  const queueIndex = usePlayerStore((s) => s.queueIndex);
  const audioRef = useRef<HTMLAudioElement>(null);
  /**
   * Segundos realmente escuchados de la pista actual, y la última posición
   * vista. En refs y no en estado: `timeupdate` dispara ~4 veces por
   * segundo y en estado provocaría ese mismo número de renders del
   * reproductor entero.
   */
  const listenedRef = useRef(0);
  const lastTimeRef = useRef(0);
  /** true mientras `audio.src` es el blob precargado (sólo los primeros ~2 MB). */
  const isPrefetchedSourceRef = useRef(false);
  const [showQueue, setShowQueue] = useState(false);
  const [lofiEnabled, setLofi] = useState(false);
  const toggleNowPlaying = useUiStore((s) => s.toggleNowPlaying);

  usePeymaConnect();
  useKeyboardShortcuts(useCallback(() => setShowQueue((v) => !v), []));

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    const isRadio = isRadioTrack(currentTrack);

    // Una estación de radio no es una pista del catálogo: no tiene fila en
    // `Track` que el proxy pueda resolver, así que suena directo de la URL
    // que dio Radio Browser. El resto (proxy propio, precarga) sólo aplica
    // a canciones reales.
    //
    // Nota CORS: si la estación no manda cabeceras CORS (muchas no lo
    // hacen, son emisoras de terceros), el elemento `<audio crossOrigin>`
    // sigue sonando igual — el navegador sólo lo marca "tainted" para Web
    // Audio, así que el visualizador de espectro puede verse plano para
    // esa estación en particular. Nunca se pierde el audio en sí.
    const streamUrl = isRadio
      ? currentTrack.audioUrl
      : `${process.env.NEXT_PUBLIC_API_URL ?? ""}/tracks/${currentTrack.id}/stream`;
    // Si la canción ya está en el búfer de RAM (porque se precargó siendo
    // la siguiente de la cola), se reproduce desde memoria y arranca sin
    // esperar a la red. El búfer sólo trae los primeros ~2 MB (ver
    // audioPrefetch.ts): cuando se agoten, el evento `waiting` del propio
    // `<audio>` avisa, y ahí se cambia a la URL de streaming completa
    // conservando la posición — si no, la canción se cortaría a mitad.
    const prefetchedUrl = isRadio ? null : getPrefetchedUrl(currentTrack.id);
    isPrefetchedSourceRef.current = prefetchedUrl !== null;
    audio.src = prefetchedUrl ?? streamUrl;
    initAudioEngine(audio);
    void resumeAudioContext();
    audio.play().catch(() => {
      // Autoplay bloqueado por el navegador hasta que haya un gesto del
      // usuario — no es un error real, el usuario ya hizo click en "play".
    });

    listenedRef.current = 0;
    lastTimeRef.current = 0;

    if (isRadio) {
      // Ni se registra como reproducción (`/streams/log` espera un trackId
      // real; el backend la rechazaría) ni se precarga la "siguiente
      // estación" — no hay nada del backend que precargar.
      return;
    }

    // Alimenta oyentes mensuales y el ranking de tendencias — mismo endpoint
    // que usa la app móvil. Si falla no se interrumpe la reproducción.
    //
    // Se registra al EMPEZAR para que "escuchando ahora" no llegue tarde, y
    // se completa con los segundos reales al terminar o al cambiar de pista
    // (ver la limpieza de abajo). Es una sola fila que se corrige, no dos
    // eventos: contar dos veces la misma escucha falsearía los rankings.
    const trackId = currentTrack.id;
    let logId: string | null = null;
    let cancelled = false;

    http
      .post<{ id: string }>("/streams/log", {
        trackId,
        // Sólo se manda si el usuario aceptó y el navegador dio la
        // posición. El servidor lo vuelve a comprobar de todas formas.
        ...(getStoredCoords() ?? {}),
      })
      .then((res) => {
        if (cancelled) {
          // La canción ya cambió antes de que respondiera el servidor:
          // se completa igual con lo que se llegó a oír.
          void http.patch(`/streams/${res.id}`, { secondsPlayed: Math.floor(listenedRef.current) }).catch(() => {});
        } else {
          logId = res.id;
        }
      })
      .catch(() => {});

    /**
     * Precarga la SIGUIENTE canción de la cola y purga lo demás.
     *
     * Se queda con la actual y la siguiente: lo ya escuchado no se va a
     * volver a necesitar y sólo ocuparía RAM. En un teléfono de gama media
     * eso es la diferencia entre una caché útil y que el navegador mate la
     * pestaña a mitad de sesión.
     */
    const { queue: q, queueIndex: qi } = usePlayerStore.getState();
    const nextTrack = q[qi + 1];
    const nextIsPrefetchable = nextTrack && !isRadioTrack(nextTrack);
    const keep = [currentTrack.id, ...(nextIsPrefetchable ? [nextTrack.id] : [])];
    purgeExcept(keep);
    if (nextIsPrefetchable) void prefetchTrack(nextTrack.id, keep);

    return () => {
      cancelled = true;
      const listened = Math.floor(listenedRef.current);
      // Menos de 3 segundos no es una escucha, es un salto mientras se busca
      // algo. Dejar el valor sin completar sería peor: quedaría como nulo y
      // las métricas lo estimarían como la canción entera.
      if (logId) {
        void http.patch(`/streams/${logId}`, { secondsPlayed: listened < 3 ? 0 : listened }).catch(() => {});
      }
    };
  }, [currentTrack]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) audio.play().catch(() => {});
    else audio.pause();
  }, [isPlaying]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.volume = volume;
  }, [volume]);

  useEffect(() => {
    setLofiEnabled(lofiEnabled);
  }, [lofiEnabled]);

  // Aplica los saltos pedidos por atajos de teclado o por un comando remoto.
  // Depende de `seekNonce` (no de `progress`) para no pelearse con timeupdate.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || seekNonce === 0) return;
    audio.currentTime = usePlayerStore.getState().progress;
  }, [seekNonce]);

  if (!currentTrack) return null;

  const handleSeek = (event: React.ChangeEvent<HTMLInputElement>) => {
    const seconds = Number(event.target.value);
    if (audioRef.current) audioRef.current.currentTime = seconds;
    setProgress(seconds);
  };

  return (
    <>
      {showQueue && <QueueDrawer queue={queue} queueIndex={queueIndex} onClose={() => setShowQueue(false)} />}
      <div className="fixed bottom-0 left-0 right-0 z-[1000] flex h-[90px] items-center gap-4 border-t border-white/10 bg-surface/95 px-4 backdrop-blur-xl sm:px-6">
      <audio
        ref={audioRef}
        crossOrigin="anonymous"
        // El navegador empieza a llenar el búfer en cuanto se le asigna la
        // fuente, sin esperar a `play()`. Por defecto ("metadata") sólo
        // baja la cabecera del archivo y el audio no empieza a descargarse
        // hasta la pulsación, que es parte del retraso al darle al play.
        preload="auto"
        onTimeUpdate={(e) => {
          const now = e.currentTarget.currentTime;
          const delta = now - lastTimeRef.current;
          // Sólo cuenta el avance natural. Un salto adelante en la barra no
          // es tiempo escuchado, y uno atrás daría un delta negativo; el
          // margen de 2 s cubre el intervalo normal entre eventos.
          if (delta > 0 && delta < 2) listenedRef.current += delta;
          lastTimeRef.current = now;
          setProgress(now);
        }}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onWaiting={(e) => {
          // El búfer precargado (~2 MB) se agotó: se sigue por la URL de
          // streaming completa desde donde iba, si no la canción se
          // quedaría muda a mitad de reproducción.
          if (!isPrefetchedSourceRef.current || !currentTrack) return;
          isPrefetchedSourceRef.current = false;
          const audio = e.currentTarget;
          const resumeAt = audio.currentTime;
          audio.src = `${process.env.NEXT_PUBLIC_API_URL ?? ""}/tracks/${currentTrack.id}/stream`;
          audio.currentTime = resumeAt;
          if (isPlaying) audio.play().catch(() => {});
        }}
        onEnded={next}
      />

      <div className="flex min-w-0 flex-1 items-center gap-3">
        <CoverImage src={currentTrack.coverUrl} alt={currentTrack.title} size={48} rounded="rounded-md" glow={false} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{currentTrack.title}</p>
          <p className="truncate text-xs text-muted">{currentTrack.artist.name}</p>
        </div>
      </div>

      <div className="flex flex-[2] flex-col items-center gap-1">
        <div className="flex items-center gap-4">
          <button onClick={previous} aria-label="Anterior" className="text-muted transition-colors hover:text-foreground">
            ⏮
          </button>
          <button
            onClick={togglePlay}
            aria-label={isPlaying ? "Pausar" : "Reproducir"}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-foreground text-background transition-transform duration-300 ease-in-out hover:scale-105"
          >
            {isPlaying ? "⏸" : "▶"}
          </button>
          <button onClick={next} aria-label="Siguiente" className="text-muted transition-colors hover:text-foreground">
            ⏭
          </button>
        </div>
        {isRadioTrack(currentTrack) ? (
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[#FF8F8F]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#FF5A5A]" aria-hidden />
            En vivo
          </div>
        ) : (
          <div className="flex w-full max-w-md items-center gap-2 font-mono text-[11px] text-muted">
            <span>{formatTime(progress)}</span>
            <input
              type="range"
              min={0}
              max={duration || 0}
              value={Math.min(progress, duration || 0)}
              onChange={handleSeek}
              className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-white/20 accent-brand"
            />
            <span>{formatTime(duration)}</span>
          </div>
        )}
      </div>

      <div className="hidden flex-1 items-center justify-end gap-3 sm:flex">
        {remoteDeviceName && (
          <span className="flex items-center gap-1.5 rounded-full bg-brand/15 px-3 py-1 text-xs font-semibold text-brand ring-1 ring-inset ring-brand/30">
            <span aria-hidden>📶</span> Sonando en {remoteDeviceName}
          </span>
        )}
        <SpectrumVisualizer isPlaying={isPlaying} />
        <button
          onClick={toggleNowPlaying}
          aria-label="Ver detalle de la canción"
          title="Detalle"
          className="hidden text-lg text-muted transition-colors hover:text-foreground xl:block"
        >
          ⓘ
        </button>
        <button
          onClick={() => setLofi((v) => !v)}
          aria-label="Modo Lo-Fi"
          aria-pressed={lofiEnabled}
          title="Modo Lo-Fi (filtro paso-bajo)"
          className={`rounded-full px-2.5 py-1 text-xs font-bold transition-all duration-300 ${
            lofiEnabled ? "bg-brand/20 text-brand ring-1 ring-inset ring-brand/40" : "text-muted hover:text-foreground"
          }`}
        >
          LO-FI
        </button>
        <button
          onClick={() => setShowQueue((v) => !v)}
          aria-label="Cola de reproducción"
          title="Cola (Q)"
          className={`text-lg transition-colors ${showQueue ? "text-brand" : "text-muted hover:text-foreground"}`}
        >
          ☰
        </button>
        <span className="text-muted">🔊</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className="h-1 w-24 cursor-pointer appearance-none rounded-full bg-white/20 accent-brand"
        />
        </div>
      </div>
    </>
  );
}
