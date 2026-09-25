import { Text, Pressable } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useAsyncData } from '../../src/hooks';
import { api } from '../../src/services';
import { Skeleton } from '../../src/components';
import { useThemedStyles, spacing, typography, radius, layout, motion, type Theme } from '../../src/theme';

/** Colores fijos para las tarjetas de género — dan variedad visual sin depender de imágenes. */
const TILE_COLORS = ['#E13300', '#7358FF', '#1E3264', '#148A08', '#E8115B', '#BC5900', '#503750', '#477D95'];

type BrowseTile =
  | { kind: 'chart'; key: string; label: string; sublabel: string; color: string; route: string }
  | { kind: 'genre'; key: string; label: string };

/** Rankings globales fijos, antes de los géneros — no dependen de si hay catálogo por género. */
const CHART_TILES: BrowseTile[] = [
  { kind: 'chart', key: 'top-tracks', label: 'Top 100 canciones', sublabel: 'Ranking global', color: '#B45309', route: '/charts' },
  { kind: 'chart', key: 'top-albums', label: 'Top 100 álbumes', sublabel: 'Ranking global', color: '#7C3AED', route: '/charts/albums' },
];

export default function BrowseScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(makeStyles);

  const { data: genres, isLoading } = useAsyncData((signal) => api.getGenres({ signal }), []);

  const tiles: BrowseTile[] = [
    ...CHART_TILES,
    ...(genres ?? []).map((genre): BrowseTile => ({ kind: 'genre', key: genre, label: genre })),
  ];

  return (
    <FlashList
      data={tiles}
      keyExtractor={(tile) => tile.key}
      numColumns={2}
      contentContainerStyle={[styles.listContent, { paddingTop: insets.top + spacing.xl }]}
      ListHeaderComponent={<Text style={styles.title}>Explorar</Text>}
      ListEmptyComponent={
        isLoading ? (
          <>
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} width="100%" height={100} borderRadius={12} style={styles.skeletonTile} />
            ))}
          </>
        ) : null
      }
      renderItem={({ item: tile, index }) => (
        <Animated.View entering={FadeInUp.delay(index * motion.stagger).duration(motion.duration.normal)} style={styles.tileWrapper}>
          <Pressable
            onPress={() =>
              tile.kind === 'chart' ? router.push(tile.route) : router.push(`/browse/${encodeURIComponent(tile.label)}`)
            }
            style={[styles.tile, { backgroundColor: tile.kind === 'chart' ? tile.color : TILE_COLORS[index % TILE_COLORS.length] }]}
            accessibilityRole="button"
            accessibilityLabel={tile.kind === 'chart' ? `${tile.label}, ${tile.sublabel}` : tile.label}
          >
            <Text style={styles.tileText}>{tile.label}</Text>
            {tile.kind === 'chart' && <Text style={styles.tileSubtext}>{tile.sublabel}</Text>}
          </Pressable>
        </Animated.View>
      )}
    />
  );
}

const makeStyles = ({ colors }: Theme) => ({
  listContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: layout.miniPlayerHeight + layout.tabBarHeight + spacing.xl,
  },
  title: {
    color: colors.text.primary,
    fontFamily: typography.family.bold,
    fontSize: typography.size['2xl'],
    marginBottom: spacing.xl,
    marginLeft: spacing.sm,
  },
  tileWrapper: {
    flex: 1,
    padding: spacing.xs,
  },
  tile: {
    height: 100,
    borderRadius: radius.lg,
    padding: spacing.md,
    justifyContent: 'flex-end' as const,
    overflow: 'hidden' as const,
  },
  tileText: {
    color: '#FFFFFF',
    fontFamily: typography.family.bold,
    fontSize: typography.size.lg,
  },
  tileSubtext: {
    color: 'rgba(255,255,255,0.75)',
    fontFamily: typography.family.semibold,
    fontSize: typography.size.xs,
    marginTop: 2,
  },
  skeletonTile: {
    marginBottom: spacing.sm,
  },
});
