import { useCallback, useState } from 'react';
import { Animated, Text, Pressable, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  HomeHeader,
  QuickFilterBar,
  QuickAccessGrid,
  FeaturedArtistBanner,
  ForYouSection,
  NewReleasesSection,
  HeroRow,
  PopularArtistsRow,
  EditorialSections,
  GenreCarousel,
} from '../../src/components/home';
import { LocationConsentCard } from '../../src/components/LocationConsentCard';
import { AnnouncementBanner } from '../../src/components/AnnouncementBanner';
import { EmptyState } from '../../src/components';
import { GENRES } from '../../src/types/music';
import { useTheme, useThemedStyles, spacing, typography, radius, layout, type Theme } from '../../src/theme';
import { api, fetchNotifications, type HomeFeed } from '../../src/services';
import { useAsyncData } from '../../src/hooks';

/**
 * Pantalla de Inicio, estilo Spotify. Cada bloque se carga y falla de forma
 * independiente (ver `GenreCarousel`/`ForYouSection`/`NewReleasesSection`):
 * si "Novedades" no puede cargar, el resto de Inicio sigue funcionando en
 * vez de mostrar un único error a pantalla completa.
 */
export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  /**
   * Fuerza recargar todo al tirar hacia abajo.
   *
   * `refreshKey` va como dependencia de `useAsyncData`: cambiarlo dispara
   * una consulta nueva. Es más simple que exponer un `refetch` desde el
   * hook y funciona igual para cualquier bloque que quiera sumarse.
   */
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  /**
   * La cabecera se desvanece al bajar.
   *
   * Con `Animated.Value` y `useNativeDriver`: la opacidad se interpola en
   * el hilo nativo de UI, así que sigue a 60 fps aunque el hilo de
   * JavaScript esté ocupado renderizando las filas. Con `setState` en cada
   * evento de scroll se notarían tirones.
   *
   * Va en `useState` con inicializador perezoso y no en `useRef`: el valor
   * se crea una sola vez igual, pero leer `ref.current` durante el render
   * es justo lo que las reglas de hooks prohíben, y con razón — un ref no
   * es una fuente válida de lo que se pinta.
   */
  const [scrollY] = useState(() => new Animated.Value(0));
  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 90],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const { data: home, isLoading: homeLoading, error: homeError } = useAsyncData<HomeFeed>(
    (signal) => api.getHomeFeed({ signal }),
    [refreshKey],
    'No pudimos cargar Inicio.',
  );

  /**
   * El punto rojo de la campana viene del servidor, no de un contador
   * local: que aprobaran tu canción lo decide el backend y el teléfono no
   * puede saberlo por su cuenta.
   */
  const { data: unread } = useAsyncData(
    () => fetchNotifications().then((res) => res.unread),
    [refreshKey],
    '',
  );
  const unreadCount = unread ?? 0;

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setRefreshKey((key) => key + 1);
    // El indicador se oculta solo: mantenerlo hasta que respondan TODAS las
    // secciones dejaría la rueda girando por culpa del bloque más lento.
    setTimeout(() => setRefreshing(false), 800);
  }, []);

  return (
    <Animated.ScrollView
      style={styles.container}
      onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
      scrollEventThrottle={16}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.xl }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text.secondary} />
      }
    >
      <Animated.View style={{ opacity: headerOpacity }}>
        <HomeHeader
          onPressProfile={() => router.push('/profile')}
          onPressNotifications={() => router.push('/notifications')}
          hasUnreadNotifications={unreadCount > 0}
        />
      </Animated.View>

      <Pressable
        onPress={() => router.push('/charts')}
        accessibilityRole="button"
        accessibilityLabel="Ver Top Charts"
        style={styles.trendingButton}
      >
        <Ionicons name="trending-up" size={16} color={colors.text.onBrand} />
        <Text style={styles.trendingButtonText}>Top Charts</Text>
      </Pressable>

      <AnnouncementBanner />
      <LocationConsentCard />

      {/*
        Fallo de carga a la vista, y con salida.

        Antes este error se descartaba: `useAsyncData` ya lo devolvía y la
        pantalla sólo leía `data` e `isLoading`. Con la API caída quedaban
        filas vacías indefinidamente y sin una palabra de explicación, que
        desde fuera se ve como "la app no funciona" en vez de "no hay
        servidor".

        Sólo se muestra si además NO hay datos: si ya había una portada
        cargada, un fallo al refrescar no debe taparla.
      */}
      {homeError && !home && (
        <EmptyState
          icon="cloud-offline-outline"
          title="No pudimos conectar"
          description={`${homeError} Revisá tu conexión; si el problema sigue, puede que el servidor no esté disponible.`}
          actionLabel="Reintentar"
          onAction={onRefresh}
        />
      )}

      <HeroRow items={home?.hero ?? []} isLoading={homeLoading} />

      <QuickFilterBar />
      <QuickAccessGrid quickAccess={home?.quickAccess} />
      <FeaturedArtistBanner />
      <PopularArtistsRow artists={home?.artists ?? []} isLoading={homeLoading} />

      <ForYouSection />
      <NewReleasesSection />

      {/* Secciones definidas por el curador en el panel de control. Van
          después de los bloques fijos y no los reemplazan: si todavía no hay
          ninguna publicada, esto no renderiza nada. */}
      <EditorialSections />

      {GENRES.map((genre) => (
        <GenreCarousel key={genre} genre={genre} />
      ))}
    </Animated.ScrollView>
  );
}

const makeStyles = ({ colors }: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: colors.surface[50],
  },
  content: {
    paddingBottom: layout.miniPlayerHeight + layout.tabBarHeight + spacing.xl,
  },
  trendingButton: {
    flexDirection: 'row' as const,
    alignSelf: 'flex-start' as const,
    alignItems: 'center' as const,
    backgroundColor: colors.brand[500],
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.lg,
    gap: spacing.xs,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  trendingButtonText: {
    color: colors.text.onBrand,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.xs,
  },
});
