import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, Dimensions, ScrollView, Alert, type LayoutChangeEvent } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { usePlayerStore, useLibraryStore, useSheetStore } from '../../src/store';
import { useAudioPlayer } from '../../src/hooks';
import { api, isRadioTrack } from '../../src/services';
import type { SleepTimerDuration, Track } from '../../src/types';
import { useTheme, useThemedStyles, spacing, typography, motion, type Theme } from '../../src/theme';
import { ProgressBar, AppBar, EmptyState } from '../../src/components';
import { clamp } from '../../src/utils';

const SLEEP_TIMER_OPTIONS: SleepTimerDuration[] = [15, 30, 45, 60];

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const COVER_SIZE = Math.min(SCREEN_WIDTH - 64, 360);

export default function PlayerFullScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const {
    currentTrack,
    isPlaying,
    isBuffering,
    progress,
    duration,
    isShuffled,
    repeatMode,
    volume,
    playbackError,
    sleepTimer,
    togglePlayPause,
    next,
    previous,
    seekTo,
    setVolume,
    startSleepTimer,
    cancelSleepTimer,
    dismissPlaybackError,
  } = useAudioPlayer();

  // Crossfade es un extra propio de Peyma, no parte del contrato genérico
  // de `PlayerState` — se lee directo del store, sin pasar por la fachada.
  const isCrossfadeEnabled = usePlayerStore((s) => s.isCrossfadeEnabled);
  const toggleCrossfade = usePlayerStore((s) => s.toggleCrossfade);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);
  const toggleRepeat = usePlayerStore((s) => s.toggleRepeat);

  const isFavorite = useLibraryStore((s) => s.isFavorite);
  const toggleFavorite = useLibraryStore((s) => s.toggleFavorite);
  const openTrackOptions = useSheetStore((s) => s.openTrackOptions);

  /**
   * Compositor/productor/sello/ISRC sólo vienen en el detalle completo de
   * la pista (`GET /tracks/:id`); los listados (Inicio, playlists) los
   * omiten para no cargar de más una respuesta que ya reparte cientos de
   * pistas. Se piden acá, aparte, la primera vez que se abre esta pantalla
   * para esa canción — antes la app ni los pedía ni los mostraba, aunque el
   * backend y la web sí los tienen.
   */
  const [trackCredits, setTrackCredits] = useState<Track | null>(null);
  useEffect(() => {
    // Una estación de radio no tiene ficha en `GET /tracks/:id` — no es una
    // pista del catálogo, es una URL de un tercero.
    if (!currentTrack || isRadioTrack(currentTrack)) return;
    let cancelled = false;
    api.getTrackById(currentTrack.id).then((track) => {
      if (!cancelled && track) setTrackCredits(track);
    });
    return () => {
      cancelled = true;
    };
  }, [currentTrack]);

  // Créditos de la pista anterior mientras llega la nueva respuesta: se
  // descartan comparando el id en vez de resetear el estado desde el
  // efecto, que dispararía un render en cascada.
  const currentTrackCredits = trackCredits?.id === currentTrack?.id ? trackCredits : null;

  const [volumeTrackWidth, setVolumeTrackWidth] = useState(0);
  const heartScale = useSharedValue(1);
  const heartStyle = useAnimatedStyle(() => ({ transform: [{ scale: heartScale.value }] }));

  const handleVolumeLayout = useCallback((event: LayoutChangeEvent) => {
    setVolumeTrackWidth(event.nativeEvent.layout.width);
  }, []);

  const handleSleepTimerPress = () => {
    if (sleepTimer.isActive) {
      Alert.alert('Temporizador de apagado', `Se pausará en ${sleepTimer.minutesRemaining} min.`, [
        { text: 'Cancelar temporizador', style: 'destructive', onPress: cancelSleepTimer },
        { text: 'Cerrar', style: 'cancel' },
      ]);
      return;
    }
    Alert.alert(
      'Apagar la música en…',
      undefined,
      [
        ...SLEEP_TIMER_OPTIONS.map((minutes) => ({
          text: `${minutes} min`,
          onPress: () => startSleepTimer(minutes),
        })),
        { text: 'Cancelar', style: 'cancel' as const },
      ],
    );
  };

  if (!currentTrack) {
    return (
      <View style={styles.container}>
        <AppBar title="Reproduciendo" leftAction={{ icon: 'chevron-down', onPress: () => router.back() }} />
        <EmptyState
          icon="musical-notes-outline"
          title="No hay canción seleccionada"
          description="Elige algo para reproducir desde el inicio o la biblioteca."
        />
      </View>
    );
  }

  const isLiked = isFavorite(currentTrack.id);

  const handleLike = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    heartScale.value = withSpring(1.3, motion.spring.bouncy, () => {
      heartScale.value = withSpring(1, motion.spring.bouncy);
    });
    toggleFavorite(currentTrack);
  };

  const handleTogglePlayPause = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    togglePlayPause();
  };

  /** Sólo lista las filas que existen de verdad, igual que el modal de créditos de la web. */
  const handleShowCredits = () => {
    if (!currentTrack) return;
    const rows: [string, string | undefined][] = [
      ['Interpretada por', currentTrack.artist],
      ['Compuesta por', currentTrackCredits?.composer],
      ['Producida por', currentTrackCredits?.producer],
      ['Sello', currentTrackCredits?.label],
      ['Álbum', currentTrack.album],
      ['ISRC', currentTrackCredits?.isrc],
    ];
    const present = rows.filter(([, value]) => Boolean(value));
    const body =
      present.map(([label, value]) => `${label}: ${value}`).join('\n') +
      (present.length <= 2 ? '\n\nEsta pista todavía no tiene créditos completos cargados.' : '');
    Alert.alert('Créditos', body);
  };

  const volumePan = Gesture.Pan()
    .onUpdate((event) => {
      if (volumeTrackWidth <= 0) return;
      setVolume(clamp(event.x / volumeTrackWidth, 0, 1));
    })
    .onBegin((event) => {
      if (volumeTrackWidth <= 0) return;
      setVolume(clamp(event.x / volumeTrackWidth, 0, 1));
    });

  return (
    <View style={styles.container}>
      <AppBar
        title="Reproduciendo"
        leftAction={{ icon: 'chevron-down', onPress: () => router.back(), accessibilityLabel: 'Cerrar' }}
        rightActions={[
          { icon: 'ellipsis-horizontal', onPress: () => openTrackOptions(currentTrack), accessibilityLabel: 'Más opciones' },
        ]}
      />

      {playbackError && (
        <View style={styles.errorBanner}>
          <Ionicons name="cloud-offline-outline" size={18} color={colors.semantic.error} />
          <Text style={styles.errorBannerText}>{playbackError}</Text>
          <Pressable onPress={dismissPlaybackError} hitSlop={12} accessibilityRole="button" accessibilityLabel="Cerrar aviso">
            <Ionicons name="close" size={18} color={colors.text.secondary} />
          </Pressable>
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.coverContainer}>
          <Image
            source={currentTrack.coverUrl}
            style={styles.coverImage}
            contentFit="cover"
            transition={motion.duration.slow}
          />
        </View>

        <View style={styles.infoContainer}>
          <View style={styles.titleContainer}>
            <View style={styles.titleRow}>
              <Text style={styles.title} numberOfLines={1}>
                {currentTrack.title}
              </Text>
              {currentTrackCredits?.isExplicit && (
                <View style={styles.explicitBadge}>
                  <Text style={styles.explicitBadgeText}>E</Text>
                </View>
              )}
            </View>
            {isRadioTrack(currentTrack) ? (
              <Text style={styles.artist} numberOfLines={1}>
                {currentTrack.artist}
              </Text>
            ) : (
              <Pressable onPress={handleShowCredits} accessibilityRole="button" accessibilityLabel="Ver créditos">
                <Text style={styles.artist} numberOfLines={1}>
                  {currentTrack.artist}
                </Text>
              </Pressable>
            )}
          </View>
          {/* Favoritos es un concepto del catálogo propio — una estación de
              radio de un tercero no tiene una fila que "guardar". */}
          {!isRadioTrack(currentTrack) && (
            <Pressable
              onPress={handleLike}
              hitSlop={20}
              accessibilityRole="button"
              accessibilityLabel={isLiked ? 'Quitar de favoritos' : 'Añadir a favoritos'}
            >
              <Animated.View style={heartStyle}>
                <Ionicons
                  name={isLiked ? 'heart' : 'heart-outline'}
                  size={28}
                  color={isLiked ? colors.brand[500] : colors.text.primary}
                />
              </Animated.View>
            </Pressable>
          )}
        </View>

        {isRadioTrack(currentTrack) ? (
          <View style={styles.liveRow}>
            <View style={styles.liveDot} />
            <Text style={styles.liveLabel}>TRANSMISIÓN EN VIVO</Text>
          </View>
        ) : (
          <ProgressBar progress={progress} duration={duration || currentTrack.duration} onSeek={seekTo} />
        )}

        <View style={styles.controlsContainer}>
          <Pressable
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              toggleShuffle();
            }}
            hitSlop={20}
            accessibilityRole="button"
            accessibilityLabel="Aleatorio"
            accessibilityState={{ selected: isShuffled }}
          >
            <Ionicons name="shuffle" size={26} color={isShuffled ? colors.brand[500] : colors.text.secondary} />
          </Pressable>

          <Pressable
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              previous();
            }}
            hitSlop={20}
            accessibilityRole="button"
            accessibilityLabel="Anterior"
          >
            <Ionicons name="play-skip-back" size={36} color={colors.text.primary} />
          </Pressable>

          <Pressable
            onPress={handleTogglePlayPause}
            disabled={isBuffering}
            style={styles.playButton}
            accessibilityRole="button"
            accessibilityLabel={isBuffering ? 'Cargando' : isPlaying ? 'Pausar' : 'Reproducir'}
          >
            {isBuffering ? (
              <Ionicons name="ellipsis-horizontal" size={32} color={colors.surface[0]} />
            ) : (
              <Ionicons
                name={isPlaying ? 'pause' : 'play'}
                size={36}
                color={colors.surface[0]}
                style={isPlaying ? undefined : styles.playIconOffset}
              />
            )}
          </Pressable>

          <Pressable
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              next();
            }}
            hitSlop={20}
            accessibilityRole="button"
            accessibilityLabel="Siguiente"
          >
            <Ionicons name="play-skip-forward" size={36} color={colors.text.primary} />
          </Pressable>

          <Pressable
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              toggleRepeat();
            }}
            hitSlop={20}
            accessibilityRole="button"
            accessibilityLabel="Repetir"
            accessibilityState={{ selected: repeatMode !== 'off' }}
            style={styles.repeatButton}
          >
            <Ionicons
              name={repeatMode === 'off' ? 'repeat-outline' : 'repeat'}
              size={26}
              color={repeatMode !== 'off' ? colors.brand[500] : colors.text.secondary}
            />
            {repeatMode === 'track' && (
              <View style={styles.repeatBadge}>
                <Text style={styles.repeatBadgeText}>1</Text>
              </View>
            )}
          </Pressable>
        </View>

        <View style={styles.bottomControls}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              toggleCrossfade();
            }}
            accessibilityRole="switch"
            accessibilityState={{ checked: isCrossfadeEnabled }}
            style={styles.crossfadeToggle}
          >
            <Ionicons
              name={isCrossfadeEnabled ? 'musical-note' : 'musical-note-outline'}
              size={18}
              color={isCrossfadeEnabled ? colors.brand[500] : colors.text.secondary}
            />
            <Text style={[styles.crossfadeLabel, isCrossfadeEnabled && { color: colors.brand[500] }]}>
              Crossfade {isCrossfadeEnabled ? 'activado' : 'desactivado'}
            </Text>
          </Pressable>

          <View style={styles.volumeRow}>
            <Ionicons name="volume-low-outline" size={18} color={colors.text.secondary} />
            <GestureDetector gesture={volumePan}>
              <View onLayout={handleVolumeLayout} style={styles.volumeTrack} hitSlop={{ top: 10, bottom: 10 }}>
                <View style={[styles.volumeFill, { width: `${volume * 100}%` }]} />
              </View>
            </GestureDetector>
            <Ionicons name="volume-high-outline" size={18} color={colors.text.secondary} />
          </View>

          <View style={styles.bottomRowSplit}>
            <Pressable
              onPress={handleSleepTimerPress}
              style={styles.sleepTimerButton}
              accessibilityRole="button"
              accessibilityLabel="Temporizador de apagado"
            >
              <Ionicons name="moon-outline" size={18} color={sleepTimer.isActive ? colors.brand[500] : colors.text.secondary} />
              <Text style={[styles.queueLabel, sleepTimer.isActive ? { color: colors.brand[500] } : null]}>
                {sleepTimer.isActive ? `${sleepTimer.minutesRemaining} min` : 'Apagar en…'}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => router.push('/queue')}
              style={styles.queueButton}
              accessibilityRole="button"
              accessibilityLabel="Ver cola de reproducción"
            >
              <Ionicons name="list-outline" size={18} color={colors.text.secondary} />
              <Text style={styles.queueLabel}>Ver cola</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const makeStyles = ({ colors }: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: colors.surface[0],
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing['4xl'],
  },
  errorBanner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 10,
    backgroundColor: colors.surface[200],
  },
  errorBannerText: {
    flex: 1,
    color: colors.text.primary,
    fontFamily: typography.family.medium,
    fontSize: typography.size.xs,
  },
  coverContainer: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginTop: spacing.md,
    marginBottom: spacing['2xl'],
  },
  coverImage: {
    width: COVER_SIZE,
    height: COVER_SIZE,
    borderRadius: 16,
    backgroundColor: colors.surface[300],
  },
  infoContainer: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.xs,
  },
  titleContainer: {
    flex: 1,
    paddingRight: spacing.lg,
  },
  titleRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.xs,
  },
  title: {
    color: colors.text.primary,
    fontFamily: typography.family.bold,
    fontSize: typography.size.xl,
    marginBottom: spacing.xs,
    flexShrink: 1,
  },
  explicitBadge: {
    backgroundColor: colors.surface[300],
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
    marginBottom: spacing.xs,
  },
  explicitBadgeText: {
    color: colors.text.primary,
    fontFamily: typography.family.bold,
    fontSize: 10,
  },
  artist: {
    color: colors.text.secondary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.base,
  },
  liveRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: spacing.sm,
    marginVertical: spacing.lg,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF5A5A',
  },
  liveLabel: {
    color: colors.text.secondary,
    fontFamily: typography.family.bold,
    fontSize: typography.size.xs,
    letterSpacing: 1.5,
  },
  repeatButton: {
    position: 'relative' as const,
  },
  repeatBadge: {
    position: 'absolute' as const,
    top: -6,
    right: -6,
    backgroundColor: colors.brand[500],
    width: 15,
    height: 15,
    borderRadius: 8,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  repeatBadgeText: {
    color: colors.text.onBrand,
    fontFamily: typography.family.bold,
    fontSize: 9,
  },
  controlsContainer: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingHorizontal: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing['2xl'],
  },
  playButton: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.text.primary,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  playIconOffset: {
    marginLeft: 4,
  },
  bottomControls: {
    gap: spacing.lg,
  },
  crossfadeToggle: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
  },
  crossfadeLabel: {
    color: colors.text.secondary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.sm,
  },
  volumeRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.md,
  },
  volumeTrack: {
    flex: 1,
    height: 32,
    justifyContent: 'center' as const,
  },
  volumeFill: {
    height: 4,
    backgroundColor: colors.text.primary,
    borderRadius: 2,
  },
  bottomRowSplit: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
  },
  sleepTimerButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
  },
  queueButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
  },
  queueLabel: {
    color: colors.text.secondary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.sm,
  },
});
