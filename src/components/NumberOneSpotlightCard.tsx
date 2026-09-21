import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInUp } from 'react-native-reanimated';
import type { TrendingTrack } from '../types';
import { useTheme, useThemedStyles, motion, radius, spacing, typography, type Theme } from '../theme';
import { formatNumber } from '../utils';

interface NumberOneSpotlightCardProps {
  track: TrendingTrack;
  onPress: (track: TrendingTrack) => void;
  onPlay: (track: TrendingTrack) => void;
}

/** Tarjeta destacada del #1 del chart: portada de fondo desenfocada + gradiente de lectura. */
export function NumberOneSpotlightCard({ track, onPress, onPlay }: NumberOneSpotlightCardProps) {
  const { colors, isDark } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const handlePress = () => {
    Haptics.selectionAsync().catch(() => {});
    onPress(track);
  };

  const handlePlay = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onPlay(track);
  };

  return (
    <Animated.View entering={FadeInUp.duration(motion.duration.slow).springify().damping(16)}>
      <Pressable
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={`Número 1: ${track.title} de ${track.artist}`}
        style={styles.card}
      >
        <Image source={track.coverUrl} style={styles.backgroundImage} contentFit="cover" />
        <BlurView intensity={55} tint={isDark ? 'dark' : 'light'} style={styles.blur} />
        <LinearGradient
          colors={['transparent', colors.overlay.scrimStrong]}
          style={styles.gradient}
        />

        <View style={styles.content}>
          <View style={styles.header}>
            <View style={styles.rankBadge}>
              <Text style={styles.rankText}>#1</Text>
            </View>
            <Text style={styles.streamsText}>{formatNumber(track.streams)} reproducciones</Text>
          </View>

          <Image
            source={track.coverUrl}
            style={styles.mainImage}
            contentFit="cover"
            transition={motion.duration.normal}
          />

          <View style={styles.footer}>
            <View style={styles.info}>
              <Text style={styles.title} numberOfLines={2}>
                {track.title}
              </Text>
              <Text style={styles.artist} numberOfLines={1}>
                {track.artist}
              </Text>
            </View>
            <Pressable
              onPress={handlePlay}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Reproducir"
              style={styles.playButton}
            >
              <Ionicons name="play" size={24} color={colors.text.onBrand} style={styles.playIcon} />
            </Pressable>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const makeStyles = ({ colors }: Theme) => ({
  card: {
    width: '100%' as const,
    height: 320,
    borderRadius: radius.xl,
    overflow: 'hidden' as const,
    backgroundColor: colors.surface[300],
  },
  backgroundImage: {
    ...StyleSheet.absoluteFill,
  },
  blur: {
    ...StyleSheet.absoluteFill,
  },
  gradient: {
    ...StyleSheet.absoluteFill,
  },
  content: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: 'space-between' as const,
  },
  header: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
  },
  rankBadge: {
    backgroundColor: colors.brand[500],
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.lg,
  },
  rankText: {
    color: colors.text.onBrand,
    fontFamily: typography.family.bold,
    fontSize: typography.size.sm,
  },
  streamsText: {
    color: '#FFFFFF',
    fontFamily: typography.family.medium,
    fontSize: typography.size.xs,
  },
  mainImage: {
    width: 140,
    height: 140,
    borderRadius: radius.md,
    alignSelf: 'center' as const,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  footer: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'flex-end' as const,
  },
  info: {
    flex: 1,
    paddingRight: spacing.lg,
  },
  title: {
    color: '#FFFFFF',
    fontFamily: typography.family.bold,
    fontSize: typography.size.xl,
    marginBottom: spacing.xs,
  },
  artist: {
    color: 'rgba(255,255,255,0.75)',
    fontFamily: typography.family.medium,
    fontSize: typography.size.base,
  },
  playButton: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.brand[500],
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  playIcon: {
    marginLeft: 3,
  },
});
