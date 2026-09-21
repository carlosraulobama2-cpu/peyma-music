import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { api } from '../../src/services';
import { AppBar, TrackRow, EmptyState, Skeleton } from '../../src/components';
import type { Track } from '../../src/types';
import { usePlayerStore } from '../../src/store';
import { useAsyncData } from '../../src/hooks';
import { useThemedStyles, spacing, layout, type Theme } from '../../src/theme';
import LofiScreen from '../lofi';

export default function GenreResultsScreen() {
  const { genre } = useLocalSearchParams<{ genre: string }>();
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);
  const decodedGenre = decodeURIComponent(genre ?? '');

  // El género Lo-Fi tiene su propio módulo de reproductor/catálogo con una
  // estética dedicada (ver app/lofi) — se reutiliza en vez de duplicar la
  // pantalla genérica de género.
  const isLofi = decodedGenre.toLowerCase() === 'lo-fi';

  const play = usePlayerStore((s) => s.play);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);

  const { data: tracks, isLoading, error, refresh } = useAsyncData<Track[]>(
    (signal) => api.getTracksByGenre(decodedGenre, { signal }),
    [decodedGenre],
    'No pudimos cargar este género.',
  );

  const handleTrackPress = (track: Track) => play(track, tracks ?? [track]);

  // El chequeo va después de llamar a todos los hooks de arriba (nunca antes)
  // para no violar las reglas de hooks si el usuario navega de un género a
  // otro sin que la pantalla se desmonte.
  if (isLofi) return <LofiScreen />;

  return (
    <View style={styles.container}>
      <AppBar title={decodedGenre} leftAction={{ icon: 'chevron-back', onPress: () => router.back() }} />

      {isLoading ? (
        <View style={styles.skeletonList}>
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} width="100%" height={64} borderRadius={8} style={styles.skeletonRow} />
          ))}
        </View>
      ) : error || !tracks ? (
        <EmptyState icon="cloud-offline-outline" title="Error" description={error ?? undefined} actionLabel="Reintentar" onAction={refresh} />
      ) : tracks.length === 0 ? (
        <EmptyState icon="musical-notes-outline" title="Sin canciones" description={`No hay canciones de ${decodedGenre} todavía.`} />
      ) : (
        <FlashList
          data={tracks}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TrackRow track={item} onPress={handleTrackPress} isActive={currentTrack?.id === item.id} isPlaying={isPlaying} />
          )}
          contentContainerStyle={styles.listContent}
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
  listContent: {
    paddingBottom: layout.miniPlayerHeight + spacing.xl,
  },
  skeletonList: {
    paddingHorizontal: spacing.lg,
  },
  skeletonRow: {
    marginBottom: spacing.md,
  },
});
