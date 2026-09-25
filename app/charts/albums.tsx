import { useCallback } from 'react';
import { View, Text, Pressable, RefreshControl } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmptyState, Skeleton } from '../../src/components';
import { MediaCard } from '../../src/components/home';
import { useAsyncData } from '../../src/hooks';
import { api } from '../../src/services';
import type { RankedAlbum } from '../../src/services';
import { useTheme, useThemedStyles, spacing, typography, layout, type Theme } from '../../src/theme';

/**
 * Top 100 álbumes — reproducciones reales de los últimos 28 días, sin
 * sencillos (ver backend/src/services/trending.ts: `getTopAlbums`).
 */
export default function TopAlbumsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const { data: albums, isLoading, isRefreshing, error, refresh } = useAsyncData(
    (signal) => api.getTopAlbums(100, { signal }),
    [],
    'No pudimos cargar el ranking de álbumes.',
  );

  const renderItem = useCallback(
    ({ item, index }: { item: RankedAlbum; index: number }) => (
      <View style={styles.tileWrapper}>
        <Text style={styles.rank}>#{index + 1}</Text>
        <MediaCard
          kind="album"
          id={item.id}
          title={item.title}
          subtitle={item.artistName}
          coverUrl={item.coverUrl}
          onPress={() => router.push(`/album/${item.id}`)}
        />
      </View>
    ),
    [router, styles],
  );

  return (
    <View style={styles.container}>
      <View style={[styles.appBar, { paddingTop: insets.top + spacing.md }]}>
        <Pressable onPress={() => router.back()} hitSlop={20} accessibilityRole="button" accessibilityLabel="Volver">
          <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
        </Pressable>
        <Text style={styles.appBarTitle}>Top 100 álbumes</Text>
        <View style={{ width: 22 }} />
      </View>

      {isLoading && !albums ? (
        <View style={styles.skeletonGrid}>
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} width="47%" height={200} borderRadius={12} style={styles.skeletonTile} />
          ))}
        </View>
      ) : error && !albums ? (
        <EmptyState icon="cloud-offline-outline" title="No pudimos cargar el ranking" description={error} actionLabel="Reintentar" onAction={refresh} />
      ) : !albums || albums.length === 0 ? (
        <EmptyState
          icon="albums-outline"
          title="Todavía no hay ranking"
          description="Faltan reproducciones reales para armar un Top 100 de álbumes. Volvé pronto."
        />
      ) : (
        <FlashList
          data={albums}
          keyExtractor={(item) => item.id}
          numColumns={2}
          renderItem={renderItem}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + layout.miniPlayerHeight + spacing.xl }]}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={colors.brand[500]} />}
        />
      )}
    </View>
  );
}

const makeStyles = ({ colors }: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: colors.surface[50],
  },
  appBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface[50],
  },
  appBarTitle: {
    color: colors.text.primary,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.base,
  },
  listContent: {
    paddingHorizontal: spacing.md,
  },
  tileWrapper: {
    flex: 1,
    padding: spacing.xs,
  },
  rank: {
    color: colors.text.secondary,
    fontFamily: typography.family.bold,
    fontSize: typography.size.sm,
    marginBottom: spacing.xs,
  },
  skeletonGrid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  skeletonTile: {
    marginBottom: spacing.md,
  },
});
