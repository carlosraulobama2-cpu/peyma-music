import { View, Text } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { api } from '../../services';
import { useAsyncData } from '../../hooks';
import { usePlayerStore, useSheetStore } from '../../store';
import { MediaCard } from './MediaCard';
import { Skeleton } from '../Skeleton';
import { useThemedStyles, spacing, typography, type Theme } from '../../theme';

/** "Novedades": filtrado exclusivamente por `isNewRelease` o `releaseDate` dentro de los últimos 30 días. */
export function NewReleasesSection() {
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);
  const play = usePlayerStore((s) => s.play);
  const openTrackOptions = useSheetStore((s) => s.openTrackOptions);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);

  const { data: tracks, isLoading, error } = useAsyncData(
    (signal) => api.getNewReleaseTracks({ signal }),
    [],
    'No pudimos cargar las novedades.',
  );

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Skeleton width={140} height={20} style={styles.skeletonTitle} />
        <Skeleton width="100%" height={150} borderRadius={12} />
      </View>
    );
  }

  if (error || !tracks || tracks.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Novedades</Text>
      <FlashList
        data={tracks}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <MediaCard
              kind="track"
              id={item.id}
              title={item.title}
              subtitle={item.artist}
              coverUrl={item.coverUrl}
              isActive={currentTrack?.id === item.id}
              isPlaying={isPlaying}
              onPress={() => router.push(`/album/${item.albumId}`)}
              onPlayPress={() => play(item, tracks)}
              onOptionsPress={() => openTrackOptions(item)}
            />
          </View>
        )}
      />
    </View>
  );
}

const makeStyles = ({ colors }: Theme) => ({
  container: {
    marginBottom: spacing.xl,
  },
  title: {
    color: colors.text.primary,
    fontFamily: typography.family.bold,
    fontSize: typography.size.lg,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.lg,
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
