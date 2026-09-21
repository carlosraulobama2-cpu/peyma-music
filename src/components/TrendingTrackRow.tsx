import { View, Text, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { TrendingTrack } from '../types';
import { useTheme, useThemedStyles, motion, radius, spacing, typography, type Theme } from '../theme';
import { formatNumber } from '../utils';

interface TrendingTrackRowProps {
  track: TrendingTrack;
  onPress: (track: TrendingTrack) => void;
}

export function TrendingTrackRow({ track, onPress }: TrendingTrackRowProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const handlePress = () => {
    Haptics.selectionAsync().catch(() => {});
    onPress(track);
  };

  const trend =
    track.rank < track.previousRank
      ? { icon: 'caret-up' as const, color: colors.semantic.success }
      : track.rank > track.previousRank
        ? { icon: 'caret-down' as const, color: colors.semantic.error }
        : { icon: 'remove' as const, color: colors.text.secondary };

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`#${track.rank}, ${track.title}, ${track.artist}, ${formatNumber(track.streams)} reproducciones`}
      style={({ pressed }) => [styles.container, pressed && styles.containerPressed]}
    >
      <View style={styles.rankContainer}>
        <Text style={styles.rankText}>{track.rank}</Text>
        <Ionicons name={trend.icon} size={14} color={trend.color} style={styles.trendIcon} />
      </View>

      <Image
        source={track.coverUrl}
        style={styles.cover}
        contentFit="cover"
        transition={motion.duration.fast}
        cachePolicy="memory-disk"
      />

      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>
          {track.title}
        </Text>
        <Text style={styles.artist} numberOfLines={1}>
          {track.artist}
        </Text>
      </View>

      <Text style={styles.streamsText}>{formatNumber(track.streams)}</Text>
    </Pressable>
  );
}

const makeStyles = ({ colors }: Theme) => ({
  container: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  containerPressed: {
    backgroundColor: colors.surface[200],
  },
  rankContainer: {
    width: 32,
    alignItems: 'center' as const,
    marginRight: spacing.sm,
  },
  rankText: {
    color: colors.text.primary,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.base,
  },
  trendIcon: {
    marginTop: 2,
  },
  cover: {
    width: 48,
    height: 48,
    borderRadius: radius.xs,
    backgroundColor: colors.surface[300],
  },
  info: {
    flex: 1,
    marginLeft: spacing.md,
    justifyContent: 'center' as const,
  },
  title: {
    color: colors.text.primary,
    fontFamily: typography.family.medium,
    fontSize: typography.size.base,
    marginBottom: 3,
  },
  artist: {
    color: colors.text.secondary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.sm,
  },
  streamsText: {
    marginLeft: spacing.sm,
    color: colors.text.secondary,
    fontFamily: typography.family.medium,
    fontSize: typography.size.xs,
  },
});
