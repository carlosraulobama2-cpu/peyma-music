import { useEffect, useRef, useState } from 'react';
import { Play, Pause } from 'lucide-react';
import { getAuthToken } from '../lib/httpClient';

/**
 * Reproductor para escuchar una pista ANTES de aprobarla.
 *
 * El audio viene de `/admin/moderation/:id/preview`, que a diferencia del
 * stream público sí sirve pistas en estado PENDING_REVIEW.
 *
 * El token va en la query y no en una cabecera porque un `<audio src>` no
 * puede mandar cabeceras. La alternativa (bajar todo con fetch a un blob)
 * rompería el salto en la barra de progreso y obligaría a descargar el
 * archivo entero antes de oír el primer segundo.
 *
 * Sólo un reproductor suena a la vez: al darle al play, este componente
 * pausa cualquier otro. Con veinte pistas en la cola, que se solapen dos
 * audios es lo primero que pasa y hace la revisión inutilizable.
 */

const API_URL = import.meta.env.VITE_API_URL as string;

/**
 * Referencia al `<audio>` que está sonando ahora mismo, compartida por todas
 * las instancias. Un módulo y no un contexto de React: no hay nada que
 * renderizar a partir de esto, y un contexto obligaría a envolver la lista.
 */
let currentlyPlaying: HTMLAudioElement | null = null;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface AudioPreviewProps {
  trackId: string;
  /** Picos 0–1 del análisis. Si no hay, se dibuja una barra de progreso normal. */
  waveformPeaks?: number[];
  durationHint: number;
}

export function AudioPreview({ trackId, waveformPeaks, durationHint }: AudioPreviewProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationHint);
  const [error, setError] = useState(false);

  // Pausar al desmontar: si se aprueba una pista mientras suena, su fila
  // desaparece de la lista y el audio seguiría sonando sin dueño.
  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      if (audio && currentlyPlaying === audio) currentlyPlaying = null;
      audio?.pause();
    };
  }, []);

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      return;
    }

    if (currentlyPlaying && currentlyPlaying !== audio) currentlyPlaying.pause();
    currentlyPlaying = audio;

    try {
      await audio.play();
      setError(false);
    } catch {
      // Falla si el navegador bloquea la reproducción o el archivo no carga.
      setError(true);
    }
  };

  const seekTo = (fraction: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration)) return;
    audio.currentTime = audio.duration * Math.min(1, Math.max(0, fraction));
  };

  const progress = duration > 0 ? currentTime / duration : 0;
  const token = getAuthToken();

  return (
    <div className="flex items-center gap-3">
      <audio
        ref={audioRef}
        src={`${API_URL}/admin/moderation/${trackId}/preview?token=${encodeURIComponent(token ?? '')}`}
        preload="none"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(0);
        }}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          if (Number.isFinite(e.currentTarget.duration)) setDuration(e.currentTarget.duration);
        }}
        onError={() => setError(true)}
      />

      <button
        type="button"
        onClick={toggle}
        aria-label={isPlaying ? 'Pausar' : 'Escuchar antes de aprobar'}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-black transition-transform hover:scale-105"
      >
        {isPlaying ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" className="ml-0.5" />}
      </button>

      <div className="min-w-0 flex-1">
        {waveformPeaks && waveformPeaks.length > 0 ? (
          // Onda real del análisis: las barras ya reproducidas se pintan en
          // color de marca. Clicar salta a ese punto.
          <button
            type="button"
            aria-label="Saltar a un punto de la canción"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              seekTo((e.clientX - rect.left) / rect.width);
            }}
            className="flex h-9 w-full items-end gap-px"
          >
            {waveformPeaks.map((peak, i) => (
              <span
                key={i}
                className={`flex-1 rounded-sm transition-colors ${
                  i / waveformPeaks.length <= progress ? 'bg-brand' : 'bg-white/20'
                }`}
                style={{ height: `${Math.max(8, peak * 100)}%` }}
              />
            ))}
          </button>
        ) : (
          <button
            type="button"
            aria-label="Saltar a un punto de la canción"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              seekTo((e.clientX - rect.left) / rect.width);
            }}
            className="h-1.5 w-full overflow-hidden rounded-full bg-white/15"
          >
            <span className="block h-full rounded-full bg-brand" style={{ width: `${progress * 100}%` }} />
          </button>
        )}
      </div>

      <span className="shrink-0 font-mono text-xs tabular-nums text-muted">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>

      {error && <span className="shrink-0 text-xs font-semibold text-danger">No se pudo cargar el audio</span>}
    </div>
  );
}
