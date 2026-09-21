import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Keyboard, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDebounce } from '../../src/hooks';
import { api, isAbortError } from '../../src/services';
import type { Track, Artist, Album, Playlist, SearchResults, SearchCategory } from '../../src/types';
import { TrackRow, Skeleton, EmptyState } from '../../src/components';
import { usePlayerStore } from '../../src/store';
import { useTheme, useThemedStyles, spacing, radius, layout, typography, type Theme } from '../../src/theme';
import { formatNumber } from '../../src/utils';

const CATEGORY_TABS: { key: SearchCategory; label: string }[] = [
  { key: 'all', label: 'Todo' },
  { key: 'tracks', label: 'Canciones' },
  { key: 'artists', label: 'Artistas' },
  { key: 'albums', label: 'Álbumes' },
  { key: 'playlists', label: 'Playlists' },
];

/** Cuántos resultados de cada tipo se muestran en la vista "Todo" antes de "Ver todo". */
const ALL_TAB_PREVIEW_COUNT = 3;

type SearchListItem =
  | { kind: 'header'; key: string; title: string; onSeeAll?: () => void }
  | { kind: 'track'; key: string; track: Track }
  | { kind: 'artist'; key: string; artist: Artist }
  | { kind: 'album'; key: string; album: Album }
  | { kind: 'playlist'; key: string; playlist: Playlist };

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 400);
  const [category, setCategory] = useState<SearchCategory>('all');
  // Al cambiar de búsqueda se vuelve a "Todo": ajuste de estado en el propio
  // render (patrón recomendado por React) en vez de un efecto extra que
  // dispare un segundo re-render después de montar.
  const [categoryResetKey, setCategoryResetKey] = useState(debouncedQuery);
  if (debouncedQuery !== categoryResetKey) {
    setCategoryResetKey(debouncedQuery);
    setCategory('all');
  }
  const [results, setResults] = useState<SearchResults | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const play = usePlayerStore((s) => s.play);

  const runSearch = useCallback((q: string, signal: AbortSignal) => {
    if (!q.trim()) {
      setResults(null);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    api
      .search(q, { signal })
      .then((data) => {
        if (!signal.aborted) setResults(data);
      })
      .catch((err) => {
        if (isAbortError(err)) return;
        console.error('[search] Falló la búsqueda:', err);
        setError('No pudimos buscar en este momento.');
      })
      .finally(() => {
        if (!signal.aborted) setIsLoading(false);
      });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    runSearch(debouncedQuery, controller.signal);
    return () => controller.abort();
  }, [debouncedQuery, runSearch]);

  const handleTrackPress = (track: Track) => {
    Keyboard.dismiss();
    play(track, results?.tracks ?? [track]);
  };

  const listItems = useMemo<SearchListItem[]>(() => {
    if (!results) return [];

    if (category === 'tracks') return results.tracks.map((track) => ({ kind: 'track' as const, key: track.id, track }));
    if (category === 'artists') return results.artists.map((artist) => ({ kind: 'artist' as const, key: artist.id, artist }));
    if (category === 'albums') return results.albums.map((album) => ({ kind: 'album' as const, key: album.id, album }));
    if (category === 'playlists')
      return results.playlists.map((playlist) => ({ kind: 'playlist' as const, key: playlist.id, playlist }));

    // "Todo": secciones intercaladas, cada una con un adelanto y su propio "Ver todo".
    const items: SearchListItem[] = [];
    if (results.tracks.length > 0) {
      items.push({ kind: 'header', key: 'h-tracks', title: 'Canciones', onSeeAll: () => setCategory('tracks') });
      items.push(
        ...results.tracks
          .slice(0, ALL_TAB_PREVIEW_COUNT)
          .map((track) => ({ kind: 'track' as const, key: track.id, track })),
      );
    }
    if (results.artists.length > 0) {
      items.push({ kind: 'header', key: 'h-artists', title: 'Artistas', onSeeAll: () => setCategory('artists') });
      items.push(
        ...results.artists
          .slice(0, ALL_TAB_PREVIEW_COUNT)
          .map((artist) => ({ kind: 'artist' as const, key: artist.id, artist })),
      );
    }
    if (results.albums.length > 0) {
      items.push({ kind: 'header', key: 'h-albums', title: 'Álbumes', onSeeAll: () => setCategory('albums') });
      items.push(
        ...results.albums.slice(0, ALL_TAB_PREVIEW_COUNT).map((album) => ({ kind: 'album' as const, key: album.id, album })),
      );
    }
    if (results.playlists.length > 0) {
      items.push({ kind: 'header', key: 'h-playlists', title: 'Playlists', onSeeAll: () => setCategory('playlists') });
      items.push(
        ...results.playlists
          .slice(0, ALL_TAB_PREVIEW_COUNT)
          .map((playlist) => ({ kind: 'playlist' as const, key: playlist.id, playlist })),
      );
    }
    return items;
  }, [results, category]);

  const hasAnyResults = Boolean(
    results && (results.tracks.length || results.artists.length || results.albums.length || results.playlists.length),
  );

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.xl }]}>
        <Text style={styles.title}>Buscar</Text>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color={colors.text.secondary} />
          <TextInput
            style={styles.input}
            placeholder="¿Qué quieres escuchar?"
            placeholderTextColor={colors.text.secondary}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Buscar canciones, artistas, álbumes y playlists"
          />
          {query.length > 0 && (
            <Ionicons
              name="close-circle"
              size={20}
              color={colors.text.secondary}
              onPress={() => setQuery('')}
              accessibilityRole="button"
              accessibilityLabel="Borrar búsqueda"
            />
          )}
        </View>

        {hasAnyResults && (
          <View style={styles.categoryRow}>
            {CATEGORY_TABS.map((tab) => {
              const active = category === tab.key;
              return (
                <Pressable
                  key={tab.key}
                  onPress={() => setCategory(tab.key)}
                  style={[styles.categoryPill, active && styles.categoryPillActive]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.categoryPillText, active && styles.categoryPillTextActive]}>{tab.label}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      <View style={styles.content}>
        {isLoading ? (
          <View style={styles.skeletonList}>
            {[...Array(6)].map((_, i) => (
              <View key={i} style={styles.skeletonRow}>
                <Skeleton width={48} height={48} borderRadius={4} />
                <View style={styles.skeletonInfo}>
                  <Skeleton width="55%" height={15} />
                  <Skeleton width="35%" height={13} style={styles.skeletonSubline} />
                </View>
              </View>
            ))}
          </View>
        ) : error ? (
          <EmptyState icon="cloud-offline-outline" title="Error de búsqueda" description={error} />
        ) : !debouncedQuery ? (
          <EmptyState icon="search-outline" title="Encuentra tu música" description="Busca canciones, artistas, álbumes y playlists." />
        ) : !hasAnyResults ? (
          <EmptyState icon="musical-notes-outline" title="Sin resultados" description={`No encontramos nada para "${debouncedQuery}".`} />
        ) : (
          <FlashList
            data={listItems}
            keyExtractor={(item) => item.key}
            getItemType={(item) => item.kind}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => {
              switch (item.kind) {
                case 'header':
                  return (
                    <View style={styles.sectionHeader}>
                      <Text style={styles.sectionTitle}>{item.title}</Text>
                      {item.onSeeAll && (
                        <Pressable onPress={item.onSeeAll} hitSlop={8}>
                          <Text style={styles.sectionSeeAll}>Ver todo</Text>
                        </Pressable>
                      )}
                    </View>
                  );
                case 'track':
                  return <TrackRow track={item.track} onPress={handleTrackPress} />;
                case 'artist':
                  return (
                    <Pressable
                      onPress={() => router.push(`/artist/${item.artist.id}`)}
                      style={({ pressed }) => [styles.rowItem, pressed && styles.rowItemPressed]}
                    >
                      <Image source={item.artist.imageUrl} style={styles.artistImage} contentFit="cover" />
                      <View style={styles.rowInfo}>
                        <Text style={styles.rowTitle} numberOfLines={1}>{item.artist.name}</Text>
                        <Text style={styles.rowSubtitle}>{formatNumber(item.artist.monthlyListeners)} oyentes · Artista</Text>
                      </View>
                    </Pressable>
                  );
                case 'album':
                  return (
                    <Pressable
                      onPress={() => router.push(`/album/${item.album.id}`)}
                      style={({ pressed }) => [styles.rowItem, pressed && styles.rowItemPressed]}
                    >
                      <Image source={item.album.coverUrl} style={styles.squareImage} contentFit="cover" />
                      <View style={styles.rowInfo}>
                        <Text style={styles.rowTitle} numberOfLines={1}>{item.album.title}</Text>
                        <Text style={styles.rowSubtitle} numberOfLines={1}>{item.album.artistName} · Álbum</Text>
                      </View>
                    </Pressable>
                  );
                case 'playlist':
                  return (
                    <Pressable
                      onPress={() => router.push(`/playlist/${item.playlist.id}`)}
                      style={({ pressed }) => [styles.rowItem, pressed && styles.rowItemPressed]}
                    >
                      <Image source={item.playlist.coverUrl} style={styles.squareImage} contentFit="cover" />
                      <View style={styles.rowInfo}>
                        <Text style={styles.rowTitle} numberOfLines={1}>{item.playlist.title}</Text>
                        <Text style={styles.rowSubtitle} numberOfLines={1}>{item.playlist.ownerName} · Playlist</Text>
                      </View>
                    </Pressable>
                  );
              }
            }}
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
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  title: {
    color: colors.text.primary,
    fontFamily: typography.family.bold,
    fontSize: typography.size['2xl'],
    marginBottom: spacing.lg,
  },
  searchBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: colors.surface[200],
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    height: 48,
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    color: colors.text.primary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.base,
  },
  categoryRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  categoryPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    backgroundColor: colors.surface[200],
  },
  categoryPillActive: {
    backgroundColor: colors.text.primary,
  },
  categoryPillText: {
    color: colors.text.primary,
    fontFamily: typography.family.medium,
    fontSize: typography.size.xs,
  },
  categoryPillTextActive: {
    color: colors.surface[0],
  },
  content: {
    flex: 1,
  },
  listContent: {
    paddingBottom: layout.miniPlayerHeight + layout.tabBarHeight + spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  sectionTitle: {
    color: colors.text.primary,
    fontFamily: typography.family.bold,
    fontSize: typography.size.md,
  },
  sectionSeeAll: {
    color: colors.text.secondary,
    fontFamily: typography.family.medium,
    fontSize: typography.size.xs,
  },
  rowItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  rowItemPressed: {
    backgroundColor: colors.surface[200],
  },
  artistImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface[300],
  },
  squareImage: {
    width: 48,
    height: 48,
    borderRadius: radius.xs,
    backgroundColor: colors.surface[300],
  },
  rowInfo: {
    flex: 1,
    marginLeft: spacing.md,
    justifyContent: 'center' as const,
  },
  rowTitle: {
    color: colors.text.primary,
    fontFamily: typography.family.medium,
    fontSize: typography.size.base,
    marginBottom: 3,
  },
  rowSubtitle: {
    color: colors.text.secondary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.sm,
  },
  skeletonList: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  skeletonRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginBottom: spacing.lg,
  },
  skeletonInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  skeletonSubline: {
    marginTop: spacing.xs,
  },
});
