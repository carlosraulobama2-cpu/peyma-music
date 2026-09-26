import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, Dimensions, ScrollView, Alert, StyleSheet, type LayoutChangeEvent } from 'react-native';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePlayerStore, useLibraryStore, useSheetStore } from '../../src/store';
import { useAudioPlayer } from '../../src/hooks';
import { api, isRadioTrack } from '../../src/services';
import type { SleepTimerDuration, Track } from '../../src/types';
import { useTheme, useThemedStyles, spacing, typography, motion, radius, type Theme } from '../../src/theme';
import { ProgressBar, EmptyState } from '../../src/components';
import { clamp } from '../../src/utils';

/**
 * Fondo difuminado de la propia carátula, no un color sólido — la misma
 * idea de Apple Music: nunca hay "el" color de una portada sin analizarla
 * (eso sí exigiría procesar cada pista en el servidor, ver `dominantColor`
 * en `HeroRow`, que sólo existe hoy para la fila Destacado), pero una
 * carátula muy desenfocada YA es ese lavado de color — sin depender de nada
 * que el backend no calcule para toda pista.
 */
const BACKDROP_BLUR = 80;

/**
 * Blanco fijo, no dependiente de `useTheme()` — la pantalla siempre se ve
 * sobre una carátula desenfocada oscurecida, en modo claro u oscuro por
 * igual (mismo criterio que ya usa el hero de Lo-Fi para su propio texto).
 */
const ON_BLUR_PRIMARY = '#FFFFFF';
const ON_BLUR_SECONDARY = 'rgba(255,255,255,0.72)';
const GLASS_BG = 'rgba(255,255,255,0.14)';
/** El botón de play es un círculo blanco sólido (no de cristal) — su ícono necesita contraste al revés del resto de la pantalla. */
const PLAY_ICON_COLOR = '#111111';

const SLEEP_TIMER_OPTIONS: SleepTimerDuration[] = [15, 30, 45, 60];

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const COVER_SIZE = Math.min(SCREEN_WIDTH - 64, 360);

export default function PlayerFullScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
    radioNowPlaying,
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
    // Sin pista no hay carátula que difuminar — se cae al fondo normal del
    // tema en vez de forzar el blanco fijo del resto de esta pantalla, que
    // sólo tiene sentido sobre el lavado de color de una carátula real.
    return (
      <View style={[styles.container, { backgroundColor: colors.surface[0] }]}>
        <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
          <Pressable onPress={() => router.back()} style={styles.headerButton} accessibilityRole="button" accessibilityLabel="Cerrar">
            <Ionicons name="chevron-down" size={22} color={colors.text.primary} />
          </Pressable>
        </View>
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
      {/* Lavado de color: la propia carátula, muy desenfocada, detrás de
          todo — nunca un color sólido fijo. Ver nota de `BACKDROP_BLUR`. */}
      <View style={StyleSheet.absoluteFill}>
        <Image
          source={currentTrack.coverUrl}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          blurRadius={BACKDROP_BLUR}
        />
        <BlurView intensity={70} tint="dark" style={StyleSheet.absoluteFill} />
        <LinearGradient
          colors={['rgba(0,0,0,0.15)', 'rgba(0,0,0,0.55)']}
          style={StyleSheet.absoluteFill}
        />
      </View>

      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} style={styles.headerButton} accessibilityRole="button" accessibilityLabel="Cerrar">
          <Ionicons name="chevron-down" size={22} color={ON_BLUR_PRIMARY} />
        </Pressable>
        <Pressable
          onPress={() => openTrackOptions(currentTrack)}
          style={styles.headerButton}
          accessibilityRole="button"
          accessibilityLabel="Más opciones"
        >
          <Ionicons name="ellipsis-horizontal" size={20} color={ON_BLUR_PRIMARY} />
        </Pressable>
      </View>

      {playbackError && (
        <View style={styles.errorBanner}>
          <Ionicons name="cloud-offline-outline" size={18} color={colors.semantic.error} />
          <Text style={styles.errorBannerText}>{playbackError}</Text>
          <Pressable onPress={dismissPlaybackError} hitSlop={12} accessibilityRole="button" accessibilityLabel="Cerrar aviso">
            <Ionicons name="close" size={18} color={ON_BLUR_SECONDARY} />
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
                  color={isLiked ? colors.brand[500] : ON_BLUR_PRIMARY}
                />
              </Animated.View>
            </Pressable>
          )}
        </View>

        {isRadioTrack(currentTrack) ? (
          <View style={styles.liveRow}>
            <View style={styles.liveDot} />
            <Text style={styles.liveLabel} numberOfLines={1}>
              {radioNowPlaying ? `SONANDO: ${radioNowPlaying.toUpperCase()}` : 'TRANSMISIÓN EN VIVO'}
            </Text>
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
            <Ionicons name="shuffle" size={26} color={isShuffled ? colors.brand[500] : ON_BLUR_SECONDARY} />
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
            <Ionicons name="play-skip-back" size={36} color={ON_BLUR_PRIMARY} />
          </Pressable>

          <Pressable
            onPress={handleTogglePlayPause}
            disabled={isBuffering}
            style={styles.playButton}
            accessibilityRole="button"
            accessibilityLabel={isBuffering ? 'Cargando' : isPlaying ? 'Pausar' : 'Reproducir'}
          >
            {isBuffering ? (
              <Ionicons name="ellipsis-horizontal" size={32} color={PLAY_ICON_COLOR} />
            ) : (
              <Ionicons
                name={isPlaying ? 'pause' : 'play'}
                size={36}
                color={PLAY_ICON_COLOR}
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
            <Ionicons name="play-skip-forward" size={36} color={ON_BLUR_PRIMARY} />
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
              color={repeatMode !== 'off' ? colors.brand[500] : ON_BLUR_SECONDARY}
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
              color={isCrossfadeEnabled ? colors.brand[500] : ON_BLUR_SECONDARY}
            />
            <Text style={[styles.crossfadeLabel, isCrossfadeEnabled && { color: colors.brand[500] }]}>
              Crossfade {isCrossfadeEnabled ? 'activado' : 'desactivado'}
            </Text>
          </Pressable>

          <View style={styles.volumeRow}>
            <Ionicons name="volume-low-outline" size={18} color={ON_BLUR_SECONDARY} />
            <GestureDetector gesture={volumePan}>
              <View onLayout={handleVolumeLayout} style={styles.volumeTrack} hitSlop={{ top: 10, bottom: 10 }}>
                <View style={[styles.volumeFill, { width: `${volume * 100}%` }]} />
              </View>
            </GestureDetector>
            <Ionicons name="volume-high-outline" size={18} color={ON_BLUR_SECONDARY} />
          </View>

          <View style={styles.bottomRowSplit}>
            <Pressable
              onPress={handleSleepTimerPress}
              style={styles.sleepTimerButton}
              accessibilityRole="button"
              accessibilityLabel="Temporizador de apagado"
            >
              <Ionicons name="moon-outline" size={18} color={sleepTimer.isActive ? colors.brand[500] : ON_BLUR_SECONDARY} />
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
              <Ionicons name="list-outline" size={18} color={ON_BLUR_SECONDARY} />
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
    overflow: 'hidden' as const,
    // Sólo se ve si no hay pista (estado vacío, sin carátula que difuminar).
    backgroundColor: '#1a1a1a',
  },
  header: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: GLASS_BG,
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
    backgroundColor: GLASS_BG,
  },
  errorBannerText: {
    flex: 1,
    color: ON_BLUR_PRIMARY,
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
    borderRadius: radius.xl,
    backgroundColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 12,
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
    color: ON_BLUR_PRIMARY,
    fontFamily: typography.family.bold,
    fontSize: typography.size.xl,
    marginBottom: spacing.xs,
    flexShrink: 1,
  },
  explicitBadge: {
    backgroundColor: GLASS_BG,
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
    marginBottom: spacing.xs,
  },
  explicitBadgeText: {
    color: ON_BLUR_PRIMARY,
    fontFamily: typography.family.bold,
    fontSize: 10,
  },
  artist: {
    color: ON_BLUR_SECONDARY,
    fontFamily: typography.family.regular,
    fontSize: typography.size.base,
  },
  liveRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    marginVertical: spacing.lg,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF5A5A',
    flexShrink: 0,
  },
  liveLabel: {
    flexShrink: 1,
    color: ON_BLUR_SECONDARY,
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
    backgroundColor: '#FFFFFF',
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
    color: ON_BLUR_SECONDARY,
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
    backgroundColor: ON_BLUR_PRIMARY,
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
    color: ON_BLUR_SECONDARY,
    fontFamily: typography.family.regular,
    fontSize: typography.size.sm,
  },
});
