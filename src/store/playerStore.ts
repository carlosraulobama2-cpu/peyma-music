/**
 * Peyma Music — Player Store (Zustand)
 * Controla reproducción, cola, shuffle y repeat sobre react-native-track-player.
 *
 * Regla de oro: el estado de Zustand es un espejo de lo que ya se le pidió al
 * player nativo, nunca al revés. Cada acción llama primero a TrackPlayer y
 * sólo actualiza el store si la llamada nativa no lanzó — así ambos nunca
 * quedan desincronizados (el bug que tenía `reorderQueue`, que sólo tocaba
 * el store y dejaba sonando el orden viejo).
 */
import { create } from 'zustand';
import TrackPlayer, { RepeatMode as NativeRepeatMode } from 'react-native-track-player';
import type { AddTrack } from 'react-native-track-player';
import type { Track, RepeatMode, PlayerState } from '../types';
import { useLibraryStore } from './libraryStore';
import { shuffle } from '../utils';
import { startStream, updateStreamPosition, finishStream } from '../services/streamTracker';
import { isRadioTrack } from '../services/radioApi';

const REPEAT_TO_NATIVE: Record<RepeatMode, NativeRepeatMode> = {
  off: NativeRepeatMode.Off,
  track: NativeRepeatMode.Track,
  queue: NativeRepeatMode.Queue,
};

const REPEAT_CYCLE: RepeatMode[] = ['off', 'track', 'queue'];

/** Umbral (segundos) bajo el cual "anterior" reinicia la pista en vez de saltar. */
const RESTART_THRESHOLD_SECONDS = 3;

/**
 * Handle del temporizador de apagado, fuera del store: es un detalle de
 * implementación (no serializable, no le importa a ningún componente),
 * sólo el store necesita cancelarlo cuando se reprograma o se apaga.
 */
let sleepTimerHandle: ReturnType<typeof setTimeout> | null = null;

/**
 * Se reproduce por el proxy del backend (`/tracks/:id/stream`), no por la
 * URL cruda: es el mismo origen que usa la web, respeta el filtro de
 * moderación (una pista no aprobada deja de sonar) y soporta `Range` para
 * buscar sin descargar el archivo entero. Si no hay API configurada, se cae
 * a la URL original para no dejar la app sin audio.
 *
 * `previewToken`: el reproductor nativo no manda la cabecera
 * `Authorization`, así que para escuchar una pista TODAVÍA no aprobada (la
 * vista previa del propio artista sobre su subida, ver `mis-canciones.tsx`)
 * el token va en la URL — el backend acepta esto sólo en esta ruta, a
 * propósito (ver `optionalAuthFromHeaderOrQuery`). Para una pista pública
 * normal no hace falta y no se manda.
 */
function resolveStreamUrl(track: Track, previewToken?: string): string {
  // Una estación de radio no es una pista del catálogo: no tiene fila en
  // `Track` que moderar ni proxy que atravesar, así que suena directo desde
  // la URL que dio Radio Browser.
  if (isRadioTrack(track)) return track.audioUrl;

  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  if (!apiUrl) return track.audioUrl;
  const url = `${apiUrl}/tracks/${track.id}/stream`;
  return previewToken ? `${url}?token=${encodeURIComponent(previewToken)}` : url;
}

export function toTrackPlayerTrack(track: Track, previewToken?: string): AddTrack {
  return {
    id: track.id,
    url: resolveStreamUrl(track, previewToken),
    title: track.title,
    artist: track.artist,
    album: track.album,
    artwork: track.coverUrl,
    duration: track.duration,
    ...(isRadioTrack(track) ? { isLiveStream: true } : {}),
  };
}

interface PlayerStore extends PlayerState {
  isCrossfadeEnabled: boolean;
  crossfadeDurationMs: number;
  /** `null` si no hay temporizador de apagado activo. */
  sleepTimerEndsAt: number | null;

  /**
   * `true` mientras se está aplicando un comando que llegó por Peyma
   * Connect (ver `usePeymaConnect`). El efecto que emite estado a los
   * otros dispositivos lo consulta para NO reenviar a la red algo que
   * acaba de llegar de la red — la mitad cliente de la supresión de eco.
   */
  isRemoteCommand: boolean;
  /** Qué otro dispositivo está reproduciendo, si alguno — alimenta "Sonando en …". */
  remoteDeviceName: string | null;

  /**
   * `previewToken`: sólo lo pasa la pantalla "Mis canciones" al escuchar una
   * subida propia todavía no aprobada — ver `resolveStreamUrl`.
   */
  play: (track: Track, queue?: Track[], previewToken?: string) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  seekTo: (positionSeconds: number) => Promise<void>;
  setVolume: (volume: number) => Promise<void>;
  /** Limpia (o fija a mano) el mensaje de error visible; `useTrackPlayer` lo llena solo desde eventos nativos. */
  setPlaybackError: (message: string | null) => void;
  toggleShuffle: () => Promise<void>;
  toggleRepeat: () => Promise<void>;
  addToQueue: (track: Track) => Promise<void>;
  removeFromQueue: (index: number) => Promise<void>;
  reorderQueue: (fromIndex: number, toIndex: number) => Promise<void>;
  clearQueue: () => Promise<void>;

  // Sincronizados desde eventos nativos por useTrackPlayer(); no llamar a mano.
  setProgress: (progress: number) => void;
  setDuration: (duration: number) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setIsBuffering: (isBuffering: boolean) => void;
  setCurrentTrack: (track: Track | null, index?: number) => void;
  toggleCrossfade: () => void;
  setCrossfadeDuration: (durationMs: number) => void;

  /** `minutes: null` cancela el temporizador activo. */
  setSleepTimer: (minutes: number | null) => void;

  /**
   * Ejecuta `mutation` con la bandera de "viene de Peyma Connect" activada.
   * Acepta mutaciones async (a diferencia de la web, acá `pause`/`resume`/
   * `seekTo`/etc. son promesas que llaman al player nativo antes de tocar
   * el store) y no la baja hasta que terminen — si no, el `set()` interno
   * de la acción llegaría con la bandera ya en `false` y se reenviaría al
   * resto de dispositivos el comando que acaban de mandar ellos.
   */
  applyRemote: (mutation: () => void | Promise<void>) => void;
  setRemoteDeviceName: (name: string | null) => void;
}

export const usePlayerStore = create<PlayerStore>((set, get) => ({
  currentTrack: null,
  queue: [],
  queueIndex: -1,
  isPlaying: false,
  isBuffering: false,
  isShuffled: false,
  repeatMode: 'off',
  progress: 0,
  duration: 0,
  volume: 1,
  isCrossfadeEnabled: false,
  crossfadeDurationMs: 5000,
  sleepTimerEndsAt: null,
  playbackError: null,
  isRemoteCommand: false,
  remoteDeviceName: null,

  play: async (track, queueOverride, previewToken) => {
    const newQueue = queueOverride ?? [track];
    const index = Math.max(
      0,
      newQueue.findIndex((t) => t.id === track.id),
    );

    set({ isBuffering: true, playbackError: null });
    try {
      await TrackPlayer.reset();
      await TrackPlayer.add(newQueue.map((t) => toTrackPlayerTrack(t, previewToken)));
      await TrackPlayer.skip(index);
      await TrackPlayer.play();

      // Una radio no es una pista del catálogo: no tiene id real en `Track`,
      // así que ni entra al historial ("recientes" es para lo que sí se
      // puede volver a abrir en su ficha) ni se registra como reproducción
      // — el backend la rechazaría (`/streams/log` espera un trackId real).
      // Sí hay que cerrar la escucha anterior si venía de una canción real:
      // `startStream` lo hace solo, pero acá no se llama.
      if (isRadioTrack(track)) {
        await finishStream();
      } else if (!previewToken) {
        useLibraryStore.getState().addToRecentlyPlayed(track);
        // Alimenta oyentes mensuales, tendencias y las horas escuchadas del
        // panel. Hasta ahora la app no registraba nada y todo el uso móvil
        // era invisible en las métricas.
        startStream(track.id);
      }

      set({
        currentTrack: track,
        queue: newQueue,
        queueIndex: index,
        isPlaying: true,
        isBuffering: false,
        progress: 0,
      });
    } catch (error) {
      console.error('[playerStore] Error al reproducir:', error);
      set({ isBuffering: false, playbackError: 'No pudimos reproducir esta canción. Revisa tu conexión.' });
    }
  },

  pause: async () => {
    try {
      await TrackPlayer.pause();
      set({ isPlaying: false });
    } catch (error) {
      console.error('[playerStore] Error al pausar:', error);
    }
  },

  resume: async () => {
    try {
      await TrackPlayer.play();
      set({ isPlaying: true });
    } catch (error) {
      console.error('[playerStore] Error al reanudar:', error);
    }
  },

  next: async () => {
    if (get().queue.length === 0) return;
    try {
      await TrackPlayer.skipToNext();
      set({ progress: 0, isPlaying: true });
    } catch (error) {
      // Lanza al llegar al final de la cola sin repeat — no es un error real.
      console.warn('[playerStore] No hay siguiente pista:', error);
    }
  },

  previous: async () => {
    try {
      if (get().progress > RESTART_THRESHOLD_SECONDS) {
        await TrackPlayer.seekTo(0);
        set({ progress: 0 });
        return;
      }
      await TrackPlayer.skipToPrevious();
      set({ progress: 0, isPlaying: true });
    } catch (error) {
      console.warn('[playerStore] No hay pista anterior:', error);
    }
  },

  seekTo: async (positionSeconds) => {
    try {
      await TrackPlayer.seekTo(positionSeconds);
      set({ progress: positionSeconds });
    } catch (error) {
      console.error('[playerStore] Error al buscar posición:', error);
    }
  },

  setVolume: async (volume) => {
    const clamped = Math.max(0, Math.min(1, volume));
    try {
      await TrackPlayer.setVolume(clamped);
      set({ volume: clamped });
    } catch (error) {
      console.error('[playerStore] Error al ajustar volumen:', error);
    }
  },

  toggleShuffle: async () => {
    const { queue, queueIndex, currentTrack, isShuffled } = get();
    if (!currentTrack || queue.length <= 1) {
      set({ isShuffled: !isShuffled });
      return;
    }

    try {
      const played = queue.slice(0, queueIndex + 1);
      const upcoming = queue.slice(queueIndex + 1);
      const nextUpcoming = isShuffled ? upcoming : shuffle(upcoming);
      const newQueue = [...played, ...nextUpcoming];

      await TrackPlayer.setQueue(newQueue.map((t) => toTrackPlayerTrack(t)));
      await TrackPlayer.skip(queueIndex);

      set({ isShuffled: !isShuffled, queue: newQueue });
    } catch (error) {
      console.error('[playerStore] Error al mezclar la cola:', error);
    }
  },

  toggleRepeat: async () => {
    const currentIndex = REPEAT_CYCLE.indexOf(get().repeatMode);
    const nextMode = REPEAT_CYCLE[(currentIndex + 1) % REPEAT_CYCLE.length] as RepeatMode;
    try {
      await TrackPlayer.setRepeatMode(REPEAT_TO_NATIVE[nextMode]);
      set({ repeatMode: nextMode });
    } catch (error) {
      console.error('[playerStore] Error al cambiar el modo de repetición:', error);
    }
  },

  addToQueue: async (track) => {
    try {
      await TrackPlayer.add(toTrackPlayerTrack(track));
      set((state) => ({ queue: [...state.queue, track] }));
    } catch (error) {
      console.error('[playerStore] Error al añadir a la cola:', error);
    }
  },

  removeFromQueue: async (index) => {
    const { queue, queueIndex } = get();
    if (index < 0 || index >= queue.length || index === queueIndex) return;

    try {
      await TrackPlayer.remove(index);
      const newQueue = queue.filter((_, i) => i !== index);
      const newIndex = queueIndex > index ? queueIndex - 1 : queueIndex;
      set({ queue: newQueue, queueIndex: newIndex });
    } catch (error) {
      console.error('[playerStore] Error al quitar de la cola:', error);
    }
  },

  reorderQueue: async (fromIndex, toIndex) => {
    const { queue, queueIndex } = get();
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= queue.length ||
      toIndex >= queue.length
    ) {
      return;
    }

    try {
      await TrackPlayer.move(fromIndex, toIndex);

      const newQueue = [...queue];
      const [moved] = newQueue.splice(fromIndex, 1);
      newQueue.splice(toIndex, 0, moved as Track);

      let newQueueIndex = queueIndex;
      if (queueIndex === fromIndex) {
        newQueueIndex = toIndex;
      } else if (fromIndex < queueIndex && toIndex >= queueIndex) {
        newQueueIndex--;
      } else if (fromIndex > queueIndex && toIndex <= queueIndex) {
        newQueueIndex++;
      }

      set({ queue: newQueue, queueIndex: newQueueIndex });
    } catch (error) {
      console.error('[playerStore] Error al reordenar la cola:', error);
    }
  },

  clearQueue: async () => {
    // Cerrar el evento en curso ANTES de resetear: al vaciar la cola la
    // pista deja de sonar, y si no se reporta aquí esos segundos se pierden.
    await finishStream();
    try {
      await TrackPlayer.reset();
    } catch (error) {
      console.error('[playerStore] Error al vaciar la cola:', error);
    }
    set({ queue: [], queueIndex: -1, currentTrack: null, isPlaying: false, progress: 0 });
  },

  setPlaybackError: (message) => set({ playbackError: message }),

  setProgress: (progress) => {
    // Acumula el tiempo realmente oído además de mover la barra. Va aquí
    // porque `setProgress` es el único punto por el que pasan todos los
    // eventos de posición del reproductor nativo.
    updateStreamPosition(progress);
    set({ progress });
  },
  setDuration: (duration) => set({ duration }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setIsBuffering: (isBuffering) => set({ isBuffering }),
  setCurrentTrack: (track, index) =>
    set((state) => ({ currentTrack: track, queueIndex: index ?? state.queueIndex })),
  toggleCrossfade: () => set((state) => ({ isCrossfadeEnabled: !state.isCrossfadeEnabled })),
  setCrossfadeDuration: (durationMs) => set({ crossfadeDurationMs: durationMs }),

  setSleepTimer: (minutes) => {
    if (sleepTimerHandle) {
      clearTimeout(sleepTimerHandle);
      sleepTimerHandle = null;
    }

    if (minutes === null) {
      set({ sleepTimerEndsAt: null });
      return;
    }

    sleepTimerHandle = setTimeout(
      () => {
        sleepTimerHandle = null;
        get().pause();
        set({ sleepTimerEndsAt: null });
      },
      minutes * 60_000,
    );
    set({ sleepTimerEndsAt: Date.now() + minutes * 60_000 });
  },

  applyRemote: (mutation) => {
    set({ isRemoteCommand: true });
    const result = mutation();
    if (result instanceof Promise) {
      result.finally(() => set({ isRemoteCommand: false }));
    } else {
      set({ isRemoteCommand: false });
    }
  },

  setRemoteDeviceName: (name) => set({ remoteDeviceName: name }),
}));
