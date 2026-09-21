import { useCallback } from 'react';
import { View, Text, Pressable, RefreshControl } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NumberOneSpotlightCard, TrendingTrackRow, EmptyState, Skeleton } from '../../src/components';
import { useTrendingChart } from '../../src/hooks';
import type { TrendingTrack } from '../../src/types';
import { usePlayerStore } from '../../src/store';
import { useTheme, useThemedStyles, spacing, typography, layout, type Theme } from '../../src/theme';

export default function TrendingChartScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { chart, loading, error, usingGlobalFallback, refresh } = useTrendingChart();
  const play = usePlayerStore((s) => s.play);

  const handlePlayTrack = useCallback(
    (track: TrendingTrack) => play(track, chart?.topTracks ?? [track]),
    [play, chart],
  );

  const handleOpenTrackDetails = useCallback(
    (track: TrendingTrack) => router.push(`/player/${track.id}`),
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: TrendingTrack }) => <TrendingTrackRow track={item} onPress={handleOpenTrackDetails} />,
    [handleOpenTrackDetails],
  );

  if (loading && !chart) {
    return (
      <View style={styles.container}>
        <View style={[styles.appBar, { paddingTop: insets.top + spacing.md }]}>
          <Pressable onPress={() => router.back()} hitSlop={20} accessibilityRole="button" accessibilityLabel="Volver">
            <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
          </Pressable>
          <Text style={styles.appBarTitle}>Top Charts</Text>
          <View style={{ width: 22 }} />
        </View>
        <View style={styles.skeletonBody}>
          <Skeleton width="100%" height={320} borderRadius={16} />
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} width="100%" height={64} borderRadius={8} style={{ marginTop: spacing.sm }} />
          ))}
        </View>
      </View>
    );
  }

  if (error && !chart) {
    return (
      <View style={styles.container}>
        <EmptyState icon="cloud-offline-outline" title="No pudimos cargar el ranking" description={error} actionLabel="Reintentar" onAction={refresh} />
      </View>
    );
  }

  if (!chart) return null;

  const numberOne = chart.topTracks.find((t) => t.rank === 1);
  const restOfChart = chart.topTracks.filter((t) => t.rank !== 1);

  return (
    <View style={styles.container}>
      <View style={[styles.appBar, { paddingTop: insets.top + spacing.md }]}>
        <Pressable onPress={() => router.back()} hitSlop={20} accessibilityRole="button" accessibilityLabel="Volver">
          <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
        </Pressable>
        <Text style={styles.appBarTitle}>Top Charts</Text>
        <View style={{ width: 22 }} />
      </View>

      <FlashList
        data={restOfChart}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + layout.miniPlayerHeight + spacing.xl }]}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.brand[500]} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.headerTitle}>
              {usingGlobalFallback ? 'Top global ahora mismo' : `Top en ${chart.locationLabel} ahora mismo`}
            </Text>
            <Text style={styles.headerSubtitle}>
              {usingGlobalFallback
                ? 'Activa la ubicación para ver el top de tu país o ciudad.'
                : `Actualizado hace unos minutos · ${chart.locationLabel}`}
            </Text>

            {numberOne && (
              <View style={styles.spotlightWrapper}>
                <NumberOneSpotlightCard track={numberOne} onPress={handleOpenTrackDetails} onPlay={handlePlayTrack} />
              </View>
            )}

            <Text style={styles.sectionLabel}>Resto del top</Text>
          </View>
        }
      />
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
  skeletonBody: {
    paddingHorizontal: spacing.lg,
  },
  header: {
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  headerTitle: {
    color: colors.text.primary,
    fontSize: typography.size.xl,
    fontFamily: typography.family.bold,
  },
  headerSubtitle: {
    color: colors.text.secondary,
    fontSize: typography.size.xs,
    fontFamily: typography.family.regular,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  spotlightWrapper: {
    marginBottom: spacing.xl,
  },
  sectionLabel: {
    color: colors.text.primary,
    fontSize: typography.size.base,
    fontFamily: typography.family.bold,
    marginBottom: spacing.xs,
  },
});
