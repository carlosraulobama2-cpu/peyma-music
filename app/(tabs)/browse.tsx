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

export default function BrowseScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(makeStyles);

  const { data: genres, isLoading } = useAsyncData((signal) => api.getGenres({ signal }), []);

  return (
    <FlashList
      data={genres ?? []}
      keyExtractor={(genre) => genre}
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
      renderItem={({ item: genre, index }) => (
        <Animated.View entering={FadeInUp.delay(index * motion.stagger).duration(motion.duration.normal)} style={styles.tileWrapper}>
          <Pressable
            onPress={() => router.push(`/browse/${encodeURIComponent(genre)}`)}
            style={[styles.tile, { backgroundColor: TILE_COLORS[index % TILE_COLORS.length] }]}
            accessibilityRole="button"
            accessibilityLabel={genre}
          >
            <Text style={styles.tileText}>{genre}</Text>
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
  skeletonTile: {
    marginBottom: spacing.sm,
  },
});
