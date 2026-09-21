"use client";

import { create } from "zustand";

/**
 * Estado de UI compartido entre componentes que no comparten árbol: el
 * botón vive en el PlayerDeck (layout raíz) y el panel se renderiza en el
 * AppShell (grupo de rutas), así que no hay props que puedan conectarlos.
 */
interface UiStore {
  isNowPlayingOpen: boolean;
  toggleNowPlaying: () => void;
  closeNowPlaying: () => void;
}

export const useUiStore = create<UiStore>((set) => ({
  isNowPlayingOpen: false,
  toggleNowPlaying: () => set((s) => ({ isNowPlayingOpen: !s.isNowPlayingOpen })),
  closeNowPlaying: () => set({ isNowPlayingOpen: false }),
}));
