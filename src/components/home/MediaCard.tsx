import { memo, useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import type { MediaKind } from '../../types/music';
import { useTheme, useThemedStyles, radius, spacing, typography, motion, type Theme } from '../../theme';

const CARD_WIDTH = 150;

export interface MediaCardProps {
  kind: MediaKind;
  id: string;
  title: string;
  subtitle?: string;
  coverUrl: string;
  /** Avatar circular (artistas) en vez de carátula cuadrada. */
  isCircular?: boolean;
  /**
   * Color dominante de la portada, si el servidor ya lo calculó.
   *
   * Se pinta como fondo mientras la imagen carga. No es BlurHash — sería un
   * color sólido, no una miniatura difuminada — pero evita el recuadro gris
   * y hace que la transición sea casi imperceptible, que es el 90 % del
   * beneficio a coste cero: el color ya viene en la respuesta.
   */
  dominantColor?: string | null;
  /** 0–1 — dibuja una barra de progreso sobre la carátula ("Continuar escuchando"). */
  progressRatio?: number;
  /** La canción/álbum/playlist que representa esta tarjeta está sonando ahora mismo. */
  isActive?: boolean;
  isPlaying?: boolean;
  onPress: () => void;
  /** Botón de play flotante — inicia la reproducción sin navegar al detalle. */
  onPlayPress?: () => void;
  onOptionsPress?: () => void;
  style?: { width?: number };
}

/**
 * Tarjeta de medio unificada — la usan `QuickAccessGrid`, `GenreCarousel`,
 * `ForYouSection` y `NewReleasesSection`, para que canciones, álbumes,
 * playlists y artistas se vean y se comporten igual en toda la pantalla de
 * Inicio. `React.memo` con comparador propio: sólo vuelve a renderizar si
 * cambia el ítem o si cambió si *esta* tarjeta en particular es la activa —
 * no cuando cambia el progreso de reproducción de otra tarjeta distinta.
 */
function MediaCardBase({
  kind,
  title,
  subtitle,
  coverUrl,
  isCircular,
  dominantColor,
  progressRatio,
  isActive,
  isPlaying,
  onPress,
  onPlayPress,
  onOptionsPress,
  style,
}: MediaCardProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const scale = useSharedValue(1);
  const [imageFailed, setImageFailed] = useState(false);

  const handlePress = () => {
    Haptics.selectionAsync().catch(() => {});
    onPress();
  };

  const handlePlayPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onPlayPress?.();
  };

  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const width = style?.width ?? CARD_WIDTH;

  return (
    <Animated.View style={[{ width }, cardStyle]}>
      <Pressable
        onPress={handlePress}
        // Pulsación larga = el mismo menú que el botón ⋮. Es el gesto que
        // la gente espera en una tarjeta de música, y el botón sigue ahí
        // para quien no lo conozca o use lector de pantalla.
        onLongPress={onOptionsPress}
        delayLongPress={350}
        onPressIn={() => {
          scale.value = withSpring(0.96, motion.spring.snappy);
        }}
        onPressOut={() => {
          scale.value = withSpring(1, motion.spring.snappy);
        }}
        accessibilityRole="button"
        accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
        style={styles.pressable}
      >
        <View style={[styles.coverWrapper, { width, height: width }, isCircular && styles.coverCircular]}>
          {imageFailed ? (
            <View style={[styles.coverFallback, { width, height: width }]}>
              <Ionicons name={kindFallbackIcon(kind)} size={width * 0.32} color={colors.text.muted} />
            </View>
          ) : (
            <Image
              source={coverUrl}
              // El color dominante va DENTRO del array de estilos, no en una
              // segunda prop `style`: dos props iguales en JSX se resuelven
              // quedándose con la última y se perdería el tamaño.
              style={[styles.cover, { width, height: width }, dominantColor ? { backgroundColor: dominantColor } : null]}
              contentFit="cover"
              transition={motion.duration.fast}
              cachePolicy="memory-disk"
              recyclingKey={`${kind}-${title}`}
              onError={() => setImageFailed(true)}
            />
          )}

          {isActive && (
            <View style={styles.activeOverlay}>
              <NowPlayingIndicator playing={Boolean(isPlaying)} />
            </View>
          )}

          {typeof progressRatio === 'number' && (
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.round(progressRatio * 100)}%` }]} />
            </View>
          )}

          {onPlayPress && (
            <Pressable
              onPress={handlePlayPress}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Reproducir ${title}`}
              style={styles.floatingPlay}
            >
              <Ionicons name="play" size={16} color={colors.text.onBrand} style={styles.floatingPlayIcon} />
            </Pressable>
          )}
        </View>

        <View style={styles.textRow}>
          <View style={styles.textColumn}>
            <Text style={[styles.title, isActive && styles.titleActive]} numberOfLines={1}>
              {title}
            </Text>
            {subtitle && (
              <Text style={styles.subtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            )}
          </View>
          {onOptionsPress && (
            <Pressable
              onPress={onOptionsPress}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Más opciones"
              style={styles.optionsButton}
            >
              <Ionicons name="ellipsis-vertical" size={14} color={colors.text.secondary} />
            </Pressable>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

function kindFallbackIcon(kind: MediaKind): keyof typeof Ionicons.glyphMap {
  if (kind === 'artist') return 'person';
  if (kind === 'playlist') return 'list';
  if (kind === 'album') return 'albums';
  return 'musical-note';
}

/** Tres barritas animadas — el mismo lenguaje visual que Spotify usa para "sonando ahora". */
function NowPlayingIndicator({ playing }: { playing: boolean }) {
  const styles = useThemedStyles(makeStyles);
  const bar1 = useBarAnimation(playing, 0);
  const bar2 = useBarAnimation(playing, 120);
  const bar3 = useBarAnimation(playing, 240);

  return (
    <View style={styles.equalizer}>
      <Animated.View style={[styles.equalizerBar, bar1]} />
      <Animated.View style={[styles.equalizerBar, bar2]} />
      <Animated.View style={[styles.equalizerBar, bar3]} />
    </View>
  );
}

function useBarAnimation(playing: boolean, delayMs: number) {
  const height = useSharedValue(6);

  useEffect(() => {
    if (playing) {
      height.value = withRepeat(
        withTiming(16, { duration: 420 + delayMs / 4, easing: Easing.inOut(Easing.sin) }),
        -1,
        true,
      );
    } else {
      height.value = withTiming(4, { duration: motion.duration.fast });
    }
  }, [playing, delayMs, height]);

  return useAnimatedStyle(() => ({ height: height.value }));
}

export const MediaCard = memo(MediaCardBase, (prev, next) => {
  return (
    prev.id === next.id &&
    prev.title === next.title &&
    prev.subtitle === next.subtitle &&
    prev.coverUrl === next.coverUrl &&
    prev.isActive === next.isActive &&
    prev.isPlaying === next.isPlaying &&
    prev.progressRatio === next.progressRatio
  );
});

const makeStyles = ({ colors }: Theme) => ({
  pressable: {
    width: '100%' as const,
  },
  coverWrapper: {
    position: 'relative' as const,
    borderRadius: radius.md,
    overflow: 'hidden' as const,
    backgroundColor: colors.surface[300],
    marginBottom: spacing.sm,
  },
  coverCircular: {
    borderRadius: 9999,
  },
  cover: {
    backgroundColor: colors.surface[300],
  },
  coverFallback: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: colors.surface[300],
  },
  activeOverlay: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.overlay.scrim,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  equalizer: {
    flexDirection: 'row' as const,
    alignItems: 'flex-end' as const,
    gap: 3,
    height: 18,
  },
  equalizerBar: {
    width: 3,
    borderRadius: 2,
    backgroundColor: colors.brand[500],
  },
  progressTrack: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  progressFill: {
    height: '100%' as const,
    backgroundColor: colors.brand[500],
  },
  floatingPlay: {
    position: 'absolute' as const,
    right: spacing.xs,
    bottom: spacing.xs,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: colors.brand[500],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  floatingPlayIcon: {
    marginLeft: 2,
  },
  textRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: spacing.xs,
  },
  textColumn: {
    flex: 1,
  },
  title: {
    color: colors.text.primary,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.sm,
    marginBottom: 2,
  },
  titleActive: {
    color: colors.brand[500],
  },
  subtitle: {
    color: colors.text.secondary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.xs,
  },
  optionsButton: {
    padding: 2,
  },
});
