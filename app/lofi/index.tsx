import { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { Image } from 'expo-image';
import { FlashList } from '@shopify/flash-list';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../src/services';
import { useAsyncData, useAudioPlayer } from '../../src/hooks';
import { EmptyState, Skeleton, MiniPlayer } from '../../src/components';
import type { Track, SleepTimerDuration } from '../../src/types';
import { useTheme, useThemedStyles, spacing, radius, typography, motion, layout, type Theme } from '../../src/theme';
import { formatDuration, shuffle } from '../../src/utils';

const LOFI_GENRE = 'Lo-Fi';
const SLEEP_TIMER_OPTIONS: SleepTimerDuration[] = [15, 30, 45, 60];

/**
 * Módulo de reproductor y catálogo Lo-Fi.
 *
 * Reutiliza el motor de audio existente al 100 % (`useAudioPlayer`,
 * `playerStore`, reproducción en segundo plano ya configurada) — lo único
 * propio de este módulo es la estética minimalista y el catálogo Lo-Fi.
 */
export default function LofiScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const { currentTrack, isPlaying, sleepTimer, play, togglePlayPause, startSleepTimer, cancelSleepTimer } =
    useAudioPlayer();

  const {
    data: tracks,
    isLoading,
    error,
    refresh,
  } = useAsyncData<Track[]>((signal) => api.getTracksByGenre(LOFI_GENRE, { signal }), [], 'No pudimos cargar el catálogo Lo-Fi.');

  const [isShuffleQueued, setIsShuffleQueued] = useState(false);
  const heroTrack = useMemo(() => tracks?.[0], [tracks]);

  const isLofiPlaying = isPlaying && Boolean(tracks?.some((t) => t.id === currentTrack?.id));

  const handlePlayAll = async (mode: 'ordered' | 'shuffled') => {
    if (!tracks || tracks.length === 0) return;
    if (isLofiPlaying) {
      togglePlayPause();
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setIsShuffleQueued(mode === 'shuffled');
    const orderedQueue = mode === 'shuffled' ? shuffle(tracks) : tracks;
    await play(orderedQueue[0] as Track, orderedQueue);
    setIsShuffleQueued(false);
  };

  const handleTrackPress = (track: Track) => {
    if (!tracks) return;
    Haptics.selectionAsync().catch(() => {});
    play(track, tracks);
  };

  const handleSleepTimerPress = () => {
    if (sleepTimer.isActive) {
      Alert.alert('Temporizador de apagado', `Se pausará en ${sleepTimer.minutesRemaining} min.`, [
        { text: 'Cancelar temporizador', style: 'destructive', onPress: cancelSleepTimer },
        { text: 'Cerrar', style: 'cancel' },
      ]);
      return;
    }
    Alert.alert('Apagar en…', 'Ideal para dormir escuchando Lo-Fi', [
      ...SLEEP_TIMER_OPTIONS.map((minutes) => ({ text: `${minutes} min`, onPress: () => startSleepTimer(minutes) })),
      { text: 'Cancelar', style: 'cancel' as const },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        {heroTrack && (
          <>
            <Image source={heroTrack.coverUrl} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={2} />
            <BlurView intensity={30} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
          </>
        )}
        <LinearGradient
          colors={[colors.overlay.scrimStrong, colors.surface[50]]}
          style={StyleSheet.absoluteFill}
        />

        <Pressable
          onPress={() => router.back()}
          style={[styles.backButton, { top: insets.top + spacing.sm }]}
          accessibilityRole="button"
          accessibilityLabel="Volver"
        >
          <Ionicons name="chevron-back" size={24} color={colors.text.primary} />
        </Pressable>

        <Pressable
          onPress={handleSleepTimerPress}
          style={[styles.sleepButton, { top: insets.top + spacing.sm }]}
          accessibilityRole="button"
          accessibilityLabel="Temporizador de apagado"
        >
          <Ionicons name="moon" size={16} color={sleepTimer.isActive ? colors.brand[500] : colors.text.primary} />
          {sleepTimer.isActive && <Text style={styles.sleepButtonText}>{sleepTimer.minutesRemaining} min</Text>}
        </Pressable>

        <View style={styles.heroContent}>
          <Text style={styles.eyebrow}>Lo-Fi</Text>
          <Text style={styles.heroTitle}>Beats para enfocarte</Text>
          <Text style={styles.heroSubtitle}>Ritmos suaves, sin letra, para estudiar, trabajar o dormir</Text>

          <View style={styles.heroActions}>
            <Pressable
              onPress={() => handlePlayAll('ordered')}
              disabled={isLoading || !tracks?.length}
              style={styles.playAllButton}
              accessibilityRole="button"
              accessibilityLabel={isLofiPlaying ? 'Pausar' : 'Reproducir todo'}
            >
              <Ionicons name={isLofiPlaying ? 'pause' : 'play'} size={20} color={colors.text.onBrand} />
              <Text style={styles.playAllText}>{isLofiPlaying ? 'Pausar' : 'Reproducir'}</Text>
            </Pressable>

            <Pressable
              onPress={() => handlePlayAll('shuffled')}
              disabled={isLoading || !tracks?.length}
              style={styles.shuffleButton}
              accessibilityRole="button"
              accessibilityLabel="Reproducir mezclado"
            >
              <Ionicons
                name="shuffle"
                size={20}
                color={colors.text.primary}
                style={isShuffleQueued ? styles.spin : undefined}
              />
            </Pressable>
          </View>
        </View>
      </View>

      <View style={styles.listSection}>
        {isLoading ? (
          <View style={styles.skeletonList}>
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} width="100%" height={56} borderRadius={12} style={styles.skeletonRow} />
            ))}
          </View>
        ) : error || !tracks ? (
          <EmptyState icon="cloud-offline-outline" title="Error" description={error ?? undefined} actionLabel="Reintentar" onAction={refresh} />
        ) : (
          <FlashList
            data={tracks}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item, index }) => {
              const isActive = currentTrack?.id === item.id;
              return (
                <Pressable
                  onPress={() => handleTrackPress(item)}
                  style={({ pressed }) => [styles.trackRow, pressed && styles.trackRowPressed]}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.title}, ${item.artist}`}
                >
                  <Text style={[styles.trackIndex, isActive && styles.trackIndexActive]}>
                    {isActive && isPlaying ? '♪' : index + 1}
                  </Text>
                  <Image
                    source={item.coverUrl}
                    style={styles.trackCover}
                    contentFit="cover"
                    transition={motion.duration.fast}
                    cachePolicy="memory-disk"
                    recyclingKey={item.id}
                  />
                  <View style={styles.trackInfo}>
                    <Text style={[styles.trackTitle, isActive && styles.trackTitleActive]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={styles.trackArtist} numberOfLines={1}>
                      {item.artist}
                    </Text>
                  </View>
                  <Text style={styles.trackDuration}>{formatDuration(item.duration)}</Text>
                </Pressable>
              );
            }}
          />
        )}
      </View>

      {/* Reutiliza el mini reproductor global: transporte completo y acceso
          a la pantalla completa sin duplicar esa lógica aquí. */}
      <MiniPlayer />
    </View>
  );
}

const makeStyles = ({ colors }: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: colors.surface[50],
  },
  hero: {
    height: 300,
    position: 'relative' as const,
    overflow: 'hidden' as const,
    backgroundColor: colors.surface[900],
  },
  backButton: {
    position: 'absolute' as const,
    left: spacing.lg,
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: colors.overlay.glass,
  },
  sleepButton: {
    position: 'absolute' as const,
    right: spacing.lg,
    minWidth: 40,
    height: 40,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.full,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: spacing.xs,
    backgroundColor: colors.overlay.glass,
  },
  sleepButtonText: {
    color: colors.brand[500],
    fontFamily: typography.family.semibold,
    fontSize: typography.size.xs,
  },
  heroContent: {
    flex: 1,
    justifyContent: 'flex-end' as const,
    padding: spacing.lg,
  },
  eyebrow: {
    color: colors.brand[400],
    fontFamily: typography.family.bold,
    fontSize: typography.size.xs,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    marginBottom: spacing.xs,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontFamily: typography.family.bold,
    fontSize: typography.size['3xl'],
    marginBottom: spacing.xs,
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.75)',
    fontFamily: typography.family.regular,
    fontSize: typography.size.sm,
    marginBottom: spacing.lg,
  },
  heroActions: {
    flexDirection: 'row' as const,
    gap: spacing.md,
  },
  playAllButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    backgroundColor: colors.brand[500],
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.full,
  },
  playAllText: {
    color: colors.text.onBrand,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.sm,
  },
  shuffleButton: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: colors.overlay.glass,
  },
  spin: {
    opacity: 0.5,
  },
  listSection: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: layout.miniPlayerHeight + layout.tabBarHeight + spacing.xl,
  },
  skeletonList: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  skeletonRow: {
    marginBottom: spacing.md,
  },
  trackRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  trackRowPressed: {
    opacity: 0.6,
  },
  trackIndex: {
    width: 20,
    textAlign: 'center' as const,
    color: colors.text.muted,
    fontFamily: typography.family.medium,
    fontSize: typography.size.sm,
  },
  trackIndexActive: {
    color: colors.brand[500],
  },
  trackCover: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surface[300],
  },
  trackInfo: {
    flex: 1,
  },
  trackTitle: {
    color: colors.text.primary,
    fontFamily: typography.family.medium,
    fontSize: typography.size.base,
    marginBottom: 2,
  },
  trackTitleActive: {
    color: colors.brand[500],
  },
  trackArtist: {
    color: colors.text.secondary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.sm,
  },
  trackDuration: {
    color: colors.text.muted,
    fontFamily: typography.family.regular,
    fontSize: typography.size.xs,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },
});
