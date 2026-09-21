/**
 * Peyma Music — Motor de audio (fachada)
 *
 * `playerStore` ya envuelve react-native-track-player (reproducción en
 * segundo plano, controles de lockscreen/notificación, cola, shuffle,
 * repeat, temporizador de apagado) y `useTrackPlayer()` ya sincroniza sus
 * eventos nativos hacia el store. Este hook no reimplementa nada de eso:
 * es la única puerta de entrada que deberían usar los componentes de UI,
 * para no acoplarlos directamente a la forma interna del store ni a la
 * librería de audio.
 */
import { useCallback, useEffect, useState } from 'react';
import { usePlayerStore } from '../store/playerStore';
import type { PlayerState, SleepTimer, SleepTimerDuration, Track } from '../types';

/** Cada cuánto se refresca `sleepTimer.minutesRemaining` mientras hay un temporizador activo. */
const SLEEP_TIMER_TICK_MS = 15_000;

export interface UseAudioPlayerResult extends PlayerState {
  /** Progreso 0–1, ya clampeado — listo para un slider. */
  progressRatio: number;
  sleepTimer: SleepTimer;

  play: (track: Track, queue?: Track[]) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  togglePlayPause: () => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  /** Segundos absolutos, o `ratio` (0–1) si se pasa `{ ratio: true }`. */
  seekTo: (value: number, options?: { ratio?: boolean }) => Promise<void>;
  setVolume: (volume: number) => Promise<void>;

  startSleepTimer: (minutes: SleepTimerDuration) => void;
  cancelSleepTimer: () => void;

  /** Limpia el mensaje de error visible (p. ej. al cerrar un banner). */
  dismissPlaybackError: () => void;
}

export function useAudioPlayer(): UseAudioPlayerResult {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const queue = usePlayerStore((s) => s.queue);
  const queueIndex = usePlayerStore((s) => s.queueIndex);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isBuffering = usePlayerStore((s) => s.isBuffering);
  const isShuffled = usePlayerStore((s) => s.isShuffled);
  const repeatMode = usePlayerStore((s) => s.repeatMode);
  const progress = usePlayerStore((s) => s.progress);
  const duration = usePlayerStore((s) => s.duration);
  const volume = usePlayerStore((s) => s.volume);
  const playbackError = usePlayerStore((s) => s.playbackError);
  const sleepTimerEndsAt = usePlayerStore((s) => s.sleepTimerEndsAt);

  const storePlay = usePlayerStore((s) => s.play);
  const storePause = usePlayerStore((s) => s.pause);
  const storeResume = usePlayerStore((s) => s.resume);
  const storeNext = usePlayerStore((s) => s.next);
  const storePrevious = usePlayerStore((s) => s.previous);
  const storeSeekTo = usePlayerStore((s) => s.seekTo);
  const storeSetVolume = usePlayerStore((s) => s.setVolume);
  const storeSetSleepTimer = usePlayerStore((s) => s.setSleepTimer);
  const storeSetPlaybackError = usePlayerStore((s) => s.setPlaybackError);

  const togglePlayPause = useCallback(async () => {
    if (isPlaying) await storePause();
    else await storeResume();
  }, [isPlaying, storePause, storeResume]);

  const seekTo = useCallback(
    async (value: number, options?: { ratio?: boolean }) => {
      const seconds = options?.ratio ? value * duration : value;
      await storeSeekTo(seconds);
    },
    [duration, storeSeekTo],
  );

  const startSleepTimer = useCallback((minutes: SleepTimerDuration) => storeSetSleepTimer(minutes), [storeSetSleepTimer]);
  const cancelSleepTimer = useCallback(() => storeSetSleepTimer(null), [storeSetSleepTimer]);
  const dismissPlaybackError = useCallback(() => storeSetPlaybackError(null), [storeSetPlaybackError]);

  // `Date.now()` es impuro — no puede llamarse durante el render (regla de
  // pureza de React). Por eso `minutesRemaining` vive en un estado propio,
  // recalculado desde un efecto/intervalo en vez de un `useMemo` en render.
  const [minutesRemaining, setMinutesRemaining] = useState<number | null>(null);
  useEffect(() => {
    if (!sleepTimerEndsAt) {
      // A diferencia del caso en la pantalla del reproductor, este hook es
      // un contrato público: cualquier consumidor podría leer
      // `minutesRemaining` sin comprobar antes `isActive`, así que sí hace
      // falta resetearlo explícitamente al apagar el temporizador.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMinutesRemaining(null);
      return;
    }
    const tick = () => setMinutesRemaining(Math.max(0, Math.ceil((sleepTimerEndsAt - Date.now()) / 60_000)));
    tick();
    const interval = setInterval(tick, SLEEP_TIMER_TICK_MS);
    return () => clearInterval(interval);
  }, [sleepTimerEndsAt]);

  const sleepTimer: SleepTimer = {
    isActive: sleepTimerEndsAt !== null,
    endsAt: sleepTimerEndsAt,
    minutesRemaining,
  };

  return {
    currentTrack,
    queue,
    queueIndex,
    isPlaying,
    isBuffering,
    isShuffled,
    repeatMode,
    progress,
    duration,
    volume,
    playbackError,
    progressRatio: duration > 0 ? Math.min(1, Math.max(0, progress / duration)) : 0,
    sleepTimer,

    play: storePlay,
    pause: storePause,
    resume: storeResume,
    togglePlayPause,
    next: storeNext,
    previous: storePrevious,
    seekTo,
    setVolume: storeSetVolume,

    startSleepTimer,
    cancelSleepTimer,
    dismissPlaybackError,
  };
}
