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
import { isRadioTrack } from '../services/radioApi';
import type { RepeatMode, Track } from '../types';

/**
 * `AudioCommonMetadata`/`AudioMetadataReceivedEvent` existen en
 * react-native-track-player (ver `Event.MetadataCommonReceived` y
 * `Event.MetadataTimedReceived`) pero el paquete no los re-exporta desde su
 * índice público — sólo se usan internamente. Se declara acá el subconjunto
 * real que hace falta leer, en vez de importar una ruta interna no soportada.
 */
interface IcyCommonMetadata {
  title?: string;
  artist?: string;
}

/**
 * "Artista - Canción" a partir de la metadata ICY que manda la propia
 * emisora. La mayoría de estaciones mandan todo en `title` sin separar
 * artista (así es como llega `StreamTitle` de Icecast/Shoutcast) — si
 * `artist` viene aparte, se antepone; si no, se usa `title` tal cual.
 */
function formatIcyTitle(metadata: IcyCommonMetadata): string | null {
  const title = metadata.title?.trim();
  if (!title) return null;
  const artist = metadata.artist?.trim();
  return artist && !title.toLowerCase().includes(artist.toLowerCase()) ? `${artist} - ${title}` : title;
}

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
  const setRadioNowPlaying = usePlayerStore((s) => s.setRadioNowPlaying);

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

    /**
     * Suscribirse puede lanzar si el módulo nativo no quedó registrado.
     *
     * Pasa con `react-native-track-player` 4.1.2 bajo la Nueva Arquitectura,
     * que este proyecto tiene activada porque la exige Reanimated 4. Sin
     * este try, el throw ocurre dentro del efecto y sube hasta el
     * ErrorBoundary: la app entera se cambia por la pantalla de error, sólo
     * porque no hay reproductor.
     *
     * Con él, quien abra la app puede entrar, ver su biblioteca y cerrar
     * sesión; lo único que no va es el audio. Que es exactamente lo que no
     * va, y no tiene por qué llevarse por delante el resto.
     */
    let subscriptions: { remove: () => void }[] = [];
    try {
      subscriptions = [
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

      // "Sonando ahora" de una radio (metadata ICY) — sólo aplica a
      // estaciones, y sólo a algunas: no todas anuncian esto. Llega por acá
      // porque el reproductor nativo (ExoPlayer/AVPlayer) ya la decodifica
      // del propio stream de audio; nadie tiene que pedirla aparte.
      TrackPlayer.addEventListener(Event.MetadataCommonReceived, (event: { metadata: IcyCommonMetadata }) => {
        const track = usePlayerStore.getState().currentTrack;
        if (!track || !isRadioTrack(track)) return;
        setRadioNowPlaying(formatIcyTitle(event.metadata));
      }),
      TrackPlayer.addEventListener(Event.MetadataTimedReceived, (event: { metadata: IcyCommonMetadata[] }) => {
        const track = usePlayerStore.getState().currentTrack;
        if (!track || !isRadioTrack(track)) return;
        const withTitle = event.metadata.find((m) => m.title?.trim());
        if (withTitle) setRadioNowPlaying(formatIcyTitle(withTitle));
      }),
      ];
    } catch (error) {
      console.error('[useTrackPlayer] No se pudo suscribir a los eventos del reproductor:', error);
    }

    return () => {
      mounted = false;
      subscriptions.forEach((sub) => sub.remove());
    };
    // Esta suscripción sólo debe crearse una vez; `queueRef` evita capturar
    // `queue` obsoleto sin tener que re-suscribir eventos en cada cambio de cola.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // `try` además del `catch` de la promesa: sin módulo nativo el fallo es
    // síncrono, no una promesa rechazada, y se escaparía por encima.
    try {
      TrackPlayer.setRepeatMode(REPEAT_TO_NATIVE[repeatMode]).catch((error) => {
        console.error('[useTrackPlayer] Error al fijar el modo de repetición:', error);
      });
    } catch (error) {
      console.error('[useTrackPlayer] El reproductor no está disponible:', error);
    }
  }, [repeatMode]);

  return true;
}
