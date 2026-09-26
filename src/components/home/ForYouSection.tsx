import { View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { usePlayerStore, useSheetStore } from '../../store';
import { useRecommendations } from '../../hooks';
import { MediaCard } from './MediaCard';
import { SectionHeader } from './SectionHeader';
import { Skeleton } from '../Skeleton';
import { EmptyState } from '../EmptyState';
import { useThemedStyles, spacing, type Theme } from '../../theme';

const FOR_YOU_TINT = '#B478FF';

/**
 * "Especialmente para ti" — fusiona lo que el prompt original pedía dos
 * veces con nombres distintos ("Escucha esto" y "Especialmente para ti"):
 * ambas son la misma idea (mezclar afinidad alta con exploración 20%), así
 * que es una sola sección en vez de dos casi idénticas compitiendo por el
 * mismo espacio en Inicio.
 */
export function ForYouSection() {
  const styles = useThemedStyles(makeStyles);
  const play = usePlayerStore((s) => s.play);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const openTrackOptions = useSheetStore((s) => s.openTrackOptions);

  const { items, isLoading, error, isColdStart, refresh } = useRecommendations();

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Skeleton width={200} height={22} style={styles.skeletonTitle} />
        <Skeleton width="100%" height={150} borderRadius={12} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <EmptyState icon="sparkles-outline" title="No pudimos armar tus recomendaciones" description={error} actionLabel="Reintentar" onAction={refresh} />
      </View>
    );
  }

  if (items.length === 0) return null;

  const tracks = items.map((item) => item.track);

  return (
    <View style={styles.container}>
      <SectionHeader
        icon="sparkles"
        title="Especialmente para ti"
        subtitle={isColdStart ? 'Escucha y dale "me gusta" para que esto se ajuste a ti' : 'Basado en lo que más escuchas'}
        accentColor={FOR_YOU_TINT}
      />
      <FlashList
        data={items}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.track.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <MediaCard
              kind="track"
              id={item.track.id}
              title={item.track.title}
              subtitle={item.track.artist}
              coverUrl={item.track.coverUrl}
              isActive={currentTrack?.id === item.track.id}
              isPlaying={isPlaying}
              onPress={() => openTrackOptions(item.track)}
              onPlayPress={() => play(item.track, tracks)}
              onOptionsPress={() => openTrackOptions(item.track)}
            />
          </View>
        )}
      />
    </View>
  );
}

const makeStyles = (_theme: Theme) => ({
  container: {
    marginBottom: spacing.xl,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
  },
  item: {
    marginRight: spacing.md,
  },
  skeletonTitle: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
});
