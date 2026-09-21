/**
 * Peyma Music — Library Store (Zustand)
 * Favoritos, playlists propias, descargas y reproducciones recientes.
 *
 * Este store es un ESPEJO del servidor, no la fuente de verdad. Antes lo era,
 * y por eso los "me gusta", los artistas seguidos y las playlists creadas en
 * el teléfono no existían para nadie más: no se veían en la web, no llegaban
 * al panel y desaparecían al reinstalar la app.
 *
 * Cada mutación se aplica primero en local y luego se manda al servidor. Se
 * hace en ese orden para que la interfaz responda al instante — esperar la
 * red para pintar un corazón se nota mucho —, y si la llamada falla se
 * revierte al estado anterior y se avisa. Lo que no se hace nunca es dejar
 * la pantalla diciendo una cosa y el servidor otra.
 *
 * Las descargas y los puntos de reanudación sí son legítimamente locales:
 * dependen de este dispositivo concreto.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Track, Playlist } from '../types';
import { api } from '../services/api';
import { useUserBehaviorStore } from './userBehaviorStore';
import { toast } from './toastStore';

const MAX_RECENTLY_PLAYED = 30;
/** Por debajo de esto no vale la pena ofrecer "continuar" (casi no arrancó). */
const MIN_RESUMABLE_RATIO = 0.03;
/** Por encima de esto se considera terminada, no "a medias". */
const MAX_RESUMABLE_RATIO = 0.92;

export interface ResumePoint {
  track: Track;
  positionSeconds: number;
  durationSeconds: number;
  updatedAt: string;
}

interface LibraryStore {
  favorites: Track[];
  playlists: Playlist[];
  downloadedTracks: string[];
  recentlyPlayed: Track[];
  followedArtistIds: string[];
  /** "Continuar escuchando" — posición exacta de la última canción que quedó a la mitad. */
  resumePoints: Record<string, ResumePoint>;

  toggleFavorite: (track: Track) => void;
  isFavorite: (trackId: string) => boolean;

  toggleFollowArtist: (artistId: string) => void;
  isFollowingArtist: (artistId: string) => boolean;

  /** Asíncrona: el id lo asigna el servidor y quien llama lo necesita para navegar. */
  createPlaylist: (title: string, description?: string) => Promise<Playlist>;
  addToPlaylist: (playlistId: string, track: Track) => void;
  removeFromPlaylist: (playlistId: string, trackId: string) => void;
  deletePlaylist: (playlistId: string) => void;
  renamePlaylist: (playlistId: string, newTitle: string) => void;
  setPlaylistCover: (playlistId: string, coverUrl: string) => void;
  togglePlaylistVisibility: (playlistId: string) => void;

  addToRecentlyPlayed: (track: Track) => void;
  clearRecentlyPlayed: () => void;

  toggleDownload: (trackId: string) => void;
  isDownloaded: (trackId: string) => boolean;

  /** `ratio` 0–1. Ignora extremos (casi sin empezar o prácticamente terminada). */
  saveResumePoint: (track: Track, positionSeconds: number, durationSeconds: number) => void;
  clearResumePoint: (trackId: string) => void;
  /** Los últimos N, más recientes primero — para `QuickAccessGrid`. */
  getRecentResumePoints: (limit?: number) => ResumePoint[];

  /** Rellena el espejo con el estado real del servidor (login / arranque). */
  syncFromServer: () => Promise<void>;
  /** Vacía lo que pertenece a la cuenta, al cerrar sesión. */
  clearAccountData: () => void;
}

export const useLibraryStore = create<LibraryStore>()(
  persist(
    (set, get) => ({
      favorites: [],
      playlists: [],
      downloadedTracks: [],
      recentlyPlayed: [],
      followedArtistIds: [],
      resumePoints: {},

      toggleFavorite: (track) => {
        const previous = get().favorites;
        const exists = previous.some((t) => t.id === track.id);
        set({
          favorites: exists
            ? previous.filter((t) => t.id !== track.id)
            : [{ ...track, isLiked: true }, ...previous],
        });
        // Señal fuerte de afinidad (+25) — sólo al dar "me gusta", no al quitarlo.
        if (!exists) {
          useUserBehaviorStore.getState().recordEvent({
            trackId: track.id,
            artistId: track.artistId,
            genre: track.primaryGenre ?? null,
            type: 'liked',
          });
        }
        void api.toggleLike(track.id).catch(() => {
          set({ favorites: previous });
          toast.error('No se pudo guardar tu "me gusta".');
        });
      },

      isFavorite: (trackId) => get().favorites.some((t) => t.id === trackId),

      toggleFollowArtist: (artistId) => {
        const previous = get().followedArtistIds;
        set({
          followedArtistIds: previous.includes(artistId)
            ? previous.filter((id) => id !== artistId)
            : [...previous, artistId],
        });
        void api.toggleFollowArtist(artistId).catch(() => {
          set({ followedArtistIds: previous });
          toast.error('No se pudo actualizar a quién sigues.');
        });
      },

      isFollowingArtist: (artistId) => get().followedArtistIds.includes(artistId),

      /**
       * Crea la playlist en el SERVIDOR y espera su id.
       *
       * Es la única mutación de este store que no es optimista: quien llama
       * usa el id devuelto para navegar a la playlist recién creada, y un id
       * provisional llevaría a una pantalla que no existe. Antes se generaba
       * aquí un `playlist-${Date.now()}` que el servidor nunca llegó a ver.
       */
      createPlaylist: async (title, description) => {
        const playlist = await api.createPlaylist({
          title: title.trim() || 'Playlist sin título',
          ...(description?.trim() ? { description: description.trim() } : {}),
        });
        set((state) => ({ playlists: [playlist, ...state.playlists] }));
        return playlist;
      },

      addToPlaylist: (playlistId, track) => {
        const previous = get().playlists;
        if (previous.find((p) => p.id === playlistId)?.tracks.some((t) => t.id === track.id)) return;

        set({
          playlists: previous.map((p) =>
            p.id === playlistId
              ? { ...p, tracks: [...p.tracks, track], updatedAt: new Date().toISOString() }
              : p,
          ),
        });
        void api.addTrackToPlaylist(playlistId, track.id).catch(() => {
          set({ playlists: previous });
          toast.error('No se pudo añadir la canción a la playlist.');
        });
      },

      removeFromPlaylist: (playlistId, trackId) => {
        const previous = get().playlists;
        set({
          playlists: previous.map((p) =>
            p.id === playlistId
              ? {
                  ...p,
                  tracks: p.tracks.filter((t) => t.id !== trackId),
                  updatedAt: new Date().toISOString(),
                }
              : p,
          ),
        });
        void api.removeTrackFromPlaylist(playlistId, trackId).catch(() => {
          set({ playlists: previous });
          toast.error('No se pudo quitar la canción de la playlist.');
        });
      },

      deletePlaylist: (playlistId) => {
        const previous = get().playlists;
        set({ playlists: previous.filter((p) => p.id !== playlistId) });
        void api.deletePlaylist(playlistId).catch(() => {
          set({ playlists: previous });
          toast.error('No se pudo borrar la playlist.');
        });
      },

      renamePlaylist: (playlistId, newTitle) => {
        const trimmed = newTitle.trim();
        if (!trimmed) return;
        const previous = get().playlists;
        set({
          playlists: previous.map((p) =>
            p.id === playlistId ? { ...p, title: trimmed, updatedAt: new Date().toISOString() } : p,
          ),
        });
        void api.updatePlaylist(playlistId, { title: trimmed }).catch(() => {
          set({ playlists: previous });
          toast.error('No se pudo renombrar la playlist.');
        });
      },

      setPlaylistCover: (playlistId, coverUrl) => {
        const previous = get().playlists;
        set({
          playlists: previous.map((p) =>
            p.id === playlistId ? { ...p, coverUrl, updatedAt: new Date().toISOString() } : p,
          ),
        });
        void api.updatePlaylist(playlistId, { coverUrl }).catch(() => {
          set({ playlists: previous });
          toast.error('No se pudo cambiar la portada.');
        });
      },

      togglePlaylistVisibility: (playlistId) => {
        const previous = get().playlists;
        const target = previous.find((p) => p.id === playlistId);
        if (!target) return;
        const isPublic = !target.isPublic;
        set({
          playlists: previous.map((p) =>
            p.id === playlistId ? { ...p, isPublic, updatedAt: new Date().toISOString() } : p,
          ),
        });
        void api.updatePlaylist(playlistId, { isPublic }).catch(() => {
          set({ playlists: previous });
          toast.error('No se pudo cambiar la visibilidad.');
        });
      },

      /**
       * Trae del servidor el estado real de la biblioteca.
       *
       * Se llama al iniciar sesión y al arrancar con sesión activa. Sin esto,
       * el espejo local sólo reflejaría lo que se hizo desde este teléfono:
       * un "me gusta" dado en la web no aparecería nunca.
       *
       * `allSettled` y no `all`: que falle una de las tres listas no debe
       * dejar las otras dos sin refrescar.
       */
      syncFromServer: async () => {
        const [favorites, followed, playlists] = await Promise.allSettled([
          api.getLikedTracks(),
          api.getFollowedArtistIds(),
          api.getPlaylists(),
        ]);
        set((state) => ({
          favorites: favorites.status === 'fulfilled' ? favorites.value : state.favorites,
          followedArtistIds: followed.status === 'fulfilled' ? followed.value : state.followedArtistIds,
          playlists: playlists.status === 'fulfilled' ? playlists.value : state.playlists,
        }));
      },

      /**
       * Borra lo que pertenece a la cuenta al cerrar sesión.
       *
       * Sin esto, el siguiente usuario de este teléfono vería los favoritos y
       * las playlists del anterior hasta que algo los sobrescribiera. Las
       * descargas y los puntos de reanudación se conservan: son del aparato.
       */
      clearAccountData: () =>
        set({ favorites: [], playlists: [], followedArtistIds: [], recentlyPlayed: [] }),

      addToRecentlyPlayed: (track) =>
        set((state) => {
          const filtered = state.recentlyPlayed.filter((t) => t.id !== track.id);
          return { recentlyPlayed: [track, ...filtered].slice(0, MAX_RECENTLY_PLAYED) };
        }),

      clearRecentlyPlayed: () => set({ recentlyPlayed: [] }),

      toggleDownload: (trackId) =>
        set((state) => ({
          downloadedTracks: state.downloadedTracks.includes(trackId)
            ? state.downloadedTracks.filter((id) => id !== trackId)
            : [...state.downloadedTracks, trackId],
        })),

      isDownloaded: (trackId) => get().downloadedTracks.includes(trackId),

      saveResumePoint: (track, positionSeconds, durationSeconds) => {
        if (durationSeconds <= 0) return;
        const ratio = positionSeconds / durationSeconds;
        if (ratio < MIN_RESUMABLE_RATIO || ratio > MAX_RESUMABLE_RATIO) {
          // Ya casi terminó (o casi no empezó): no tiene sentido "continuar" desde ahí.
          get().clearResumePoint(track.id);
          return;
        }
        set((state) => ({
          resumePoints: {
            ...state.resumePoints,
            [track.id]: { track, positionSeconds, durationSeconds, updatedAt: new Date().toISOString() },
          },
        }));
      },

      clearResumePoint: (trackId) =>
        set((state) => {
          if (!(trackId in state.resumePoints)) return state;
          const { [trackId]: _removed, ...rest } = state.resumePoints;
          return { resumePoints: rest };
        }),

      getRecentResumePoints: (limit = 6) =>
        Object.values(get().resumePoints)
          .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
          .slice(0, limit),
    }),
    {
      name: 'peyma-library',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
