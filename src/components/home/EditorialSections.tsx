import { View, Text, Pressable } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter, type Href } from 'expo-router';
import { api, type EditorialSection } from '../../services';
import { useAsyncData } from '../../hooks';
import { usePlayerStore, useSheetStore } from '../../store';
import { MediaCard } from './MediaCard';
import { Skeleton } from '../Skeleton';
import { useThemedStyles, spacing, typography, type Theme } from '../../theme';

/**
 * Secciones de la portada definidas desde el panel de control.
 *
 * El backend ya devuelve cada sección resuelta, ordenada y sin las vacías,
 * así que aquí no hay lógica de "qué mostrar": sólo cómo. Lo mismo hace la
 * web con el mismo endpoint, de modo que el curador cambia una sección en
 * un sitio y se refleja en los dos clientes.
 *
 * Si no hay ninguna sección publicada no renderiza nada, y las secciones
 * fijas de Inicio (`ForYouSection`, `NewReleasesSection`…) siguen cubriendo
 * la pantalla.
 */
export function EditorialSections() {
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);
  const play = usePlayerStore((s) => s.play);
  const openTrackOptions = useSheetStore((s) => s.openTrackOptions);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);

  const { data: sections, isLoading, error } = useAsyncData<EditorialSection[]>(
    (signal) => api.getEditorialSections({ signal }),
    [],
    'No pudimos cargar las secciones de Inicio.',
  );

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Skeleton width={140} height={20} style={styles.skeletonTitle} />
        <Skeleton width="100%" height={150} borderRadius={12} />
      </View>
    );
  }

  // Un fallo acá no debe romper Inicio: el resto de bloques se carga solo.
  if (error || !sections || sections.length === 0) return null;

  return (
    <>
      {sections.map((section) => {
        // Cada sección lleva pistas, álbumes o artistas — nunca los mezcla,
        // pero se unifican para no repetir tres bloques de render iguales.
        const cards = [
          ...section.tracks.map((track) => ({
            key: `t-${track.id}`,
            title: track.title,
            subtitle: track.artist,
            coverUrl: track.coverUrl,
            isActive: currentTrack?.id === track.id,
            onPress: () => router.push(`/album/${track.albumId}`),
            onPlayPress: () => play(track, section.tracks),
            onOptionsPress: () => openTrackOptions(track),
          })),
          ...section.albums.map((album) => ({
            key: `a-${album.id}`,
            title: album.title,
            subtitle: album.artistName,
            coverUrl: album.coverUrl,
            isActive: false,
            onPress: () => router.push(`/album/${album.id}`),
            // Sin play: la sección no trae las pistas del álbum, y un botón
            // que no hiciera nada sería peor que no tenerlo.
            onPlayPress: undefined,
            onOptionsPress: undefined,
          })),
          ...section.artists.map((artist) => ({
            key: `r-${artist.id}`,
            title: artist.name,
            subtitle: artist.isVerified ? 'Artista verificado' : '',
            coverUrl: artist.imageUrl,
            isActive: false,
            onPress: () => router.push(`/artist/${artist.id}`),
            onPlayPress: undefined,
            onOptionsPress: undefined,
          })),
        ];

        if (cards.length === 0) return null;

        return (
          <View key={section.id} style={styles.container}>
            {/* El título lleva a la sección completa: el carrusel sólo
                muestra las primeras piezas. */}
            <Pressable
              // El cast es necesario hasta que el servidor de desarrollo
              // regenere `.expo/types/router.d.ts`: Expo Router tipa las rutas
              // a partir de los archivos existentes cuando arranca, así que una
              // pantalla recién creada todavía no figura en esa unión.
              onPress={() => router.push(`/seccion/${section.slug}` as Href)}
              accessibilityRole="link"
              accessibilityLabel={`Ver todo en ${section.title}`}
            >
              <Text style={styles.title}>{section.title} ›</Text>
            </Pressable>
            {section.subtitle ? <Text style={styles.subtitle}>{section.subtitle}</Text> : null}
            <FlashList
              data={cards}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item) => item.key}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => (
                <View style={styles.item}>
                  <MediaCard
                    kind="track"
                    id={item.key}
                    title={item.title}
                    subtitle={item.subtitle}
                    coverUrl={item.coverUrl}
                    isActive={item.isActive}
                    isPlaying={isPlaying}
                    onPress={item.onPress}
                    onPlayPress={item.onPlayPress}
                    onOptionsPress={item.onOptionsPress}
                  />
                </View>
              )}
            />
          </View>
        );
      })}
    </>
  );
}

const makeStyles = ({ colors }: Theme) => ({
  container: {
    marginBottom: spacing.xl,
  },
  title: {
    color: colors.text.primary,
    fontFamily: typography.family.bold,
    fontSize: typography.size.xl,
    marginBottom: spacing.xs,
    marginLeft: spacing.md,
  },
  subtitle: {
    color: colors.text.secondary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.sm,
    marginBottom: spacing.sm,
    marginLeft: spacing.md,
  },
  skeletonTitle: {
    marginBottom: spacing.sm,
    marginLeft: spacing.md,
  },
  listContent: {
    paddingHorizontal: spacing.md,
  },
  item: {
    marginRight: spacing.md,
  },
});
