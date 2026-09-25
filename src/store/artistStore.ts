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
  /**
   * Trae del servidor el perfil de artista de quien ha iniciado sesión y
   * pisa con él la copia local.
   *
   * Hacía falta porque este store se persiste en el teléfono y era la ÚNICA
   * fuente del perfil dentro de la app: se escribía al crearlo y ya no se
   * volvía a mirar. `api.getMyArtistProfile()` existía y no lo llamaba
   * nadie. El resultado es que la copia del teléfono y la del servidor se
   * separaban —un perfil creado o editado desde la web no llegaba nunca
   * aquí— y el estudio mostraba un perfil mientras la página pública del
   * artista mostraba otro. Manda el servidor.
   */
  syncFromServer: () => Promise<void>;
  updateProfile: (patch: Partial<Pick<Artist, 'name' | 'bio' | 'imageUrl' | 'genres'>>) => void;
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

      syncFromServer: async () => {
        let artist: Artist | null;
        try {
          artist = await api.getMyArtistProfile();
        } catch {
          // Sin red se conserva lo que haya en el teléfono: dejar al artista
          // sin estudio porque el avión no tiene cobertura sería peor que
          // enseñarle datos de hace un rato.
          return;
        }

        if (!artist) {
          // El servidor dice que esta cuenta no tiene perfil. Si quedaba uno
          // local es que se borró desde otro sitio, o que el teléfono guarda
          // el de una sesión anterior.
          if (get().profile) set({ profile: null, releases: [], stats: null });
          return;
        }

        set({ profile: artist });
        void get().refreshStats();
      },

      updateProfile: (patch) =>
        set((state) => (state.profile ? { profile: { ...state.profile, ...patch } } : state)),

      stopBeingArtist: () => set({ profile: null, releases: [], stats: null, isLoadingStats: false }),

      /**
       * Registro local de una canción recién subida.
       *
       * Se añade aquí porque el servidor todavía no la devuelve: acaba de
       * entrar en revisión y `GET /tracks` sólo publica las aprobadas. En
       * cuanto la aprueben, `refreshStats` la recibirá del servidor y esta
       * copia se reemplaza por la buena.
       */
      publishTrack: (track) =>
        set((state) => {
          if (!state.profile) return state;
          const fullTrack: Track = {
            ...track,
            artist: state.profile.name,
            artistId: state.profile.id,
            isLiked: false,
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
          const [stats, published] = await Promise.all([
            api.getArtistStats(profile.id),
            api.getArtistTracks(profile.id),
          ]);

          // Las que subió desde este teléfono y aún no están aprobadas no
          // vienen del servidor: se conservan para que no parezca que la
          // subida se perdió mientras está en revisión.
          const publishedIds = new Set(published.map((t) => t.id));
          const stillPending = get().releases.filter((t) => !publishedIds.has(t.id));

          set((state) => ({
            stats,
            releases: [...published, ...stillPending],
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
