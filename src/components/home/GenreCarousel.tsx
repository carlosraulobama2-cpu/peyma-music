import { useCallback, useState } from 'react';
import { View, Text } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { api, isAbortError } from '../../services';
import { usePlayerStore, useSheetStore } from '../../store';
import { useAsyncData } from '../../hooks';
import { MediaCard } from './MediaCard';
import { Skeleton } from '../Skeleton';
import type { Genre, Track } from '../../types';
import { GENRE_LABEL, isValidGenreForSection } from '../../types/music';
import { useThemedStyles, spacing, typography, type Theme } from '../../theme';

const PAGE_SIZE = 8;

interface GenreCarouselProps {
  genre: Genre;
}

/**
 * Carrusel dedicado a un único género. Cero contaminación cruzada: cada
 * pista se valida con `isValidGenreForSection` antes de entrar a la lista
 * — si `getTracksByPrimaryGenrePaged` alguna vez devolviera algo fuera de
 * género por un bug de la capa de datos, no se renderiza acá silenciosamente.
 */
export function GenreCarousel({ genre }: GenreCarouselProps) {
  const styles = useThemedStyles(makeStyles);
  const play = usePlayerStore((s) => s.play);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const openTrackOptions = useSheetStore((s) => s.openTrackOptions);

  const [tracks, setTracks] = useState<Track[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const { isLoading, error } = useAsyncData(
    async (signal) => {
      const result = await api.getTracksByPrimaryGenrePaged(genre, 0, PAGE_SIZE, { signal });
      const valid = result.items.filter((t) => isValidGenreForSection(t, genre));
      setTracks(valid);
      setPage(0);
      setHasMore(result.hasMore);
      return valid;
    },
    [genre],
    `No pudimos cargar ${GENRE_LABEL[genre]}.`,
  );

  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    try {
      const nextPage = page + 1;
      const result = await api.getTracksByPrimaryGenrePaged(genre, nextPage, PAGE_SIZE);
      const valid = result.items.filter((t) => isValidGenreForSection(t, genre));
      setTracks((prev) => [...prev, ...valid]);
      setPage(nextPage);
      setHasMore(result.hasMore);
    } catch (err) {
      if (!isAbortError(err)) console.error('[GenreCarousel] Error al paginar:', err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [genre, page, hasMore, isLoadingMore]);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Skeleton width={140} height={20} style={styles.skeletonTitle} />
        <Skeleton width="100%" height={150} borderRadius={12} />
      </View>
    );
  }

  // Sección individual sin datos o con error: se omite en silencio en vez de
  // congelar toda la pantalla de Inicio por un género sin contenido todavía.
  if (error || tracks.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{GENRE_LABEL[genre]}</Text>
      <FlashList
        data={tracks}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        // FlashList (no FlatList) es el estándar del proyecto: se auto-ajusta
        // sin `initialNumToRender`/`maxToRenderPerBatch` — esas props son de
        // FlatList y no existen en FlashList v2 (falla en tiempo de compilación).
        onEndReachedThreshold={0.5}
        onEndReached={loadMore}
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
              onPress={() => openTrackOptions(item)}
              onPlayPress={() => play(item, tracks)}
              onOptionsPress={() => openTrackOptions(item)}
            />
          </View>
        )}
        ListFooterComponent={
          isLoadingMore ? (
            <View style={styles.item}>
              <Skeleton width={150} height={150} borderRadius={12} />
            </View>
          ) : null
        }
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
