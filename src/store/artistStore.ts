/**
 * Peyma Music — Artist Studio Store (Zustand)
 *
 * Cuando un usuario "se convierte en artista" obtiene un panel al estilo
 * Spotify for Artists: perfil público propio, sus lanzamientos y sus
 * estadísticas.
 *
 * Esas estadísticas vienen del servidor, de `GET /artists/:id/stats`, que las
 * calcula sobre `StreamLog` y `Follow`. Antes se generaban aquí a partir del
 * nombre del artista y `refreshStats` las subía un porcentaje al azar en cada
 * tirón de pantalla, de modo que un artista veía crecer unos oyentes que no
 * existían. Un cero real es información; un número inventado no lo es, y aquí
 * encima orientaba decisiones de alguien sobre su propia música.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Artist, ArtistStats, Track } from '../types';
import { api } from '../services/api';

interface ArtistStudioStore {
  /** Perfil público del artista gestionado por este usuario, o `null` si aún no es artista. */
  profile: Artist | null;
  /** Canciones del artista: las publicadas (según el servidor) más las que aún esperan aprobación. */
  releases: Track[];
  stats: ArtistStats | null;
  /** `true` mientras se consultan las métricas, para distinguir "cargando" de "cero". */
  isLoadingStats: boolean;

  /**
   * Guarda el perfil de artista que YA creó el servidor.
   *
   * `id` es obligatorio y viene de la API. Antes se generaba aquí
   * (`artist-self-<timestamp>`) y no existía para nadie más: cualquier
   * subida hecha con ese id habría sido rechazada por el backend.
   */
  becomeArtist: (input: { id: string; name: string; bio?: string; imageUrl?: string; genres: string[] }) => void;
  /** Guarda el cambio en el servidor y recién entonces actualiza el perfil local — ver comentario en la implementación. */
  updateProfile: (patch: Partial<Pick<Artist, 'name' | 'bio' | 'imageUrl' | 'genres'>>) => Promise<void>;
  stopBeingArtist: () => void;

  publishTrack: (track: Omit<Track, 'artist' | 'artistId' | 'isLiked'>) => void;
  removeRelease: (trackId: string) => void;

  /** Trae del servidor las métricas y los lanzamientos reales. */
  refreshStats: () => Promise<void>;
}

export const useArtistStore = create<ArtistStudioStore>()(
  persist(
    (set, get) => ({
      profile: null,
      releases: [],
      stats: null,
      isLoadingStats: false,

      becomeArtist: ({ id, name, bio, imageUrl, genres }) => {
        const trimmedName = name.trim() || 'Artista';
        const profile: Artist = {
          id,
          name: trimmedName,
          imageUrl: imageUrl || `https://picsum.photos/seed/${id}/300/300`,
          genres,
          // Un artista recién creado tiene cero oyentes. Lo era antes también;
          // la diferencia es que ahora se dice.
          monthlyListeners: 0,
          bio: bio?.trim() || undefined,
        };
        set({ profile, stats: null });
        void get().refreshStats();
      },

      /**
       * Antes esto era un `set()` puramente local: parecía guardar el
       * nombre/bio en la pantalla de edición, pero el servidor nunca se
       * enteraba. Otro dispositivo de la misma cuenta, el perfil público
       * que ve todo el mundo, y el panel admin seguían mostrando lo viejo
       * para siempre. Ahora el servidor manda: si la llamada falla, el
       * perfil local NO cambia, así la pantalla puede avisar del error en
       * vez de mostrar un cambio que en realidad no se guardó.
       */
      updateProfile: async (patch) => {
        const updated = await api.updateMyArtistProfile(patch);
        set({ profile: updated });
      },

      stopBeingArtist: () => set({ profile: null, releases: [], stats: null, isLoadingStats: false }),

      /**
       * Registro local de una canción recién subida, para que aparezca al
       * instante sin esperar al próximo `refreshStats` (que de cualquier
       * forma la reemplaza por la copia real del servidor en cuanto llega,
       * vía `GET /artists/me/tracks` — ver abajo).
       */
      publishTrack: (track) =>
        set((state) => {
          if (!state.profile) return state;
          const fullTrack: Track = {
            ...track,
            artist: state.profile.name,
            artistId: state.profile.id,
            isLiked: false,
            status: 'PENDING_REVIEW',
          };
          return { releases: [fullTrack, ...state.releases] };
        }),

      removeRelease: (trackId) =>
        set((state) => ({ releases: state.releases.filter((t) => t.id !== trackId) })),

      refreshStats: async () => {
        const profile = get().profile;
        if (!profile) return;

        set({ isLoadingStats: true });
        try {
          /**
           * `getMyTracks` (no `getArtistTracks`) porque trae TODOS los
           * estados, no sólo `APPROVED`. Antes se mezclaba lo aprobado del
           * servidor con lo pendiente que quedaba en el teléfono desde
           * `publishTrack`, y esa mezcla local nunca se enteraba de un
           * rechazo ni de una aprobación hecha desde otro dispositivo —
           * la canción se veía "pendiente" para siempre aunque ya hubiera
           * una decisión real. Con esto el servidor manda siempre.
           */
          const [stats, releases] = await Promise.all([api.getArtistStats(profile.id), api.getMyTracks()]);

          set((state) => ({
            stats,
            releases,
            isLoadingStats: false,
            profile: state.profile
              ? { ...state.profile, monthlyListeners: stats.monthlyListeners }
              : state.profile,
          }));
        } catch {
          // Sin red se conserva lo último que sí vino del servidor, en vez de
          // vaciar el panel o inventar un relleno.
          set({ isLoadingStats: false });
        }
      },
    }),
    {
      name: 'peyma-artist-studio',
      storage: createJSONStorage(() => AsyncStorage),
      // `isLoadingStats` es de esta ejecución: persistirlo dejaría el panel
      // en "cargando" para siempre si la app se cierra durante la consulta.
      partialize: ({ profile, releases, stats }) => ({ profile, releases, stats }),
    },
  ),
);

export type { ArtistStats };
