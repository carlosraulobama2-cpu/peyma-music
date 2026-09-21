import { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useArtistStore, usePlayerStore } from '../../src/store';
import { EmptyState, MiniBarChart, Button } from '../../src/components';
import { useTheme, useThemedStyles, spacing, typography, radius, layout, type Theme } from '../../src/theme';
import { formatNumber } from '../../src/utils';

export default function StudioScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const profile = useArtistStore((s) => s.profile);
  const stats = useArtistStore((s) => s.stats);
  const releases = useArtistStore((s) => s.releases);
  const refreshStats = useArtistStore((s) => s.refreshStats);
  const play = usePlayerStore((s) => s.play);

  // Se recargan al entrar en la pestaña, no sólo al tirar de la pantalla: son
  // datos que cambian solos (los ponen los oyentes) y el panel se abre para
  // mirarlos. `useFocusEffect` y no `useEffect` porque en una pestaña el
  // componente no se desmonta al cambiar de sección.
  useFocusEffect(
    useCallback(() => {
      void refreshStats();
    }, [refreshStats]),
  );

  const [refreshing, setRefreshing] = useState(false);
  // El spinner dura lo que dura la consulta real. Antes se apagaba con un
  // `setTimeout` fijo porque no había nada que esperar: los números se
  // generaban en el propio teléfono.
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshStats();
    setRefreshing(false);
  }, [refreshStats]);

  // Sólo la ausencia de PERFIL significa "todavía no eres artista". Las
  // métricas llegan del servidor y valen `null` mientras cargan; si se
  // exigieran aquí, un artista con el panel recién abierto vería la pantalla
  // de "convertirme en artista" que ya no le corresponde.
  if (!profile) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <EmptyState
          icon="mic-outline"
          title="Panel de artista"
          description="Convierte tu cuenta en cuenta de artista para publicar canciones y ver tus estadísticas: oyentes, seguidores y reproducciones."
          actionLabel="Convertirme en artista"
          onAction={() => router.push('/studio/become-artist')}
        />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.xl }]}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.brand[500]} />}
    >
      <View style={styles.header}>
        <Image source={profile.imageUrl} style={styles.avatar} contentFit="cover" />
        <View style={styles.headerInfo}>
          <Text style={styles.artistName} numberOfLines={1}>{profile.name}</Text>
          <Text style={styles.artistMeta}>
            {stats ? `${formatNumber(stats.followers)} seguidores` : 'Cargando tus métricas…'}
          </Text>
        </View>
        <Pressable
          onPress={() => router.push('/studio/edit-profile')}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Editar perfil de artista"
          style={styles.editButton}
        >
          <Ionicons name="create-outline" size={20} color={colors.text.primary} />
        </Pressable>
      </View>

      <View style={styles.statsRow}>
        <StatTile label="Oyentes mensuales" value={stats ? formatNumber(stats.monthlyListeners) : '—'} />
        <StatTile label="Seguidores" value={stats ? formatNumber(stats.followers) : '—'} />
        <StatTile label="Reproducciones" value={stats ? formatNumber(stats.totalStreams) : '—'} />
      </View>

      {stats && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Reproducciones · últimos 14 días</Text>
          <MiniBarChart values={stats.streamsLast14Days} />
        </View>
      )}

      {stats && stats.topTracks.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tus canciones más escuchadas</Text>
          {stats.topTracks.map((entry, index) => {
            // El ranking viene en forma plana desde el endpoint de métricas.
            // Para reproducir hace falta la pista completa, que está en los
            // lanzamientos; si aún no se cargaron, la fila se muestra igual
            // pero sin acción, en vez de desaparecer del ranking.
            const playable = releases.find((t) => t.id === entry.trackId);
            return (
              <Pressable
                key={entry.trackId}
                disabled={!playable}
                onPress={() => playable && play(playable, releases)}
                style={({ pressed }) => [styles.trackRow, pressed && playable && styles.trackRowPressed]}
              >
                <Text style={styles.trackRank}>{index + 1}</Text>
                <Image source={entry.coverUrl} style={styles.trackCover} contentFit="cover" />
                <Text style={styles.trackTitle} numberOfLines={1}>{entry.title}</Text>
                <Text style={styles.trackStreams}>{formatNumber(entry.streams)}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <View style={styles.section}>
        <View style={styles.releasesHeader}>
          <Text style={styles.sectionTitle}>Tus lanzamientos</Text>
          <Pressable onPress={() => router.push('/studio/release')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Publicar canción">
            <Ionicons name="add-circle" size={26} color={colors.brand[500]} />
          </Pressable>
        </View>

        {releases.length === 0 ? (
          <Button title="Publicar tu primera canción" onPress={() => router.push('/studio/release')} variant="secondary" fullWidth />
        ) : (
          releases.map((track) => (
            <Pressable
              key={track.id}
              onPress={() => play(track, releases)}
              style={({ pressed }) => [styles.trackRow, pressed && styles.trackRowPressed]}
            >
              <Image source={track.coverUrl} style={styles.trackCover} contentFit="cover" />
              <Text style={styles.trackTitle} numberOfLines={1}>{track.title}</Text>
              <Ionicons name="play-circle-outline" size={22} color={colors.text.secondary} />
            </Pressable>
          ))
        )}
      </View>
    </ScrollView>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.statTile}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const makeStyles = ({ colors }: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: colors.surface[50],
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: layout.miniPlayerHeight + layout.tabBarHeight + spacing.xl,
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginBottom: spacing['2xl'],
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surface[300],
  },
  headerInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  artistName: {
    color: colors.text.primary,
    fontFamily: typography.family.bold,
    fontSize: typography.size.lg,
  },
  artistMeta: {
    color: colors.text.secondary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.sm,
    marginTop: 2,
  },
  editButton: {
    width: 40,
    height: 40,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  statsRow: {
    flexDirection: 'row' as const,
    gap: spacing.sm,
    marginBottom: spacing['2xl'],
  },
  statTile: {
    flex: 1,
    backgroundColor: colors.surface[200],
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  statValue: {
    color: colors.text.primary,
    fontFamily: typography.family.bold,
    fontSize: typography.size.lg,
    marginBottom: 2,
  },
  statLabel: {
    color: colors.text.secondary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.xs,
  },
  section: {
    marginBottom: spacing['2xl'],
  },
  sectionTitle: {
    color: colors.text.primary,
    fontFamily: typography.family.bold,
    fontSize: typography.size.md,
    marginBottom: spacing.md,
  },
  trackRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  trackRowPressed: {
    opacity: 0.7,
  },
  trackRank: {
    width: 18,
    color: colors.text.secondary,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.sm,
  },
  trackCover: {
    width: 40,
    height: 40,
    borderRadius: radius.xs,
    backgroundColor: colors.surface[300],
  },
  trackTitle: {
    flex: 1,
    color: colors.text.primary,
    fontFamily: typography.family.medium,
    fontSize: typography.size.sm,
  },
  trackStreams: {
    color: colors.text.secondary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.xs,
  },
  releasesHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: spacing.md,
  },
});
