/**
 * Peyma Music — Sheet Store (Zustand)
 *
 * Estado del menú de opciones de una canción ("···") y del selector de
 * playlists, ambos montados una sola vez en la raíz (`SheetHost`) y
 * controlados desde cualquier pantalla sin prop-drilling — mismo patrón
 * que `toastStore`.
 */
import { create } from 'zustand';
import type { Track } from '../types';

interface TrackOptionsContext {
  /** Si la canción se abrió desde una playlist propia, permite "Quitar de esta playlist". */
  removeFromPlaylistId?: string;
}

interface SheetStore {
  activeTrack: Track | null;
  context: TrackOptionsContext;
  isAddToPlaylistOpen: boolean;

  openTrackOptions: (track: Track, context?: TrackOptionsContext) => void;
  closeTrackOptions: () => void;
  openAddToPlaylist: () => void;
  closeAddToPlaylist: () => void;
}

export const useSheetStore = create<SheetStore>((set) => ({
  activeTrack: null,
  context: {},
  isAddToPlaylistOpen: false,

  openTrackOptions: (track, context = {}) => set({ activeTrack: track, context, isAddToPlaylistOpen: false }),
  closeTrackOptions: () => set({ activeTrack: null, context: {}, isAddToPlaylistOpen: false }),
  openAddToPlaylist: () => set({ isAddToPlaylistOpen: true }),
  closeAddToPlaylist: () => set({ isAddToPlaylistOpen: false }),
}));
