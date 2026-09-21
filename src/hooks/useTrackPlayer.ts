/**
 * Peyma Music — Sincronización TrackPlayer → Zustand
 * Escucha los eventos nativos del reproductor y refleja su estado en el store.
 */
import { useEffect, useRef } from 'react';
import TrackPlayer, { Event, State, RepeatMode as NativeRepeatMode } from 'react-native-track-player';
import type { PlaybackProgressUpdatedEvent, PlaybackActiveTrackChangedEvent } from 'react-native-track-player';
import { usePlayerStore } from '../store/playerStore';
import { useLibraryStore } from '../store/libraryStore';
import { toast } from '../store/toastStore';
import type { RepeatMode, Track } from '../types';

/** No hace falta persistir la posición en cada tick de progreso (~1/s) — cada tantos segundos alcanza. */
const RESUME_POINT_SAVE_INTERVAL_MS = 10_000;

const REPEAT_TO_NATIVE: Record<RepeatMode, NativeRepeatMode> = {
  off: NativeRepeatMode.Off,
  track: NativeRepeatMode.Track,
  queue: NativeRepeatMode.Queue,
};

function findTrackById(queue: Track[], trackId: string): Track | undefined {
  return queue.find((t) => t.id === trackId);
}

/** Debe montarse una sola vez, cerca de la raíz de la app. */
export function useTrackPlayer(): true {
  const queue = usePlayerStore((s) => s.queue);
  const repeatMode = usePlayerStore((s) => s.repeatMode);
  const setStoreProgress = usePlayerStore((s) => s.setProgress);
  const setStoreDuration = usePlayerStore((s) => s.setDuration);
  const setStoreIsPlaying = usePlayerStore((s) => s.setIsPlaying);
  const setStoreCurrentTrack = usePlayerStore((s) => s.setCurrentTrack);
  const setStoreIsBuffering = usePlayerStore((s) => s.setIsBuffering);
  const setPlaybackError = usePlayerStore((s) => s.setPlaybackError);

  const queueRef = useRef(queue);
  useEffect(() => {
    queueRef.current = queue;
  });
  const lastResumeSaveAtRef = useRef(0);

  useEffect(() => {
    let mounted = true;

    async function syncInitialState() {
      try {
        const [playbackState, activeIndex, activeTrack, progress] = await Promise.all([
          TrackPlayer.getPlaybackState(),
          TrackPlayer.getActiveTrackIndex(),
          TrackPlayer.getActiveTrack(),
          TrackPlayer.getProgress(),
        ]);
        if (!mounted) return;

        if (activeTrack?.id && typeof activeIndex === 'number') {
          const peymaTrack = findTrackById(queueRef.current, activeTrack.id);
          if (peymaTrack) setStoreCurrentTrack(peymaTrack, activeIndex);
        }

        setStoreIsPlaying(playbackState?.state === State.Playing);
        setStoreProgress(progress.position);
        setStoreDuration(progress.duration);
      } catch (error) {
        console.error('[useTrackPlayer] Error al sincronizar estado inicial:', error);
      }
    }

    syncInitialState();

    const subscriptions = [
      TrackPlayer.addEventListener(
        Event.PlaybackProgressUpdated,
        (event: PlaybackProgressUpdatedEvent) => {
          setStoreProgress(event.position);
          setStoreDuration(event.duration);

          // "Continuar escuchando": throttleado, no en cada tick de progreso.
          const now = Date.now();
          if (now - lastResumeSaveAtRef.current >= RESUME_POINT_SAVE_INTERVAL_MS) {
            lastResumeSaveAtRef.current = now;
            const activeTrack = usePlayerStore.getState().currentTrack;
            if (activeTrack) {
              useLibraryStore.getState().saveResumePoint(activeTrack, event.position, event.duration);
            }
          }
        },
      ),

      TrackPlayer.addEventListener(Event.PlaybackState, (state) => {
        setStoreIsPlaying(state.state === State.Playing);
        // Buffering/Loading cubre tanto la carga inicial como un tropiezo de
        // red a mitad de canción — en ambos casos la UI debe mostrar "cargando".
        setStoreIsBuffering(state.state === State.Buffering || state.state === State.Loading);
        if (state.state === State.Ended) setStoreProgress(0);
        // Volvió a reproducir tras un tropiezo de red: el error ya no aplica.
        if (state.state === State.Playing || state.state === State.Ready) setPlaybackError(null);
      }),

      TrackPlayer.addEventListener(
        Event.PlaybackActiveTrackChanged,
        (event: PlaybackActiveTrackChangedEvent) => {
          if (typeof event.index !== 'number' || !event.track) return;
          const peymaTrack = findTrackById(queueRef.current, event.track.id ?? '');
          if (peymaTrack) setStoreCurrentTrack(peymaTrack, event.index);
        },
      ),

      TrackPlayer.addEventListener(Event.PlaybackQueueEnded, () => {
        setStoreIsPlaying(false);
        setStoreProgress(0);
        const finishedTrack = usePlayerStore.getState().currentTrack;
        if (finishedTrack) useLibraryStore.getState().clearResumePoint(finishedTrack.id);
      }),

      TrackPlayer.addEventListener(Event.PlaybackError, (error) => {
        console.error('[useTrackPlayer] Error de reproducción:', error);
        setStoreIsBuffering(false);
        const message = 'No pudimos seguir reproduciendo. Revisa tu conexión e intenta de nuevo.';
        setPlaybackError(message);
        toast.error(message);
      }),
    ];

    return () => {
      mounted = false;
      subscriptions.forEach((sub) => sub.remove());
    };
    // Esta suscripción sólo debe crearse una vez; `queueRef` evita capturar
    // `queue` obsoleto sin tener que re-suscribir eventos en cada cambio de cola.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    TrackPlayer.setRepeatMode(REPEAT_TO_NATIVE[repeatMode]).catch((error) => {
      console.error('[useTrackPlayer] Error al fijar el modo de repetición:', error);
    });
  }, [repeatMode]);

  return true;
}
