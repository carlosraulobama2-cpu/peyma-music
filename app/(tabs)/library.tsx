import { useMemo, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLibraryStore, usePlayerStore, toast } from '../../src/store';
import { TrackRow, EmptyState, Carousel, type CarouselItemData } from '../../src/components';
import { api } from '../../src/services';
import { useAsyncData } from '../../src/hooks';
import type { Track } from '../../src/types';
import { useTheme, useThemedStyles, spacing, radius, layout, typography, type Theme } from '../../src/theme';

type LibraryFilter = 'all' | 'playlists' | 'liked' | 'downloads' | 'recent';

const FILTERS: { key: LibraryFilter; label: string }[] = [
  { key: 'all', label: 'Todo' },
  { key: 'playlists', label: 'Playlists' },
  { key: 'liked', label: 'Me gusta' },
  { key: 'downloads', label: 'Descargas' },
  { key: 'recent', label: 'Recientes' },
];

export default function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();

  const favorites = useLibraryStore((s) => s.favorites);
  const playlists = useLibraryStore((s) => s.playlists);
  const followedArtistIds = useLibraryStore((s) => s.followedArtistIds);
  const downloadedTrackIds = useLibraryStore((s) => s.downloadedTracks);
  const recentlyPlayed = useLibraryStore((s) => s.recentlyPlayed);
  const createPlaylist = useLibraryStore((s) => s.createPlaylist);
  const play = usePlayerStore((s) => s.play);

  const [filter, setFilter] = useState<LibraryFilter>('all');

  // El catálogo mock es pequeño; en un backend real esto sería
  // GET /users/following en vez de traer todo y filtrar en cliente.
  const { data: allArtists } = useAsyncData((signal) => api.getArtists({ signal }), []);
  const followedArtists = useMemo(
    () => (allArtists ?? []).filter((a) => followedArtistIds.includes(a.id)),
    [allArtists, followedArtistIds],
  );
  const followedArtistItems: CarouselItemData[] = useMemo(
    () => followedArtists.map((a) => ({ id: a.id, title: a.name, imageUrl: a.imageUrl })),
    [followedArtists],
  );

  const downloadedTracks = useMemo(() => {
    const ids = new Set(downloadedTrackIds);
    // Se busca en favoritas y recientes, que es de donde suele venir una
    // canción marcada para descarga en esta app basada en catálogo mock.
    const pool = [...favorites, ...recentlyPlayed];
    const seen = new Map<string, Track>();
    for (const track of pool) {
      if (ids.has(track.id)) seen.set(track.id, track);
    }
    return Array.from(seen.values());
  }, [downloadedTrackIds, favorites, recentlyPlayed]);

  const handleTrackPress = (track: Track, queue: Track[]) => play(track, queue);

  // La playlist la crea el servidor, así que hay que esperar su id antes de
  // navegar: con uno inventado la pantalla de destino no existiría.
  const handleCreatePlaylist = async () => {
    try {
      const playlist = await createPlaylist('Playlist nueva');
      router.push(`/playlist/${playlist.id}`);
    } catch {
      toast.error('No se pudo crear la playlist.');
    }
  };

  const isEmpty =
    favorites.length === 0 && playlists.length === 0 && followedArtists.length === 0 && recentlyPlayed.length === 0;

  const filteredTracks: Track[] =
    filter === 'liked' ? favorites : filter === 'downloads' ? downloadedTracks : filter === 'recent' ? recentlyPlayed : [];

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.xl }]}>
        <Text style={styles.title}>Tu biblioteca</Text>
        <Pressable
          onPress={() => void handleCreatePlaylist()}
          hitSlop={16}
          accessibilityRole="button"
          accessibilityLabel="Crear playlist"
          style={styles.addButton}
        >
          <Ionicons name="add" size={26} color={colors.text.primary} />
        </Pressable>
      </View>

      {!isEmpty && (
        <View style={styles.filterRow}>
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={[styles.filterChip, active && styles.filterChipActive]}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <View style={styles.content}>
        {isEmpty ? (
          <EmptyState
            icon="musical-notes-outline"
            title="Tu biblioteca está vacía"
            description="Dale corazón a las canciones que te gusten, sigue artistas o crea tu primera playlist."
            actionLabel="Crear playlist"
            onAction={handleCreatePlaylist}
          />
        ) : filter === 'playlists' ? (
          playlists.length === 0 ? (
            <EmptyState icon="list-outline" title="Sin playlists" description="Crea tu primera playlist." actionLabel="Crear playlist" onAction={handleCreatePlaylist} />
          ) : (
            <FlashList
              data={playlists}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => router.push(`/playlist/${item.id}`)}
                  style={({ pressed }) => [styles.playlistRow, pressed && styles.playlistRowPressed]}
                >
                  <View style={styles.playlistIcon}>
                    <Ionicons name="musical-notes" size={20} color={colors.text.secondary} />
                  </View>
                  <View style={styles.playlistInfo}>
                    <Text style={styles.playlistTitle} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.playlistMeta}>{item.tracks.length} canciones</Text>
                  </View>
                </Pressable>
              )}
            />
          )
        ) : filter !== 'all' ? (
          filteredTracks.length === 0 ? (
            <EmptyState
              icon={filter === 'downloads' ? 'download-outline' : filter === 'recent' ? 'time-outline' : 'heart-outline'}
              title={filter === 'downloads' ? 'Sin descargas' : filter === 'recent' ? 'Sin reproducciones recientes' : 'Sin canciones que te gusten'}
              description={filter === 'downloads' ? 'Descarga canciones desde el menú "···" para escucharlas sin conexión.' : undefined}
            />
          ) : (
            <FlashList
              data={filteredTracks}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => <TrackRow track={item} onPress={(t) => handleTrackPress(t, filteredTracks)} />}
              contentContainerStyle={styles.listContent}
            />
          )
        ) : (
          <FlashList
            data={favorites}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <TrackRow track={item} onPress={(t) => handleTrackPress(t, favorites)} />}
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={
              <View>
                {followedArtistItems.length > 0 && (
                  <Carousel
                    title="Artistas que sigues"
                    data={followedArtistItems}
                    circular
                    onItemPress={(item) => router.push(`/artist/${item.id}`)}
                  />
                )}

                {playlists.length > 0 && (
                  <View style={styles.playlistsSection}>
                    <Text style={styles.sectionTitle}>Tus playlists</Text>
                    {playlists.slice(0, 5).map((playlist) => (
                      <Pressable
                        key={playlist.id}
                        onPress={() => router.push(`/playlist/${playlist.id}`)}
                        style={({ pressed }) => [styles.playlistRow, pressed && styles.playlistRowPressed]}
                      >
                        <View style={styles.playlistIcon}>
                          <Ionicons name="musical-notes" size={20} color={colors.text.secondary} />
                        </View>
                        <View style={styles.playlistInfo}>
                          <Text style={styles.playlistTitle} numberOfLines={1}>
                            {playlist.title}
                          </Text>
                          <Text style={styles.playlistMeta}>{playlist.tracks.length} canciones</Text>
                        </View>
                      </Pressable>
                    ))}
                    {playlists.length > 5 && (
                      <Pressable onPress={() => setFilter('playlists')} style={styles.seeAllRow}>
                        <Text style={styles.seeAllText}>Ver todas tus playlists</Text>
                      </Pressable>
                    )}
                  </View>
                )}

                {favorites.length > 0 && <Text style={styles.sectionTitle}>Canciones que te gustan</Text>}
              </View>
            }
          />
        )}
      </View>
    </View>
  );
}

const makeStyles = ({ colors }: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: colors.surface[50],
  },
  header: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  title: {
    color: colors.text.primary,
    fontFamily: typography.family.bold,
    fontSize: typography.size['2xl'],
  },
  addButton: {
    width: 40,
    height: 40,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  filterRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    backgroundColor: colors.surface[200],
  },
  filterChipActive: {
    backgroundColor: colors.text.primary,
  },
  filterChipText: {
    color: colors.text.primary,
    fontFamily: typography.family.medium,
    fontSize: typography.size.xs,
  },
  filterChipTextActive: {
    color: colors.surface[0],
  },
  content: {
    flex: 1,
  },
  listContent: {
    paddingBottom: layout.miniPlayerHeight + layout.tabBarHeight + spacing.xl,
  },
  playlistsSection: {
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    color: colors.text.secondary,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.xs,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  playlistRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  playlistRowPressed: {
    backgroundColor: colors.surface[200],
  },
  playlistIcon: {
    width: 48,
    height: 48,
    borderRadius: 4,
    backgroundColor: colors.surface[300],
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  playlistInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  playlistTitle: {
    color: colors.text.primary,
    fontFamily: typography.family.medium,
    fontSize: typography.size.base,
    marginBottom: 2,
  },
  playlistMeta: {
    color: colors.text.secondary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.sm,
  },
  seeAllRow: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  seeAllText: {
    color: colors.brand[500],
    fontFamily: typography.family.semibold,
    fontSize: typography.size.sm,
  },
});
