import { useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { api } from '../../src/services';
import { TrackRow, Skeleton, EmptyState } from '../../src/components';
import type { Track } from '../../src/types';
import { usePlayerStore, useLibraryStore, toast } from '../../src/store';
import { useAsyncData } from '../../src/hooks';
import { useTheme, useThemedStyles, spacing, typography, layout, radius, type Theme } from '../../src/theme';
import { sumDuration, formatTotalDuration } from '../../src/utils';

const LOCAL_OWNER_ID = 'me';

export default function PlaylistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const play = usePlayerStore((s) => s.play);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isFavorite = useLibraryStore((s) => s.isFavorite);
  const toggleFavorite = useLibraryStore((s) => s.toggleFavorite);
  const localPlaylists = useLibraryStore((s) => s.playlists);
  const addToPlaylist = useLibraryStore((s) => s.addToPlaylist);
  const togglePlaylistVisibility = useLibraryStore((s) => s.togglePlaylistVisibility);
  const [isUploading, setIsUploading] = useState(false);

  // Las playlists creadas en el dispositivo viven sólo en libraryStore; el
  // resto viene del catálogo simulado. Se revisa primero lo local para que
  // una playlist recién creada aparezca al instante, sin ida y vuelta a "red".
  const localPlaylist = localPlaylists.find((p) => p.id === id);

  const { data: remotePlaylist, isLoading, error, refresh } = useAsyncData(
    (signal) =>
      localPlaylist
        ? Promise.resolve(localPlaylist)
        : api.getPlaylistById(id ?? '', { signal }).then((p) => p ?? Promise.reject(new Error('not-found'))),
    [id, localPlaylist],
    'No pudimos cargar la playlist.',
  );

  const playlist = localPlaylist ?? remotePlaylist;

  const handleTrackPress = (track: Track) => {
    if (playlist) play(track, playlist.tracks);
  };

  const handlePlayAll = () => {
    if (playlist && playlist.tracks.length > 0) play(playlist.tracks[0] as Track, playlist.tracks);
  };

  const handleUploadTrack = async () => {
    if (!playlist) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) return;

      setIsUploading(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

      const track: Track = {
        id: `upload-${Crypto.randomUUID()}`,
        title: asset.name.replace(/\.[^/.]+$/, ''), // sin la extensión
        artist: 'Subido por ti',
        artistId: LOCAL_OWNER_ID,
        album: playlist.title,
        albumId: playlist.id,
        duration: 0, // se completa al reproducir; ver ProgressBar/useTrackPlayer
        coverUrl: playlist.coverUrl || 'https://picsum.photos/seed/upload/300/300',
        audioUrl: asset.uri,
        isLiked: false,
      };

      addToPlaylist(playlist.id, track);
      toast.success(`"${track.title}" se añadió a la playlist`);
    } catch (error) {
      console.error('[playlist] Error al subir canción:', error);
      toast.error('No pudimos subir esa canción.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleToggleVisibility = () => {
    if (!playlist) return;
    togglePlaylistVisibility(playlist.id);
    toast.info(playlist.isPublic ? 'Playlist ahora es privada' : 'Playlist ahora es pública');
  };

  const handleLikePlaylist = () => {
    if (!playlist) return;
    toggleFavorite({
      id: playlist.id,
      title: playlist.title,
      artist: playlist.ownerName,
      artistId: '',
      album: '',
      albumId: '',
      duration: 0,
      coverUrl: playlist.coverUrl,
      audioUrl: '',
      isLiked: true,
    });
  };

  if (isLoading && !playlist) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={{ paddingTop: insets.top }}>
        <View style={styles.skeletonHeader}>
          <Skeleton width="100%" height={220} borderRadius={0} />
          <View style={styles.skeletonBody}>
            <Skeleton width="70%" height={28} />
          </View>
        </View>
      </ScrollView>
    );
  }

  if ((error && !playlist) || !playlist) {
    return (
      <View style={styles.container}>
        <EmptyState
          icon="list-outline"
          title="Playlist no encontrada"
          description={error ?? 'Intenta de nuevo más tarde.'}
          actionLabel="Reintentar"
          onAction={refresh}
        />
      </View>
    );
  }

  const playlistIsLiked = isFavorite(playlist.id);
  const isOwnedByMe = playlist.ownerId === LOCAL_OWNER_ID;

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerImage}>
          {playlist.coverUrl ? (
            <Image source={playlist.coverUrl} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.headerPlaceholder]}>
              <Ionicons name="musical-notes" size={64} color={colors.text.muted} />
            </View>
          )}
          <View style={styles.headerOverlay} />
          <Pressable
            onPress={() => router.back()}
            style={[styles.backButton, { top: insets.top + spacing.sm }]}
            accessibilityRole="button"
            accessibilityLabel="Volver"
          >
            <Ionicons name="chevron-down" size={26} color={colors.text.primary} />
          </Pressable>
        </View>

        <View style={styles.headerInfo}>
          <Text style={styles.playlistTitle} numberOfLines={2}>
            {playlist.title}
          </Text>
          {playlist.description && (
            <Text style={styles.playlistDescription} numberOfLines={3}>
              {playlist.description}
            </Text>
          )}
          <Text style={styles.ownerText}>
            {playlist.ownerName} · {playlist.tracks.length} canciones
            {playlist.tracks.length > 0 && ` · ${formatTotalDuration(sumDuration(playlist.tracks))}`}
          </Text>
        </View>

        <View style={styles.actionsRow}>
          <Pressable
            onPress={handlePlayAll}
            style={styles.playAllButton}
            accessibilityRole="button"
            accessibilityLabel="Reproducir playlist"
            disabled={playlist.tracks.length === 0}
          >
            <Ionicons name="play" size={18} color={colors.text.onBrand} />
            <Text style={styles.playAllText}>Reproducir</Text>
          </Pressable>

          <Pressable
            onPress={handleLikePlaylist}
            style={styles.likeButton}
            accessibilityRole="button"
            accessibilityLabel={playlistIsLiked ? 'Quitar de favoritos' : 'Añadir a favoritos'}
          >
            <Ionicons
              name={playlistIsLiked ? 'heart' : 'heart-outline'}
              size={20}
              color={playlistIsLiked ? colors.brand[500] : colors.text.primary}
            />
          </Pressable>

          {isOwnedByMe && (
            <>
              <Pressable
                onPress={handleUploadTrack}
                disabled={isUploading}
                style={styles.likeButton}
                accessibilityRole="button"
                accessibilityLabel="Subir una canción desde tu dispositivo"
              >
                <Ionicons
                  name={isUploading ? 'ellipsis-horizontal' : 'add'}
                  size={22}
                  color={colors.text.primary}
                />
              </Pressable>

              <Pressable
                onPress={handleToggleVisibility}
                style={styles.likeButton}
                accessibilityRole="button"
                accessibilityLabel={playlist.isPublic ? 'Hacer playlist privada' : 'Hacer playlist pública'}
              >
                <Ionicons
                  name={playlist.isPublic ? 'globe-outline' : 'lock-closed-outline'}
                  size={20}
                  color={colors.text.primary}
                />
              </Pressable>
            </>
          )}
        </View>

        {isOwnedByMe && (
          <Text style={styles.visibilityHint}>
            {playlist.isPublic ? 'Playlist pública · cualquiera puede verla' : 'Playlist privada · sólo tú la ves'}
          </Text>
        )}

        <Text style={styles.sectionTitle}>Canciones</Text>

        {playlist.tracks.length === 0 ? (
          <EmptyState
            icon="musical-notes-outline"
            title="Playlist vacía"
            description={
              isOwnedByMe
                ? 'Sube canciones desde tu dispositivo para empezar a escuchar.'
                : 'Agrega canciones para empezar a escuchar.'
            }
            actionLabel={isOwnedByMe ? 'Subir canción' : undefined}
            onAction={isOwnedByMe ? handleUploadTrack : undefined}
          />
        ) : (
          <FlashList
            data={playlist.tracks}
            keyExtractor={(item) => item.id}
            renderItem={({ item, index }) => (
              <TrackRow
                track={item}
                index={index + 1}
                onPress={handleTrackPress}
                removeFromPlaylistId={isOwnedByMe ? playlist.id : undefined}
                isActive={currentTrack?.id === item.id}
                isPlaying={isPlaying}
              />
            )}
            contentContainerStyle={styles.listContent}
            scrollEnabled={false}
          />
        )}
      </ScrollView>
    </View>
  );
}

const makeStyles = ({ colors }: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: colors.surface[50],
  },
  scrollContent: {
    paddingBottom: layout.miniPlayerHeight + spacing.xl,
  },
  headerImage: {
    width: '100%' as const,
    height: 220,
    position: 'relative' as const,
    overflow: 'hidden' as const,
    backgroundColor: colors.surface[300],
  },
  headerPlaceholder: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: colors.surface[300],
  },
  headerOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.surface[50],
    opacity: 0.3,
  },
  backButton: {
    position: 'absolute' as const,
    left: spacing.lg,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: colors.overlay.scrim,
  },
  headerInfo: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  playlistTitle: {
    color: colors.text.primary,
    fontFamily: typography.family.bold,
    fontSize: typography.size['3xl'],
    marginBottom: spacing.sm,
    lineHeight: typography.lineHeight['3xl'],
  },
  playlistDescription: {
    color: colors.text.secondary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.sm,
  },
  ownerText: {
    color: colors.text.muted,
    fontFamily: typography.family.regular,
    fontSize: typography.size.xs,
    marginTop: spacing.xs,
  },
  actionsRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  visibilityHint: {
    color: colors.text.muted,
    fontFamily: typography.family.regular,
    fontSize: typography.size.xs,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing['2xl'],
  },
  playAllButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.full,
    backgroundColor: colors.brand[500],
  },
  playAllText: {
    color: colors.text.onBrand,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.sm,
  },
  likeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: colors.surface[300],
  },
  sectionTitle: {
    color: colors.text.primary,
    fontFamily: typography.family.bold,
    fontSize: typography.size.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  listContent: {
    paddingBottom: spacing.lg,
  },
  skeletonHeader: {
    gap: spacing.md,
  },
  skeletonBody: {
    paddingHorizontal: spacing.lg,
  },
});
