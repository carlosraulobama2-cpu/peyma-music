import { useCallback, useEffect, useState } from 'react';
import { View, Text, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useThemedStyles, motion, type Theme } from '../theme';
import { clamp, formatDuration } from '../utils';

interface ProgressBarProps {
  /** Segundos. */
  progress: number;
  duration: number;
  onSeek: (positionSeconds: number) => void;
  showLabels?: boolean;
}

const THUMB_SIZE = 14;
const TRACK_HEIGHT = 4;
const EXPANDED_TRACK_HEIGHT = 6;

/** Barra de progreso arrastrable, con feedback háptico y crecimiento al tocar. */
export function ProgressBar({ progress, duration, onSeek, showLabels = true }: ProgressBarProps) {
  const styles = useThemedStyles(makeStyles);
  const [trackWidth, setTrackWidth] = useState(0);
  const isScrubbing = useSharedValue(false);
  const scrubRatio = useSharedValue(0);
  const trackHeight = useSharedValue(TRACK_HEIGHT);

  const safeDuration = duration > 0 ? duration : 1;
  const liveRatio = clamp(progress / safeDuration, 0, 1);
  const displayRatio = useSharedValue(liveRatio);

  useEffect(() => {
    if (!isScrubbing.value) displayRatio.value = liveRatio;
  }, [liveRatio, isScrubbing, displayRatio]);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width);
  }, []);

  const commitSeek = useCallback(
    (ratio: number) => {
      onSeek(clamp(ratio, 0, 1) * safeDuration);
    },
    [onSeek, safeDuration],
  );

  const pan = Gesture.Pan()
    .onBegin((event) => {
      isScrubbing.value = true;
      trackHeight.value = withSpring(EXPANDED_TRACK_HEIGHT, motion.spring.snappy);
      if (trackWidth > 0) scrubRatio.value = clamp(event.x / trackWidth, 0, 1);
      runOnJS(Haptics.selectionAsync)();
    })
    .onUpdate((event) => {
      if (trackWidth > 0) scrubRatio.value = clamp(event.x / trackWidth, 0, 1);
    })
    .onFinalize(() => {
      trackHeight.value = withSpring(TRACK_HEIGHT, motion.spring.snappy);
      runOnJS(commitSeek)(scrubRatio.value);
      isScrubbing.value = false;
    });

  const fillStyle = useAnimatedStyle(() => ({
    width: `${(isScrubbing.value ? scrubRatio.value : displayRatio.value) * 100}%`,
    height: trackHeight.value,
  }));

  const trackStyle = useAnimatedStyle(() => ({ height: trackHeight.value }));

  const thumbStyle = useAnimatedStyle(() => ({
    left: `${(isScrubbing.value ? scrubRatio.value : displayRatio.value) * 100}%`,
    transform: [{ scale: isScrubbing.value ? 1.3 : 1 }],
  }));

  return (
    <View style={styles.container}>
      <GestureDetector gesture={pan}>
        <View
          onLayout={handleLayout}
          hitSlop={{ top: 12, bottom: 12 }}
          style={styles.hitArea}
          accessibilityRole="adjustable"
          accessibilityLabel="Progreso de la canción"
          accessibilityValue={{ min: 0, max: Math.round(safeDuration), now: Math.round(progress) }}
        >
          <Animated.View style={[styles.trackBackground, trackStyle]}>
            <Animated.View style={[styles.trackFill, fillStyle]} />
          </Animated.View>
          <Animated.View style={[styles.thumb, thumbStyle]} />
        </View>
      </GestureDetector>

      {showLabels && (
        <View style={styles.timeRow}>
          <Text style={styles.timeText}>{formatDuration(progress)}</Text>
          <Text style={styles.timeText}>{formatDuration(duration)}</Text>
        </View>
      )}
    </View>
  );
}

const makeStyles = ({ colors }: Theme) => ({
  container: {
    marginVertical: 4,
  },
  hitArea: {
    justifyContent: 'center' as const,
    paddingVertical: 10,
  },
  trackBackground: {
    backgroundColor: colors.surface[400],
    borderRadius: 4,
    overflow: 'hidden' as const,
  },
  trackFill: {
    backgroundColor: colors.brand[500],
    borderRadius: 4,
  },
  thumb: {
    position: 'absolute' as const,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    marginLeft: -THUMB_SIZE / 2,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: colors.text.primary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
  },
  timeRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    marginTop: 4,
  },
  timeText: {
    color: colors.text.secondary,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },
});
