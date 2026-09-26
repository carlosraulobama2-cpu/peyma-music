import { useMemo, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useLibraryStore, usePlayerStore } from '../../store';
import { api } from '../../services';
import type { HomeFeed } from '../../services';
import { useTheme, useThemedStyles, spacing, radius, typography, motion, type Theme } from '../../theme';
import type { Track } from '../../types';

interface QuickAccessTile {
  id: string;
  title: string;
  coverUrl: string;
  kind: 'resume' | 'track' | 'playlist';
  track?: Track;
  trackId?: string;
  playlistId?: string;
  progressRatio?: number;
}

const GRID_SIZE = 6;

interface QuickAccessGridProps {
  /**
   * Accesos rápidos curados por el servidor (playlists reales del usuario +
   * lo escuchado recientemente en cualquier dispositivo, ver `GET /home`).
   * Si no llegó todavía (o falló), la rejilla se completa con lo que haya
   * en el store local, igual que antes.
   */
  quickAccess?: HomeFeed['quickAccess'];
}

/**
 * Rejilla 2×3 con lo último que el usuario tocó — igual que la fila de
 * arriba de Spotify Home. "Continuar escuchando" es siempre local (depende
 * de la posición exacta en ESTE teléfono), pero las playlists y lo
 * reproducido recientemente vienen del servidor cuando están disponibles,
 * así lo que decide un curador desde el panel también se ve acá, no sólo
 * en la web.
 */
export function QuickAccessGrid({ quickAccess }: QuickAccessGridProps) {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const resumePoints = useLibraryStore((s) => s.getRecentResumePoints(3));
  const recentlyPlayed = useLibraryStore((s) => s.recentlyPlayed);
  const playlists = useLibraryStore((s) => s.playlists);
  const play = usePlayerStore((s) => s.play);
  const [loadingTrackId, setLoadingTrackId] = useState<string | null>(null);

  const tiles = useMemo<QuickAccessTile[]>(() => {
    const seen = new Set<string>();
    const items: QuickAccessTile[] = [];

    // "Continuar escuchando" primero: es lo más accionable de la rejilla.
    for (const point of resumePoints) {
      if (seen.has(point.track.id) || items.length >= GRID_SIZE) continue;
      seen.add(point.track.id);
      items.push({
        id: `resume-${point.track.id}`,
        title: point.track.title,
        coverUrl: point.track.coverUrl,
        kind: 'resume',
        track: point.track,
        progressRatio: point.positionSeconds / point.durationSeconds,
      });
    }

    if (quickAccess) {
      for (const entry of quickAccess) {
        if (items.length >= GRID_SIZE || seen.has(entry.id)) continue;
        seen.add(entry.id);
        items.push(
          entry.kind === 'playlist'
            ? { id: `playlist-${entry.id}`, title: entry.title, coverUrl: entry.coverUrl ?? '', kind: 'playlist', playlistId: entry.id }
            : { id: `track-${entry.id}`, title: entry.title, coverUrl: entry.coverUrl ?? '', kind: 'track', trackId: entry.id },
        );
      }
    } else {
      // Sin respuesta del servidor todavía (o la petición falló): se rellena
      // con lo que ya había en el teléfono, para no dejar la rejilla vacía.
      for (const playlist of playlists) {
        if (items.length >= GRID_SIZE) break;
        items.push({ id: `playlist-${playlist.id}`, title: playlist.title, coverUrl: playlist.coverUrl, kind: 'playlist', playlistId: playlist.id });
      }
      for (const track of recentlyPlayed) {
        if (items.length >= GRID_SIZE || seen.has(track.id)) continue;
        seen.add(track.id);
        items.push({ id: `track-${track.id}`, title: track.title, coverUrl: track.coverUrl, kind: 'track', track });
      }
    }

    return items.slice(0, GRID_SIZE);
  }, [resumePoints, playlists, recentlyPlayed, quickAccess]);

  if (tiles.length === 0) return null;

  const handlePress = (tile: QuickAccessTile) => {
    Haptics.selectionAsync().catch(() => {});
    if (tile.kind === 'playlist' && tile.playlistId) {
      router.push(`/playlist/${tile.playlistId}`);
      return;
    }
    if (tile.kind === 'resume' && tile.track) {
      // Continuar exactamente donde quedó: se reanuda y luego se busca la posición guardada.
      play(tile.track, [tile.track]).then(() => {
        const point = resumePoints.find((p) => p.track.id === tile.track!.id);
        if (point) usePlayerStore.getState().seekTo(point.positionSeconds);
      });
      return;
    }
    if (tile.kind === 'track' && tile.track) {
      play(tile.track, recentlyPlayed);
      return;
    }
    if (tile.kind === 'track' && tile.trackId) {
      // Vino del servidor sin la pista completa (sólo id/título/carátula):
      // se busca al tocarla, no al cargar la rejilla entera.
      setLoadingTrackId(tile.trackId);
      api
        .getTrackById(tile.trackId)
        .then((track) => {
          if (track) play(track, [track]);
        })
        .finally(() => setLoadingTrackId(null));
    }
  };

  return (
    <View style={styles.grid}>
      {tiles.map((tile) => (
        <Pressable
          key={tile.id}
          onPress={() => handlePress(tile)}
          style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
          accessibilityRole="button"
          accessibilityLabel={tile.kind === 'resume' ? `Continuar ${tile.title}` : tile.title}
        >
          <Image source={tile.coverUrl} style={styles.tileCover} contentFit="cover" transition={motion.duration.fast} cachePolicy="memory-disk" />
          <Text style={styles.tileTitle} numberOfLines={2}>
            {tile.title}
          </Text>
          {tile.kind === 'resume' && (
            <View style={styles.resumeBadge}>
              <Ionicons name="play" size={10} color={colors.text.onBrand} />
            </View>
          )}
          {tile.trackId && loadingTrackId === tile.trackId && (
            <View style={styles.resumeBadge}>
              <Ionicons name="ellipsis-horizontal" size={10} color={colors.text.onBrand} />
            </View>
          )}
        </Pressable>
      ))}
    </View>
  );
}

const makeStyles = ({ colors }: Theme) => ({
  grid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
    gap: spacing.sm,
  },
  tile: {
    width: '48%' as const,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: colors.surface[200],
    borderRadius: radius.sm,
    overflow: 'hidden' as const,
    height: 56,
  },
  tilePressed: {
    backgroundColor: colors.surface[300],
  },
  tileCover: {
    width: 56,
    height: 56,
    backgroundColor: colors.surface[300],
  },
  tileTitle: {
    flex: 1,
    color: colors.text.primary,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.xs,
    paddingHorizontal: spacing.sm,
  },
  resumeBadge: {
    width: 24,
    height: 24,
    borderRadius: radius.full,
    marginRight: spacing.sm,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: colors.brand[500],
  },
});
