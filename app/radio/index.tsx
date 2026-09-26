import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { FlashList } from '@shopify/flash-list';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  searchStations,
  getTopStations,
  registerStationClick,
  logRadioOpen,
  stationToTrack,
  RADIO_TRACK_ID_PREFIX,
  type RadioStation,
} from '../../src/services';
import { useAsyncData, useAudioPlayer } from '../../src/hooks';
import { EmptyState, Skeleton, MiniPlayer } from '../../src/components';
import { useTheme, useThemedStyles, spacing, radius, typography, motion, layout, type Theme } from '../../src/theme';

/**
 * Radio en vivo, vía Radio Browser (radio-browser.info) — base comunitaria
 * y gratuita de estaciones reales de todo el mundo, ver `radioApi.ts`.
 *
 * Es contenido de terceros, distinto del catálogo propio: cada estación
 * transmite lo que decida su dueño, Peyma no la aloja ni la modera. Por eso
 * es una sección aparte y no una fila más de "canciones" — y por lo que la
 * reproducción de una estación no cuenta como escucha para las métricas del
 * panel (ver `playerStore.play`).
 */

const TAGS: { id: string; label: string }[] = [
  { id: '', label: 'Populares' },
  { id: 'pop', label: 'Pop' },
  { id: 'rock', label: 'Rock' },
  { id: 'reggaeton', label: 'Reggaetón' },
  { id: 'latin', label: 'Latina' },
  { id: 'electronic', label: 'Electrónica' },
  { id: 'jazz', label: 'Jazz' },
  { id: 'classical', label: 'Clásica' },
  { id: 'news', label: 'Noticias' },
  { id: 'sports', label: 'Deportes' },
  { id: 'talk', label: 'Talk' },
];

export default function RadioScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const { currentTrack, isPlaying, isBuffering, play, togglePlayPause } = useAudioPlayer();

  const [activeTag, setActiveTag] = useState('');

  useEffect(() => {
    logRadioOpen();
  }, []);

  const {
    data: stations,
    isLoading,
    error,
    refresh,
  } = useAsyncData<RadioStation[]>(
    () => (activeTag ? searchStations({ tag: activeTag }) : getTopStations()),
    [activeTag],
    'No pudimos cargar las radios. Puede que los servidores de Radio Browser estén ocupados — probá de nuevo.',
  );

  const heroStation = useMemo(() => stations?.[0], [stations]);
  const activeStationId = currentTrack?.id.startsWith(RADIO_TRACK_ID_PREFIX)
    ? currentTrack.id.slice(RADIO_TRACK_ID_PREFIX.length)
    : null;

  const handleStationPress = (station: RadioStation) => {
    if (!stations) return;
    Haptics.selectionAsync().catch(() => {});
    if (activeStationId === station.id) {
      togglePlayPause();
      return;
    }
    registerStationClick(station.id);
    play(
      stationToTrack(station),
      stations.map(stationToTrack),
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        {heroStation?.favicon && (
          <Image source={heroStation.favicon} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={35} />
        )}
        <LinearGradient
          colors={isDark ? ['#1a0a2e', '#0A0A0A'] : ['#4a2a7e', colors.surface[50]]}
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

        <View style={styles.heroContent}>
          <View style={styles.eyebrowRow}>
            <View style={styles.liveDot} />
            <Text style={styles.eyebrow}>Radio en vivo</Text>
          </View>
          <Text style={styles.heroTitle}>Miles de emisoras, en directo</Text>
          <Text style={styles.heroSubtitle}>Estaciones reales de todo el mundo, vía Radio Browser</Text>
        </View>
      </View>

      <FlashList
        data={TAGS}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.tagsContent}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              setActiveTag(item.id);
            }}
            style={[styles.tagChip, activeTag === item.id && styles.tagChipActive]}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTag === item.id }}
          >
            <Text style={[styles.tagChipText, activeTag === item.id && styles.tagChipTextActive]}>{item.label}</Text>
          </Pressable>
        )}
      />

      <View style={styles.listSection}>
        {isLoading ? (
          <View style={styles.skeletonList}>
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} width="100%" height={64} borderRadius={12} style={styles.skeletonRow} />
            ))}
          </View>
        ) : error || !stations ? (
          <EmptyState icon="radio-outline" title="No se pudo conectar" description={error ?? undefined} actionLabel="Reintentar" onAction={refresh} />
        ) : stations.length === 0 ? (
          <EmptyState icon="radio-outline" title="Sin estaciones" description="No encontramos emisoras para este género. Probá con otro." />
        ) : (
          <FlashList
            data={stations}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => {
              const isActive = activeStationId === item.id;
              return (
                <Pressable
                  onPress={() => handleStationPress(item)}
                  style={({ pressed }) => [styles.stationRow, pressed && styles.stationRowPressed]}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.name}, radio en vivo`}
                >
                  <Image
                    source={item.favicon ?? `https://picsum.photos/seed/${item.id}/200/200`}
                    style={styles.stationCover}
                    contentFit="cover"
                    transition={motion.duration.fast}
                    cachePolicy="memory-disk"
                    recyclingKey={item.id}
                  />
                  <View style={styles.stationInfo}>
                    <Text style={[styles.stationName, isActive && styles.stationNameActive]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.stationMeta} numberOfLines={1}>
                      {[item.tags[0], item.countryCode, item.bitrate ? `${item.bitrate} kbps` : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                  <View style={styles.playButton}>
                    {isActive && isBuffering ? (
                      <Ionicons name="ellipsis-horizontal" size={18} color={colors.text.primary} />
                    ) : (
                      <Ionicons
                        name={isActive && isPlaying ? 'pause' : 'play'}
                        size={18}
                        color={colors.text.primary}
                        style={isActive && isPlaying ? undefined : styles.playIconOffset}
                      />
                    )}
                  </View>
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
    height: 220,
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
  heroContent: {
    flex: 1,
    justifyContent: 'flex-end' as const,
    padding: spacing.lg,
  },
  eyebrowRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#FF5A5A',
  },
  eyebrow: {
    color: '#FF8F8F',
    fontFamily: typography.family.bold,
    fontSize: typography.size.xs,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontFamily: typography.family.bold,
    fontSize: typography.size['2xl'],
    marginBottom: spacing.xs,
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.75)',
    fontFamily: typography.family.regular,
    fontSize: typography.size.sm,
  },
  tagsContent: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  tagChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    backgroundColor: colors.surface[200],
  },
  tagChipActive: {
    backgroundColor: colors.text.primary,
  },
  tagChipText: {
    color: colors.text.primary,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.xs,
  },
  tagChipTextActive: {
    color: colors.surface[0],
  },
  listSection: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: layout.miniPlayerHeight + layout.tabBarHeight + spacing.xl,
  },
  skeletonList: {
    paddingHorizontal: spacing.lg,
  },
  skeletonRow: {
    marginBottom: spacing.md,
  },
  stationRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  stationRowPressed: {
    opacity: 0.6,
  },
  stationCover: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surface[300],
  },
  stationInfo: {
    flex: 1,
  },
  stationName: {
    color: colors.text.primary,
    fontFamily: typography.family.medium,
    fontSize: typography.size.base,
    marginBottom: 2,
  },
  stationNameActive: {
    color: colors.brand[500],
  },
  stationMeta: {
    color: colors.text.secondary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.sm,
    textTransform: 'uppercase' as const,
  },
  playButton: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: colors.surface[200],
  },
  playIconOffset: {
    marginLeft: 2,
  },
});
