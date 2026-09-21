import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../src/services';
import { TrackRow, Skeleton, EmptyState } from '../../src/components';
import type { Track } from '../../src/types';
import { usePlayerStore } from '../../src/store';
import { useAsyncData } from '../../src/hooks';
import { useTheme, useThemedStyles, spacing, typography, layout, radius, type Theme } from '../../src/theme';
import { sumDuration, formatTotalDuration } from '../../src/utils';

export default function AlbumScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const play = usePlayerStore((s) => s.play);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);

  const { data: album, isLoading, error, refresh } = useAsyncData(
    (signal) => api.getAlbumById(id ?? '', { signal }).then((a) => a ?? Promise.reject(new Error('not-found'))),
    [id],
    'No pudimos cargar el álbum.',
  );

  const handleTrackPress = (track: Track) => {
    if (album) play(track, album.tracks);
  };

  const handlePlayAll = () => {
    if (album && album.tracks.length > 0) play(album.tracks[0] as Track, album.tracks);
  };

  const handleArtistPress = () => {
    if (album) router.push(`/artist/${album.artistId}`);
  };

  if (isLoading) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={{ paddingTop: insets.top }}>
        <View style={styles.skeletonHeader}>
          <Skeleton width="100%" height={240} borderRadius={0} />
          <View style={styles.skeletonBody}>
            <Skeleton width="70%" height={28} />
            <Skeleton width="40%" height={16} style={{ marginTop: spacing.sm }} />
          </View>
        </View>
      </ScrollView>
    );
  }

  if (error || !album) {
    return (
      <View style={styles.container}>
        <EmptyState
          icon="musical-notes-outline"
          title="Álbum no encontrado"
          description={error ?? 'Intenta de nuevo más tarde.'}
          actionLabel="Reintentar"
          onAction={refresh}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerImage}>
          <Image source={album.coverUrl} style={[StyleSheet.absoluteFill, styles.headerImageStyle]} contentFit="cover" />
          <View style={styles.headerOverlay} />
          <Pressable
            onPress={() => router.back()}
            style={[styles.backButton, { top: insets.top + spacing.sm }]}
            accessibilityRole="button"
            accessibilityLabel="Volver"
          >
            <Ionicons name="chevron-down" size={26} color={colors.text.primary} />
          </Pressable>
        </View>

        <View style={styles.headerInfo}>
          <Text style={styles.albumTitle} numberOfLines={2}>
            {album.title}
          </Text>
          <Pressable onPress={handleArtistPress} style={styles.artistRow}>
            <Text style={styles.artistName}>{album.artistName}</Text>
          </Pressable>
          <Text style={styles.albumMeta}>
            {album.releaseYear} · {album.tracks.length} canciones · {formatTotalDuration(sumDuration(album.tracks))}
          </Text>
        </View>

        <View style={styles.actionsRow}>
          <Pressable onPress={handlePlayAll} style={styles.playAllButton} accessibilityRole="button" accessibilityLabel="Reproducir álbum">
            <Ionicons name="play" size={18} color={colors.text.onBrand} />
            <Text style={styles.playAllText}>Reproducir</Text>
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>Canciones</Text>

        {album.tracks.length === 0 ? (
          <EmptyState icon="musical-notes-outline" title="Sin canciones" description="Este álbum no tiene canciones aún." />
        ) : (
          <FlashList
            data={album.tracks}
            keyExtractor={(item) => item.id}
            renderItem={({ item, index }) => (
              <TrackRow
                track={item}
                index={index + 1}
                onPress={handleTrackPress}
                isActive={currentTrack?.id === item.id}
                isPlaying={isPlaying}
              />
            )}
            contentContainerStyle={styles.listContent}
            scrollEnabled={false}
          />
        )}
      </ScrollView>
    </View>
  );
}

const makeStyles = ({ colors }: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: colors.surface[50],
  },
  scrollContent: {
    paddingBottom: layout.miniPlayerHeight + spacing.xl,
  },
  headerImage: {
    width: '100%' as const,
    height: 240,
    position: 'relative' as const,
    overflow: 'hidden' as const,
    backgroundColor: colors.surface[300],
  },
  headerImageStyle: {
    opacity: 0.5,
  },
  headerOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.surface[50],
    opacity: 0.35,
  },
  backButton: {
    position: 'absolute' as const,
    left: spacing.lg,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: colors.overlay.scrim,
  },
  headerInfo: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  albumTitle: {
    color: colors.text.primary,
    fontFamily: typography.family.bold,
    fontSize: typography.size['3xl'],
    marginBottom: spacing.sm,
    lineHeight: typography.lineHeight['3xl'],
  },
  artistRow: {
    alignSelf: 'flex-start' as const,
  },
  artistName: {
    color: colors.brand[500],
    fontFamily: typography.family.semibold,
    fontSize: typography.size.base,
  },
  albumMeta: {
    color: colors.text.muted,
    fontFamily: typography.family.regular,
    fontSize: typography.size.xs,
    marginTop: spacing.xs,
  },
  actionsRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing['2xl'],
  },
  playAllButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.full,
    backgroundColor: colors.brand[500],
  },
  playAllText: {
    color: colors.text.onBrand,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.sm,
  },
  sectionTitle: {
    color: colors.text.primary,
    fontFamily: typography.family.bold,
    fontSize: typography.size.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  listContent: {
    paddingBottom: spacing.lg,
  },
  skeletonHeader: {
    gap: spacing.md,
  },
  skeletonBody: {
    paddingHorizontal: spacing.lg,
  },
});
