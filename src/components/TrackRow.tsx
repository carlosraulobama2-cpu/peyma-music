import { View, Text, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import type { Track } from '../types';
import { useSheetStore } from '../store';
import { useTheme, useThemedStyles, motion, radius, spacing, typography, type Theme } from '../theme';
import { formatNumber } from '../utils';

interface TrackRowProps {
  track: Track;
  onPress: (track: Track) => void;
  /** Por defecto el botón "···" abre el menú global de opciones de la canción. */
  onOptionsPress?: (track: Track) => void;
  /** Si la fila vive dentro de una playlist propia, habilita "Quitar de esta playlist" en el menú. */
  removeFromPlaylistId?: string;
  isActive?: boolean;
  isPlaying?: boolean;
  /** Numeración fija (1, 2, 3…) para vistas tipo álbum/playlist. */
  index?: number;
}

export function TrackRow({
  track,
  onPress,
  onOptionsPress,
  removeFromPlaylistId,
  isActive,
  isPlaying,
  index,
}: TrackRowProps) {
  const { colors } = useTheme();
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);
  const openTrackOptions = useSheetStore((s) => s.openTrackOptions);

  const handlePress = () => {
    Haptics.selectionAsync().catch(() => {});
    onPress(track);
  };

  const handleOptionsPress = () => {
    Haptics.selectionAsync().catch(() => {});
    if (onOptionsPress) {
      onOptionsPress(track);
    } else {
      openTrackOptions(track, removeFromPlaylistId ? { removeFromPlaylistId } : undefined);
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`${track.title}, ${track.artist}`}
      style={({ pressed }) => [styles.container, pressed && styles.containerPressed]}
    >
      {index !== undefined && (
        <View style={styles.indexContainer}>
          {isActive && isPlaying ? (
            <Ionicons name="volume-medium" size={16} color={colors.brand[500]} />
          ) : (
            <Text style={[styles.indexText, isActive && styles.indexTextActive]}>{index}</Text>
          )}
        </View>
      )}

      <Image
        source={track.coverUrl}
        style={styles.cover}
        contentFit="cover"
        transition={motion.duration.fast}
        cachePolicy="memory-disk"
      />

      <View style={styles.info}>
        <Text style={[styles.title, isActive && styles.titleActive]} numberOfLines={1}>
          {track.title}
        </Text>
        <View style={styles.subtitleRow}>
          {/* El nombre del artista lleva a su perfil. `stopPropagation` es
              imprescindible: sin él, el Pressable de la fila entera captura
              el toque y en vez de ir al artista empieza a sonar la canción. */}
          <Pressable
            onPress={(event) => {
              event.stopPropagation();
              router.push(`/artist/${track.artistId}`);
            }}
            hitSlop={8}
            accessibilityRole="link"
            accessibilityLabel={`Ver el perfil de ${track.artist}`}
          >
            <Text style={styles.artist} numberOfLines={1}>
              {track.artist}
            </Text>
          </Pressable>
          {/* Ritmo de la canción, cuando el catálogo lo tiene. */}
          {track.primaryGenre ? <Text style={styles.genre}>· {track.primaryGenre}</Text> : null}
          {/* Reproducciones, al estilo de Spotify. Se comprueba `undefined` y
              no un valor falsy: una canción con 0 reproducciones debe mostrar
              el 0, que es información, y no desaparecer como si no se supiera. */}
          {track.playCount !== undefined ? (
            <Text style={styles.plays} numberOfLines={1}>
              · {formatNumber(track.playCount)} repr.
            </Text>
          ) : null}
        </View>
      </View>

      {track.isLiked && (
        <Ionicons name="heart" size={16} color={colors.brand[500]} style={styles.likeIcon} />
      )}

      <Pressable
        onPress={handleOptionsPress}
        hitSlop={16}
        accessibilityRole="button"
        accessibilityLabel="Más opciones"
        style={styles.optionsButton}
      >
        <Ionicons name="ellipsis-vertical" size={20} color={colors.text.secondary} />
      </Pressable>
    </Pressable>
  );
}

const makeStyles = ({ colors }: Theme) => ({
  container: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
  },
  containerPressed: {
    backgroundColor: colors.surface[200],
  },
  indexContainer: {
    width: 24,
    alignItems: 'center' as const,
    marginRight: spacing.sm,
  },
  indexText: {
    color: colors.text.secondary,
    fontFamily: typography.family.medium,
    fontSize: typography.size.sm,
  },
  indexTextActive: {
    color: colors.brand[500],
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
  titleActive: {
    color: colors.brand[500],
  },
  subtitleRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
  },
  plays: {
    color: colors.text.muted,
    fontFamily: typography.family.regular,
    fontSize: typography.size.xs,
  },
  genre: {
    color: colors.text.secondary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.xs,
  },
  artist: {
    color: colors.text.secondary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.sm,
  },
  likeIcon: {
    marginHorizontal: spacing.sm,
  },
  optionsButton: {
    padding: spacing.sm,
  },
});
