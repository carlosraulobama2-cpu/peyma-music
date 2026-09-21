import { useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, type EditorialSection } from '../../src/services';
import { usePlayerStore, useSheetStore } from '../../src/store';
import { AppBar, EmptyState, Skeleton, TrackRow } from '../../src/components';
import { useThemedStyles, spacing, typography, radius, motion, type Theme } from '../../src/theme';

/**
 * Pantalla de una sección de la portada: /seccion/lo-nuevo.
 *
 * Es el destino de los títulos de los carruseles de Inicio. La web ya la
 * tenía y la app no, así que un mismo enlace funcionaba en un cliente y no
 * en el otro.
 *
 * A diferencia del carrusel, aquí se ve la sección ENTERA: las pistas como
 * lista reproducible y los álbumes o artistas como cuadrícula.
 */
export default function SectionScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(makeStyles);

  const play = usePlayerStore((s) => s.play);
  const openTrackOptions = useSheetStore((s) => s.openTrackOptions);

  const [section, setSection] = useState<EditorialSection | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;

    api
      .getEditorialSectionBySlug(slug)
      .then((result) => {
        if (!cancelled) setSection(result);
      })
      .catch(() => {
        if (!cancelled) setSection(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (loading) {
    return (
      <View style={styles.container}>
        <AppBar title="" leftAction={{ icon: 'chevron-back', onPress: () => router.back() }} />
        <View style={styles.loadingBox}>
          <Skeleton width={200} height={28} style={styles.loadingTitle} />
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} width="100%" height={56} borderRadius={8} style={styles.loadingRow} />
          ))}
        </View>
      </View>
    );
  }

  if (!section) {
    return (
      <View style={styles.container}>
        <AppBar title="Sección" leftAction={{ icon: 'chevron-back', onPress: () => router.back() }} />
        <EmptyState
          icon="albums-outline"
          title="Esta sección no existe"
          description="Puede que se haya despublicado desde el panel, o que el enlace esté mal escrito."
        />
      </View>
    );
  }

  const hasTracks = section.tracks.length > 0;

  return (
    <View style={styles.container}>
      <AppBar title={section.title} leftAction={{ icon: 'chevron-back', onPress: () => router.back() }} />

      <FlatList
        data={section.tracks}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing['4xl'] }]}
        ListHeaderComponent={
          <View>
            {section.subtitle ? <Text style={styles.subtitle}>{section.subtitle}</Text> : null}
            {hasTracks && (
              <Pressable
                onPress={() => play(section.tracks[0]!, section.tracks)}
                accessibilityRole="button"
                style={styles.playAll}
              >
                <Text style={styles.playAllLabel}>Reproducir</Text>
              </Pressable>
            )}
          </View>
        }
        renderItem={({ item, index }) => (
          <TrackRow
            track={item}
            index={index + 1}
            onPress={() => play(item, section.tracks)}
            onOptionsPress={() => openTrackOptions(item)}
          />
        )}
        ListFooterComponent={
          section.albums.length + section.artists.length > 0 ? (
            <View style={styles.grid}>
              {[...section.albums, ...section.artists].map((entry) => {
                const isArtist = 'name' in entry;
                return (
                  <Pressable
                    key={entry.id}
                    onPress={() => router.push(isArtist ? `/artist/${entry.id}` : `/album/${entry.id}`)}
                    accessibilityRole="button"
                    style={styles.gridItem}
                  >
                    <Image
                      source={isArtist ? entry.imageUrl : entry.coverUrl}
                      style={[styles.gridCover, isArtist && styles.gridCoverRound]}
                      contentFit="cover"
                      transition={motion.duration.fast}
                      cachePolicy="memory-disk"
                    />
                    <Text style={styles.gridTitle} numberOfLines={1}>
                      {isArtist ? entry.name : entry.title}
                    </Text>
                    {!isArtist && (
                      <Text style={styles.gridSubtitle} numberOfLines={1}>
                        {entry.artistName}
                      </Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
          ) : null
        }
        onEndReachedThreshold={0.5}
      />
    </View>
  );
}

const makeStyles = ({ colors }: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: colors.surface[50],
  },
  list: {
    paddingHorizontal: spacing.md,
  },
  subtitle: {
    color: colors.text.secondary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.sm,
    marginBottom: spacing.md,
  },
  playAll: {
    alignSelf: 'flex-start' as const,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.full,
    backgroundColor: colors.brand[500],
    marginBottom: spacing.lg,
  },
  playAllLabel: {
    color: colors.text.onBrand,
    fontFamily: typography.family.bold,
    fontSize: typography.size.base,
  },
  grid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  gridItem: {
    width: '47%' as const,
  },
  gridCover: {
    width: '100%' as const,
    aspectRatio: 1,
    borderRadius: radius.md,
  },
  gridCoverRound: {
    borderRadius: 999,
  },
  gridTitle: {
    color: colors.text.primary,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.sm,
    marginTop: spacing.xs,
  },
  gridSubtitle: {
    color: colors.text.secondary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.xs,
  },
  loadingBox: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  loadingTitle: {
    marginBottom: spacing.md,
  },
  loadingRow: {
    marginBottom: spacing.xs,
  },
});
