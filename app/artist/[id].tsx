import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { api } from '../../src/services';
import { TrackRow, Skeleton, EmptyState } from '../../src/components';
import type { Track, Artist } from '../../src/types';
import { usePlayerStore, useLibraryStore } from '../../src/store';
import { useAsyncData } from '../../src/hooks';
import { useTheme, useThemedStyles, spacing, typography, layout, radius, type Theme } from '../../src/theme';
import { formatNumber } from '../../src/utils';

interface ArtistData {
  artist: Artist;
  tracks: Track[];
}

export default function ArtistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const play = usePlayerStore((s) => s.play);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isFollowing = useLibraryStore((s) => s.isFollowingArtist(id ?? ''));
  const toggleFollowArtist = useLibraryStore((s) => s.toggleFollowArtist);

  const { data, isLoading, error, refresh } = useAsyncData<ArtistData>(
    async (signal) => {
      const [artist, tracks] = await Promise.all([
        api.getArtistById(id ?? '', { signal }),
        api.getArtistTracks(id ?? '', { signal }),
      ]);
      if (!artist) throw new Error('not-found');
      return { artist, tracks };
    },
    [id],
    'No pudimos cargar el artista.',
  );

  const handleTrackPress = (track: Track) => {
    if (data) play(track, data.tracks);
  };

  const handlePlayAll = () => {
    if (data && data.tracks.length > 0) play(data.tracks[0] as Track, data.tracks);
  };

  const handleToggleFollow = () => {
    if (!id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    toggleFollowArtist(id);
  };

  if (isLoading) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={{ paddingTop: insets.top + spacing.xl }}>
        <View style={styles.skeletonHeader}>
          <Skeleton width={160} height={160} borderRadius={80} />
          <Skeleton width={140} height={24} style={styles.skeletonName} />
        </View>
      </ScrollView>
    );
  }

  if (error || !data) {
    return (
      <View style={styles.container}>
        <EmptyState
          icon="person-outline"
          title="Artista no encontrado"
          description={error ?? 'Intenta de nuevo más tarde.'}
          actionLabel="Reintentar"
          onAction={refresh}
        />
      </View>
    );
  }

  const { artist, tracks } = data;

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerImage}>
          <Image source={artist.imageUrl} style={StyleSheet.absoluteFill} contentFit="cover" />
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
          {/* El check sólo se muestra si un administrador lo otorgó desde el
              panel (Artist.isVerified); no es decoración para todos. */}
          {artist.isVerified && (
            <View style={styles.verifiedRow}>
              <Ionicons name="checkmark-circle" size={16} color="#3d91f4" />
              <Text style={styles.verifiedLabel}>Artista verificado</Text>
            </View>
          )}
          <Text style={styles.artistName} numberOfLines={1}>
            {artist.name}
          </Text>
          <Text style={styles.listenerCount}>{formatNumber(artist.monthlyListeners)} oyentes mensuales</Text>

          <Pressable
            onPress={handleToggleFollow}
            accessibilityRole="button"
            accessibilityLabel={isFollowing ? 'Dejar de seguir' : 'Seguir'}
            accessibilityState={{ selected: isFollowing }}
            style={[styles.followButton, isFollowing && styles.followButtonActive]}
          >
            <Text style={styles.followButtonText}>{isFollowing ? 'Siguiendo' : 'Seguir'}</Text>
          </Pressable>

          {artist.genres.length > 0 && (
            <View style={styles.genresContainer}>
              {artist.genres.map((genre) => (
                <View key={genre} style={styles.genreBadge}>
                  <Text style={styles.genreText}>{genre}</Text>
                </View>
              ))}
            </View>
          )}
          {artist.bio && (
            <Text style={styles.bioText} numberOfLines={4}>
              {artist.bio}
            </Text>
          )}
        </View>

        <View style={styles.actionsRow}>
          <Pressable
            onPress={handlePlayAll}
            style={styles.playButton}
            accessibilityRole="button"
            accessibilityLabel="Reproducir canciones populares"
          >
            <Ionicons name="play" size={22} color={colors.text.onBrand} style={styles.playIconOffset} />
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>Popular</Text>

        {tracks.length === 0 ? (
          <EmptyState icon="musical-notes-outline" title="Sin canciones" description="Este artista no tiene canciones disponibles." />
        ) : (
          <FlashList
            data={tracks}
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
    height: 260,
    position: 'relative' as const,
    overflow: 'hidden' as const,
    backgroundColor: colors.surface[300],
  },
  headerOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.surface[50],
    opacity: 0.25,
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
    alignItems: 'center' as const,
  },
  verifiedRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    marginBottom: 6,
  },
  verifiedLabel: {
    color: colors.text.secondary,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.sm,
  },
  artistName: {
    color: colors.text.primary,
    fontFamily: typography.family.bold,
    fontSize: typography.size['3xl'],
    marginBottom: spacing.xs,
    lineHeight: typography.lineHeight['3xl'],
  },
  listenerCount: {
    color: colors.text.secondary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.sm,
    marginBottom: spacing.md,
  },
  followButton: {
    borderWidth: 1,
    borderColor: colors.surface[500],
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm - 2,
    borderRadius: radius.full,
    marginBottom: spacing.md,
  },
  followButtonActive: {
    borderColor: colors.text.primary,
  },
  followButtonText: {
    color: colors.text.primary,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.sm,
  },
  genresContainer: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    justifyContent: 'center' as const,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  genreBadge: {
    backgroundColor: colors.surface[300],
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.lg,
  },
  genreText: {
    color: colors.text.secondary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.xs,
  },
  bioText: {
    color: colors.text.secondary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.sm,
    textAlign: 'center' as const,
    marginTop: spacing.sm,
    lineHeight: typography.lineHeight.sm,
  },
  actionsRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing['2xl'],
  },
  playButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: colors.brand[500],
  },
  playIconOffset: {
    marginLeft: 3,
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
    alignItems: 'center' as const,
    gap: spacing.md,
  },
  skeletonName: {
    marginTop: spacing.xs,
  },
});
