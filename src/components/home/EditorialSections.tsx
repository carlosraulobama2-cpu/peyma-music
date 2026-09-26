import { View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { api, type EditorialSection } from '../../services';
import { useAsyncData } from '../../hooks';
import { usePlayerStore, useSheetStore } from '../../store';
import { MediaCard } from './MediaCard';
import { SectionHeader } from './SectionHeader';
import { Skeleton } from '../Skeleton';
import { useThemedStyles, spacing, type Theme } from '../../theme';

/**
 * Un ícono y un tinte propios por tipo de sección — para que "Lo nuevo" y
 * "Los mejores álbumes" se distingan de un vistazo aunque el curador les
 * haya puesto títulos parecidos. `MANUAL` es lo único sin patrón fijo (el
 * curador elige libremente qué mezclar), así que usa el símbolo más neutro.
 */
const KIND_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  NEW_RELEASES: 'flash',
  TOP_TRACKS: 'trending-up',
  TOP_ALBUMS: 'albums',
  TOP_ARTISTS: 'people',
  MANUAL: 'color-palette',
};

const KIND_TINT: Record<string, string> = {
  NEW_RELEASES: '#4AD9E8',
  TOP_TRACKS: '#FFC94D',
  TOP_ALBUMS: '#B478FF',
  TOP_ARTISTS: '#FF8FB1',
  MANUAL: '#1DB954',
};

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
            {/* El "ver todo" lleva a la sección completa: el carrusel sólo
                muestra las primeras piezas. El cast en el href es necesario
                hasta que el servidor de desarrollo regenere
                `.expo/types/router.d.ts`: Expo Router tipa las rutas a
                partir de los archivos existentes cuando arranca, así que una
                pantalla recién creada todavía no figura en esa unión. */}
            <SectionHeader
              icon={KIND_ICON[section.kind] ?? 'color-palette'}
              title={section.title}
              subtitle={section.subtitle ?? undefined}
              accentColor={KIND_TINT[section.kind]}
              seeAllHref={`/seccion/${section.slug}` as Href}
            />
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

const makeStyles = (_theme: Theme) => ({
  container: {
    marginBottom: spacing.xl,
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
