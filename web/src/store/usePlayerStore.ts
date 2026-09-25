"use client";

import { create } from "zustand";
import type { CatalogTrack } from "../lib/catalog";

/**
 * Reproductor real de la web (HTML5 `<audio>`, un único elemento compartido
 * — ver PlayerDeck.tsx, que es quien realmente posee el `<audio>` y llama a
 * estas acciones). La sincronización en tiempo real con otros dispositivos
 * (Peyma Connect, ver usePeymaConnect.ts) es una capa aparte que consume
 * este store desde afuera (`applyRemote`, `remoteDeviceName`); este store
 * sigue siendo la fuente de verdad local.
 */
interface PlayerStore {
  currentTrack: CatalogTrack | null;
  queue: CatalogTrack[];
  queueIndex: number;
  isPlaying: boolean;
  progress: number;
  duration: number;
  volume: number;

  /**
   * `true` mientras se está aplicando un cambio que vino por WebSocket.
   * El emisor de eventos lo consulta para NO reenviar a la red algo que
   * acaba de llegar de la red — es la mitad cliente de la supresión de eco
   * (la otra mitad la hace el backend con `socket.to()` en vez de `io.to()`).
   */
  isRemoteCommand: boolean;
  /** Qué dispositivo está reproduciendo, si no es este — alimenta "Sonando en …". */
  remoteDeviceName: string | null;

  play: (track: CatalogTrack, queue?: CatalogTrack[]) => void;
  /** Inserta la pista justo después de la actual, sin cortar lo que suena. */
  addToQueue: (track: CatalogTrack) => void;
  /** Mueve una pista dentro de la cola, por índice absoluto. */
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  /** Quita una pista de la cola por índice absoluto. */
  removeFromQueue: (index: number) => void;
  togglePlay: () => void;
  next: () => void;
  previous: () => void;
  setProgress: (seconds: number) => void;
  setDuration: (seconds: number) => void;
  setVolume: (level: number) => void;
  /**
   * Pide mover la reproducción a `seconds`. Incrementa `seekNonce` para que
   * el `<audio>` del PlayerDeck aplique el salto una sola vez, sin que el
   * evento `timeupdate` (que también escribe `progress`) lo deshaga.
   */
  seekTo: (seconds: number) => void;
  seekNonce: number;
  /** Ejecuta `mutation` con la bandera de "viene de la red" activada. */
  applyRemote: (mutation: () => void) => void;
  setRemoteDeviceName: (name: string | null) => void;
}

export const usePlayerStore = create<PlayerStore>((set, get) => ({
  currentTrack: null,
  queue: [],
  queueIndex: -1,
  isPlaying: false,
  progress: 0,
  duration: 0,
  volume: 0.8,
  isRemoteCommand: false,
  remoteDeviceName: null,
  seekNonce: 0,

  play: (track, queue) => {
    const effectiveQueue = queue ?? [track];
    const index = effectiveQueue.findIndex((t) => t.id === track.id);
    set({
      currentTrack: track,
      queue: effectiveQueue,
      queueIndex: index === -1 ? 0 : index,
      isPlaying: true,
      progress: 0,
    });
  },

  addToQueue: (track) => {
    const { queue, queueIndex, currentTrack } = get();
    // Sin nada sonando, "añadir a la cola" es simplemente empezar a sonar.
    if (!currentTrack) {
      get().play(track);
      return;
    }
    if (queue.some((t) => t.id === track.id)) return;
    const next = [...queue];
    next.splice(queueIndex + 1, 0, track);
    set({ queue: next });
  },

  reorderQueue: (fromIndex, toIndex) => {
    const { queue, queueIndex } = get();
    if (fromIndex === toIndex) return;
    if (fromIndex < 0 || fromIndex >= queue.length || toIndex < 0 || toIndex >= queue.length) return;

    const next = [...queue];
    const [moved] = next.splice(fromIndex, 1);
    if (!moved) return;
    next.splice(toIndex, 0, moved);

    // El índice de lo que suena TIENE que seguir a su pista: si no se
    // recalcula, mover algo por encima de la actual haría que "siguiente"
    // saltara a una canción distinta de la que se ve resaltada.
    const currentId = queue[queueIndex]?.id;
    const nextIndex = currentId ? next.findIndex((t) => t.id === currentId) : queueIndex;

    set({ queue: next, queueIndex: nextIndex === -1 ? queueIndex : nextIndex });
  },

  removeFromQueue: (index) => {
    const { queue, queueIndex } = get();
    // La pista que suena no se quita desde la cola: pararía la reproducción
    // sin que el usuario lo haya pedido.
    if (index === queueIndex || index < 0 || index >= queue.length) return;

    const next = queue.filter((_, i) => i !== index);
    set({ queue: next, queueIndex: index < queueIndex ? queueIndex - 1 : queueIndex });
  },

  togglePlay: () => {
    if (!get().currentTrack) return;
    set((state) => ({ isPlaying: !state.isPlaying }));
  },

  next: () => {
    const { queue, queueIndex } = get();
    if (queue.length === 0 || queueIndex >= queue.length - 1) return;
    const nextIndex = queueIndex + 1;
    set({ currentTrack: queue[nextIndex], queueIndex: nextIndex, isPlaying: true, progress: 0 });
  },

  previous: () => {
    const { queue, queueIndex } = get();
    if (queue.length === 0 || queueIndex <= 0) return;
    const prevIndex = queueIndex - 1;
    set({ currentTrack: queue[prevIndex], queueIndex: prevIndex, isPlaying: true, progress: 0 });
  },

  setProgress: (seconds) => set({ progress: seconds }),

  seekTo: (seconds) =>
    set((state) => ({ progress: Math.max(0, Math.min(seconds, state.duration || seconds)), seekNonce: state.seekNonce + 1 })),

  setDuration: (seconds) => set({ duration: seconds }),
  setVolume: (level) => set({ volume: Math.min(1, Math.max(0, level)) }),

  applyRemote: (mutation) => {
    set({ isRemoteCommand: true });
    try {
      mutation();
    } finally {
      set({ isRemoteCommand: false });
    }
  },

  setRemoteDeviceName: (name) => set({ remoteDeviceName: name }),
}));
