import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { api } from '../../services';
import { useAsyncData } from '../../hooks';
import { usePlayerStore, useLibraryStore } from '../../store';
import { Skeleton } from '../Skeleton';
import type { Track } from '../../types';
import { useTheme, useThemedStyles, spacing, radius, typography, motion, type Theme } from '../../theme';

/** Tarjeta héroe para el artista destacado del momento (`Artist.isFeatured`). */
export function FeaturedArtistBanner() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const play = usePlayerStore((s) => s.play);
  const toggleFollowArtist = useLibraryStore((s) => s.toggleFollowArtist);

  const { data: artist, isLoading } = useAsyncData((signal) => api.getFeaturedArtist({ signal }), []);
  const { data: topTracks } = useAsyncData(
    (signal) => (artist ? api.getArtistTracks(artist.id, { signal }) : Promise.resolve([] as Track[])),
    [artist?.id],
  );
  const isFollowing = useLibraryStore((s) => (artist ? s.isFollowingArtist(artist.id) : false));

  if (isLoading) {
    return <Skeleton width="100%" height={220} borderRadius={16} style={styles.skeletonWrapper} />;
  }
  if (!artist) return null;

  const topTrack = topTracks?.[0];

  const handlePlayTopTrack = () => {
    if (!topTrack) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    play(topTrack, topTracks ?? [topTrack]);
  };

  const handleToggleFollow = () => {
    Haptics.selectionAsync().catch(() => {});
    toggleFollowArtist(artist.id);
  };

  return (
    <Animated.View entering={FadeInUp.duration(motion.duration.slow).springify().damping(16)} style={styles.wrapper}>
      <Pressable onPress={() => router.push(`/artist/${artist.id}`)} style={styles.card} accessibilityRole="button" accessibilityLabel={`Descubre a ${artist.name}`}>
        <Image source={artist.imageUrl} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={8} />
        <LinearGradient colors={['transparent', colors.overlay.scrimStrong]} style={StyleSheet.absoluteFill} />

        <View style={styles.eyebrowRow}>
          <Text style={styles.eyebrow}>Descubre a este artista</Text>
        </View>

        <View style={styles.content}>
          <Image source={artist.imageUrl} style={styles.avatar} contentFit="cover" />
          <View style={styles.info}>
            <Text style={styles.name} numberOfLines={1}>{artist.name}</Text>
            {artist.bio && (
              <Text style={styles.bio} numberOfLines={2}>{artist.bio}</Text>
            )}
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable
            onPress={handlePlayTopTrack}
            disabled={!topTrack}
            style={styles.playButton}
            accessibilityRole="button"
            accessibilityLabel="Reproducir su canción más popular"
          >
            <Ionicons name="play" size={16} color={colors.text.onBrand} style={styles.playIcon} />
            <Text style={styles.playText}>Top track</Text>
          </Pressable>

          <Pressable
            onPress={handleToggleFollow}
            style={[styles.followButton, isFollowing && styles.followButtonActive]}
            accessibilityRole="button"
            accessibilityLabel={isFollowing ? 'Dejar de seguir' : 'Seguir'}
          >
            <Text style={styles.followText}>{isFollowing ? 'Siguiendo' : 'Seguir'}</Text>
          </Pressable>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const makeStyles = ({ colors }: Theme) => ({
  wrapper: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
  },
  skeletonWrapper: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.xl,
  },
  card: {
    height: 220,
    borderRadius: radius.xl,
    overflow: 'hidden' as const,
    padding: spacing.lg,
    justifyContent: 'space-between' as const,
    backgroundColor: colors.surface[300],
  },
  eyebrowRow: {
    alignSelf: 'flex-start' as const,
  },
  eyebrow: {
    color: colors.brand[400],
    fontFamily: typography.family.bold,
    fontSize: typography.size.xs,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
  },
  content: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.md,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surface[400],
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  info: {
    flex: 1,
  },
  name: {
    color: '#FFFFFF',
    fontFamily: typography.family.bold,
    fontSize: typography.size.xl,
    marginBottom: 2,
  },
  bio: {
    color: 'rgba(255,255,255,0.8)',
    fontFamily: typography.family.regular,
    fontSize: typography.size.xs,
  },
  actions: {
    flexDirection: 'row' as const,
    gap: spacing.sm,
  },
  playButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: colors.brand[500],
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  playIcon: {
    marginRight: spacing.xs,
  },
  playText: {
    color: colors.text.onBrand,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.sm,
  },
  followButton: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  followButtonActive: {
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  followText: {
    color: '#FFFFFF',
    fontFamily: typography.family.semibold,
    fontSize: typography.size.sm,
  },
});
