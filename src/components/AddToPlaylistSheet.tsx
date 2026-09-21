import { useState } from 'react';
import { View, Text, Pressable, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Sheet } from './Sheet';
import { useSheetStore, useLibraryStore, toast } from '../store';
import { useTheme, useThemedStyles, spacing, radius, typography, type Theme } from '../theme';

/** Sub-sheet apilado sobre `TrackOptionsSheet`: elegir/crear playlist para la canción activa. */
export function AddToPlaylistSheet() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const track = useSheetStore((s) => s.activeTrack);
  const isOpen = useSheetStore((s) => s.isAddToPlaylistOpen);
  const closeAddToPlaylist = useSheetStore((s) => s.closeAddToPlaylist);
  const closeTrackOptions = useSheetStore((s) => s.closeTrackOptions);

  const playlists = useLibraryStore((s) => s.playlists);
  const addToPlaylist = useLibraryStore((s) => s.addToPlaylist);
  const createPlaylist = useLibraryStore((s) => s.createPlaylist);

  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  const handleAdd = (playlistId: string, playlistTitle: string) => {
    if (!track) return;
    const alreadyHasTrack = playlists
      .find((p) => p.id === playlistId)
      ?.tracks.some((t) => t.id === track.id);

    if (alreadyHasTrack) {
      toast.info(`Ya estaba en "${playlistTitle}"`);
    } else {
      addToPlaylist(playlistId, track);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast.success(`Se añadió a "${playlistTitle}"`);
    }
    closeAddToPlaylist();
    closeTrackOptions();
  };

  const handleCreateAndAdd = async () => {
    if (!track) return;
    const title = newTitle.trim() || 'Playlist nueva';
    let playlist;
    try {
      // Se espera al servidor: es él quien asigna el id con el que se navega
      // y al que se le añade la canción justo después.
      playlist = await createPlaylist(title);
    } catch {
      toast.error('No se pudo crear la playlist.');
      return;
    }
    addToPlaylist(playlist.id, track);
    setNewTitle('');
    setIsCreating(false);
    closeAddToPlaylist();
    closeTrackOptions();
    toast.success(`Se creó "${title}" con esta canción`);
    router.push(`/playlist/${playlist.id}`);
  };

  return (
    <Sheet visible={isOpen} onClose={closeAddToPlaylist} style={styles.sheet}>
      <Text style={styles.title}>Añadir a playlist</Text>

      {isCreating ? (
        <View style={styles.createRow}>
          <TextInput
            style={styles.input}
            placeholder="Nombre de la playlist"
            placeholderTextColor={colors.text.muted}
            value={newTitle}
            onChangeText={setNewTitle}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => void handleCreateAndAdd()}
          />
          <Pressable onPress={() => void handleCreateAndAdd()} style={styles.createConfirm} accessibilityRole="button" accessibilityLabel="Crear playlist">
            <Ionicons name="checkmark" size={20} color={colors.text.onBrand} />
          </Pressable>
        </View>
      ) : (
        <Pressable
          onPress={() => setIsCreating(true)}
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          accessibilityRole="button"
        >
          <View style={styles.newPlaylistIcon}>
            <Ionicons name="add" size={20} color={colors.text.onBrand} />
          </View>
          <Text style={styles.rowLabel}>Nueva playlist</Text>
        </Pressable>
      )}

      <View style={styles.list}>
        {playlists.length === 0 && !isCreating && (
          <Text style={styles.emptyText}>Aún no tienes playlists propias.</Text>
        )}
        {playlists.map((playlist) => {
          const hasTrack = track ? playlist.tracks.some((t) => t.id === track.id) : false;
          return (
            <Pressable
              key={playlist.id}
              onPress={() => handleAdd(playlist.id, playlist.title)}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              accessibilityRole="button"
            >
              <View style={styles.playlistIcon}>
                <Ionicons name="musical-notes" size={18} color={colors.text.secondary} />
              </View>
              <Text style={styles.rowLabel} numberOfLines={1}>{playlist.title}</Text>
              {hasTrack && <Ionicons name="checkmark-circle" size={20} color={colors.brand[500]} />}
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}

const makeStyles = ({ colors }: Theme) => ({
  sheet: {
    maxHeight: '75%' as const,
  },
  title: {
    color: colors.text.primary,
    fontFamily: typography.family.bold,
    fontSize: typography.size.lg,
    marginBottom: spacing.lg,
  },
  list: {
    gap: 2,
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
    flex: 1,
    color: colors.text.primary,
    fontFamily: typography.family.medium,
    fontSize: typography.size.base,
  },
  newPlaylistIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: colors.brand[500],
  },
  playlistIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: colors.surface[300],
  },
  emptyText: {
    color: colors.text.secondary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.sm,
    paddingVertical: spacing.md,
  },
  createRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  input: {
    flex: 1,
    height: 44,
    backgroundColor: colors.surface[200],
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    color: colors.text.primary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.base,
  },
  createConfirm: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: colors.brand[500],
  },
});
