import { View, Text, Pressable, Share } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Sheet } from './Sheet';
import { ReportTrackSheet } from './ReportTrackSheet';
import { useSheetStore, useLibraryStore, usePlayerStore, toast } from '../store';
import { api } from '../services';
import { useTheme, useThemedStyles, spacing, radius, typography, type Theme } from '../theme';

interface RowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}

function OptionRow({ icon, label, onPress, destructive }: RowProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <Ionicons name={icon} size={22} color={destructive ? colors.semantic.error : colors.text.primary} />
      <Text style={[styles.rowLabel, destructive && { color: colors.semantic.error }]}>{label}</Text>
    </Pressable>
  );
}

/** Menú "···" de una canción: montado una vez en la raíz, abierto desde cualquier pantalla. */
export function TrackOptionsSheet() {
  const router = useRouter();
  /**
   * Pista a denunciar, capturada al abrir.
   *
   * No se puede leer del store: para abrir la hoja de denuncia hay que
   * cerrar este menú, y al cerrarlo `activeTrack` pasa a null. Guardando
   * id y título aquí, la hoja sobrevive al cierre del menú.
   */
  const [reportTarget, setReportTarget] = useState<{ id: string; title: string } | null>(null);
  const styles = useThemedStyles(makeStyles);

  const track = useSheetStore((s) => s.activeTrack);
  const context = useSheetStore((s) => s.context);
  const closeTrackOptions = useSheetStore((s) => s.closeTrackOptions);
  const openAddToPlaylist = useSheetStore((s) => s.openAddToPlaylist);

  const isFavorite = useLibraryStore((s) => (track ? s.isFavorite(track.id) : false));
  const toggleFavorite = useLibraryStore((s) => s.toggleFavorite);
  const isDownloaded = useLibraryStore((s) => (track ? s.isDownloaded(track.id) : false));
  const toggleDownload = useLibraryStore((s) => s.toggleDownload);
  const removeFromPlaylist = useLibraryStore((s) => s.removeFromPlaylist);
  const play = usePlayerStore((s) => s.play);

  const handleStartRadio = async () => {
    if (!track) return;
    closeTrackOptions();
    try {
      const queue = await api.getRadioQueue(track);
      await play(track, queue);
      toast.success(`Reproduciendo radio de "${track.title}"`);
    } catch (error) {
      console.error('[TrackOptionsSheet] Error al iniciar radio:', error);
      toast.error('No pudimos iniciar la radio.');
    }
  };

  const handleShare = async () => {
    if (!track) return;
    try {
      await Share.share({ message: `Escucha "${track.title}" de ${track.artist} en Peyma Music` });
    } catch {
      // El usuario canceló el share sheet; no es un error que reportar.
    }
    closeTrackOptions();
  };

  const handleToggleFavorite = () => {
    if (!track) return;
    toggleFavorite(track);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  const handleToggleDownload = () => {
    if (!track) return;
    toggleDownload(track.id);
    toast.info(isDownloaded ? 'Descarga eliminada' : 'Descargando para escuchar sin conexión');
  };

  const handleViewArtist = () => {
    if (!track) return;
    closeTrackOptions();
    router.push(`/artist/${track.artistId}`);
  };

  const handleViewAlbum = () => {
    if (!track) return;
    closeTrackOptions();
    router.push(`/album/${track.albumId}`);
  };

  const handleRemoveFromPlaylist = () => {
    if (!track || !context.removeFromPlaylistId) return;
    removeFromPlaylist(context.removeFromPlaylistId, track.id);
    toast.info(`"${track.title}" se quitó de la playlist`);
    closeTrackOptions();
  };

  return (
    <>
    <Sheet visible={Boolean(track)} onClose={closeTrackOptions}>
      {track && (
        <>
          <View style={styles.header}>
            <Image source={track.coverUrl} style={styles.cover} contentFit="cover" />
            <View style={styles.headerInfo}>
              <Text style={styles.headerTitle} numberOfLines={1}>{track.title}</Text>
              <Text style={styles.headerArtist} numberOfLines={1}>{track.artist}</Text>
            </View>
          </View>

          <OptionRow
            icon={isFavorite ? 'heart' : 'heart-outline'}
            label={isFavorite ? 'Quitar de tu biblioteca' : 'Añadir a tu biblioteca'}
            onPress={handleToggleFavorite}
          />
          <OptionRow icon="add-circle-outline" label="Añadir a una playlist" onPress={openAddToPlaylist} />
          <OptionRow
            icon={isDownloaded ? 'checkmark-circle' : 'download-outline'}
            label={isDownloaded ? 'Quitar descarga' : 'Descargar'}
            onPress={handleToggleDownload}
          />
          <OptionRow icon="radio-outline" label="Iniciar radio de esta canción" onPress={handleStartRadio} />
          <OptionRow icon="share-outline" label="Compartir" onPress={handleShare} />
          <OptionRow icon="person-outline" label="Ver artista" onPress={handleViewArtist} />
          <OptionRow icon="albums-outline" label="Ver álbum" onPress={handleViewAlbum} />
          {/* Denunciar va al final y en rojo: es una acción con
              consecuencias, no una más de la lista. */}
          <OptionRow
            icon="flag-outline"
            label="Denunciar canción"
            destructive
            onPress={() => {
              setReportTarget({ id: track.id, title: track.title });
              closeTrackOptions();
            }}
          />
          {context.removeFromPlaylistId && (
            <OptionRow
              icon="remove-circle-outline"
              label="Quitar de esta playlist"
              destructive
              onPress={handleRemoveFromPlaylist}
            />
          )}
        </>
      )}
    </Sheet>

    {reportTarget && (
      <ReportTrackSheet
        trackId={reportTarget.id}
        trackTitle={reportTarget.title}
        visible
        onClose={() => setReportTarget(null)}
      />
    )}
    </>
  );
}

const makeStyles = ({ colors }: Theme) => ({
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingBottom: spacing.lg,
    marginBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.surface[300],
  },
  cover: {
    width: 48,
    height: 48,
    borderRadius: radius.xs,
    backgroundColor: colors.surface[300],
  },
  headerInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  headerTitle: {
    color: colors.text.primary,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.base,
    marginBottom: 2,
  },
  headerArtist: {
    color: colors.text.secondary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.sm,
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  rowPressed: {
    backgroundColor: colors.surface[200],
  },
  rowLabel: {
    color: colors.text.primary,
    fontFamily: typography.family.medium,
    fontSize: typography.size.base,
  },
});
