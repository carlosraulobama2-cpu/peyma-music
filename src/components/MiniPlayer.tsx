import { View, Text, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  FadeInDown,
  FadeOutDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { usePlayerStore } from '../store';
import { useTabBarHeight } from '../hooks/useTabBarHeight';
import { useTheme, useThemedStyles, motion, radius, spacing, typography, type Theme } from '../theme';
import { clamp } from '../utils';

const SWIPE_UP_THRESHOLD = -50;

export function MiniPlayer() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const tabBarHeight = useTabBarHeight();

  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isBuffering = usePlayerStore((s) => s.isBuffering);
  const progress = usePlayerStore((s) => s.progress);
  const duration = usePlayerStore((s) => s.duration);
  const pause = usePlayerStore((s) => s.pause);
  const resume = usePlayerStore((s) => s.resume);
  const remoteDeviceName = usePlayerStore((s) => s.remoteDeviceName);

  const scale = useSharedValue(1);
  const translateY = useSharedValue(0);

  const openPlayer = () => {
    if (!currentTrack) return;
    Haptics.selectionAsync().catch(() => {});
    router.push(`/player/${currentTrack.id}`);
  };

  const swipeUp = Gesture.Pan()
    .onUpdate((event) => {
      translateY.value = Math.min(0, event.translationY);
    })
    .onEnd((event) => {
      if (event.translationY < SWIPE_UP_THRESHOLD) {
        runOnJS(openPlayer)();
      }
      translateY.value = withSpring(0, motion.spring.smooth);
    });

  const togglePlayPause = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (isPlaying) pause();
    else resume();
  };

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateY: translateY.value }],
  }));

  const progressStyle = useAnimatedStyle(() => {
    const ratio = duration > 0 ? clamp(progress / duration, 0, 1) : 0;
    return { width: withTiming(`${ratio * 100}%`, { duration: 250 }) };
  });

  if (!currentTrack) return null;

  return (
    <GestureDetector gesture={swipeUp}>
      <Animated.View
        entering={FadeInDown.springify().damping(18)}
        exiting={FadeOutDown.duration(motion.duration.fast)}
        style={[styles.container, { bottom: tabBarHeight + spacing.sm }, containerStyle]}
      >
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, progressStyle]} />
        </View>

        <Pressable
          onPressIn={() => {
            scale.value = withSpring(0.98, motion.spring.snappy);
          }}
          onPressOut={() => {
            scale.value = withSpring(1, motion.spring.snappy);
          }}
          onPress={openPlayer}
          accessibilityRole="button"
          accessibilityLabel={`Reproduciendo ahora: ${currentTrack.title}, ${currentTrack.artist}`}
          style={styles.touchable}
        >
          <Image
            source={currentTrack.coverUrl}
            style={styles.cover}
            contentFit="cover"
            transition={motion.duration.fast}
            cachePolicy="memory-disk"
          />
          <View style={styles.infoContainer}>
            <Text style={styles.title} numberOfLines={1}>
              {currentTrack.title}
            </Text>
            <Text style={styles.artist} numberOfLines={1}>
              {remoteDeviceName ? `Sonando en ${remoteDeviceName}` : currentTrack.artist}
            </Text>
          </View>
          <Pressable
            onPress={togglePlayPause}
            hitSlop={12}
            disabled={isBuffering}
            accessibilityRole="button"
            accessibilityLabel={isPlaying ? 'Pausar' : 'Reproducir'}
            style={styles.playButton}
          >
            <Ionicons
              name={isBuffering ? 'ellipsis-horizontal' : isPlaying ? 'pause' : 'play'}
              size={24}
              color={colors.text.primary}
            />
          </Pressable>
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
}

const makeStyles = ({ colors }: Theme) => ({
  container: {
    position: 'absolute' as const,
    left: spacing.sm,
    right: spacing.sm,
    height: 64,
    backgroundColor: colors.surface[400],
    borderRadius: radius.md,
    overflow: 'hidden' as const,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  progressTrack: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  progressFill: {
    height: '100%' as const,
    backgroundColor: colors.brand[500],
  },
  touchable: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: spacing.sm,
  },
  cover: {
    width: 48,
    height: 48,
    borderRadius: radius.xs,
    backgroundColor: colors.surface[600],
  },
  infoContainer: {
    flex: 1,
    marginLeft: spacing.md,
    justifyContent: 'center' as const,
  },
  title: {
    color: colors.text.primary,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.sm,
    marginBottom: 2,
  },
  artist: {
    color: colors.text.secondary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.xs,
  },
  playButton: {
    padding: spacing.sm,
  },
});
