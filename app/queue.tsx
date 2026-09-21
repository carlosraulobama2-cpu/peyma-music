import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePlayerStore } from '../src/store';
import { formatDuration } from '../src/utils';
import { AppBar, EmptyState } from '../src/components';
import type { Track } from '../src/types';
import { useTheme, useThemedStyles, spacing, typography, radius, layout, type Theme } from '../src/theme';

export default function QueueScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const queue = usePlayerStore((s) => s.queue);
  const queueIndex = usePlayerStore((s) => s.queueIndex);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const reorderQueue = usePlayerStore((s) => s.reorderQueue);
  const removeFromQueue = usePlayerStore((s) => s.removeFromQueue);

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    reorderQueue(index, index - 1);
  };

  const handleMoveDown = (index: number) => {
    if (index === queue.length - 1) return;
    reorderQueue(index, index + 1);
  };

  if (queue.length === 0) {
    return (
      <View style={styles.container}>
        <AppBar title="Cola" leftAction={{ icon: 'chevron-down', onPress: () => router.back() }} />
        <EmptyState icon="list-outline" title="La cola está vacía" description="Reproduce algo para verlo aquí." />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AppBar title="Cola" leftAction={{ icon: 'chevron-down', onPress: () => router.back() }} />

      <FlashList
        data={queue}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: insets.bottom + layout.miniPlayerHeight + spacing.xl }}
        renderItem={({ item, index }: { item: Track; index: number }) => {
          const isActive = index === queueIndex;
          return (
            <View style={[styles.trackRow, isActive && styles.trackRowActive]}>
              <View style={styles.trackIndex}>
                {isActive && isPlaying ? (
                  <Ionicons name="volume-medium" size={16} color={colors.brand[500]} />
                ) : (
                  <Text style={[styles.indexText, isActive && styles.indexTextActive]}>{index + 1}</Text>
                )}
              </View>

              <View style={styles.trackInfo}>
                <Text style={[styles.trackTitle, isActive && styles.trackTitleActive]} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.trackArtist} numberOfLines={1}>
                  {item.artist}
                </Text>
              </View>

              <Text style={styles.trackDuration}>{formatDuration(item.duration)}</Text>

              <View style={styles.trackActions}>
                <Pressable
                  onPress={() => handleMoveUp(index)}
                  disabled={index === 0}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel="Mover arriba"
                  style={({ pressed }) => [
                    styles.queueButton,
                    pressed && styles.queueButtonPressed,
                    index === 0 && styles.queueButtonDisabled,
                  ]}
                >
                  <Ionicons name="chevron-up" size={16} color={colors.text.secondary} />
                </Pressable>
                <Pressable
                  onPress={() => handleMoveDown(index)}
                  disabled={index === queue.length - 1}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel="Mover abajo"
                  style={({ pressed }) => [
                    styles.queueButton,
                    pressed && styles.queueButtonPressed,
                    index === queue.length - 1 && styles.queueButtonDisabled,
                  ]}
                >
                  <Ionicons name="chevron-down" size={16} color={colors.text.secondary} />
                </Pressable>
                <Pressable
                  onPress={() => removeFromQueue(index)}
                  disabled={isActive}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel="Quitar de la cola"
                  style={({ pressed }) => [
                    styles.queueButton,
                    pressed && styles.queueButtonPressed,
                    isActive && styles.queueButtonDisabled,
                  ]}
                >
                  <Ionicons name="remove-circle-outline" size={18} color={colors.text.secondary} />
                </Pressable>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const makeStyles = ({ colors }: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: colors.surface[50],
  },
  trackRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  trackRowActive: {
    backgroundColor: colors.surface[200],
  },
  trackIndex: {
    width: 24,
    alignItems: 'center' as const,
  },
  indexText: {
    color: colors.text.secondary,
    fontFamily: typography.family.medium,
    fontSize: typography.size.base,
  },
  indexTextActive: {
    color: colors.brand[500],
  },
  trackInfo: {
    flex: 1,
  },
  trackTitle: {
    color: colors.text.primary,
    fontFamily: typography.family.medium,
    fontSize: typography.size.sm,
    marginBottom: 2,
  },
  trackTitleActive: {
    color: colors.brand[500],
    fontFamily: typography.family.bold,
  },
  trackArtist: {
    color: colors.text.secondary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.xs,
  },
  trackDuration: {
    color: colors.text.secondary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.xs,
    marginRight: spacing.sm,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },
  trackActions: {
    flexDirection: 'row' as const,
    gap: 2,
  },
  queueButton: {
    width: 28,
    height: 28,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: radius.full,
  },
  queueButtonPressed: {
    backgroundColor: colors.surface[400],
  },
  queueButtonDisabled: {
    opacity: 0.3,
  },
});
