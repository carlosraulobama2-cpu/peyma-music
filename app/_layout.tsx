import { useEffect, useState } from 'react';
import { MaintenanceOverlay } from '../src/components/MaintenanceOverlay';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { Stack, useRouter, useRootNavigationState, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, Text, ActivityIndicator } from 'react-native';
import TrackPlayer from 'react-native-track-player';
import { playbackService } from '../src/services/trackPlayerService';
import { useSetupTrackPlayer, useTrackPlayer, useListeningAnalytics, usePeymaConnect } from '../src/hooks';
import { useAuthStore } from '../src/store';
import { useTheme } from '../src/theme';
import { ErrorBoundary, ToastHost, SheetHost } from '../src/components';

/**
 * Debe registrarse en el módulo raíz, antes de cualquier render — pero
 * envuelto, porque esta línea se ejecuta al EVALUAR el bundle.
 *
 * `react-native-track-player` 4.1.2 no soporta la Nueva Arquitectura, que
 * este proyecto tiene activada (la exige Reanimated 4). Cuando el módulo
 * nativo no queda registrado, tocarlo aquí lanza antes de que exista un
 * solo componente: no hay ErrorBoundary que valga, ni pantalla de carga, ni
 * log en la app. El proceso se cierra y desde fuera se ve exactamente como
 * lo describieron los usuarios — "instala bien y después no entra ni nada".
 *
 * Sin registro no hay reproducción en segundo plano ni controles de
 * pantalla de bloqueo. Es una pérdida real, pero menor que una app que no
 * arranca: quien abra podrá al menos entrar, ver su biblioteca y cerrar
 * sesión. El error se deja en el log nativo para poder confirmarlo con
 * `adb logcat`.
 */
try {
  TrackPlayer.registerPlaybackService(() => playbackService);
} catch (error) {
  console.error('[boot] No se pudo registrar el servicio de reproducción:', error);
}

SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * Último recinto para errores de JS que nadie atrapó.
 *
 * El `ErrorBoundary` de React sólo cubre lo que pasa DENTRO del árbol de
 * componentes. Un fallo en la evaluación del bundle, en un `setTimeout` o
 * en una promesa suelta se lo come el runtime y la app muere sin dejar
 * rastro. Esto no evita el cierre, pero deja una línea en `adb logcat` que
 * dice qué pasó, que es lo que faltaba para diagnosticar.
 */
const manejadorPrevio = ErrorUtils.getGlobalHandler?.();
ErrorUtils.setGlobalHandler?.((error, isFatal) => {
  console.error(`[crash] ${isFatal ? 'FATAL' : 'no fatal'}:`, error?.message, error?.stack);
  manejadorPrevio?.(error, isFatal);
});

/** Mantiene sincronizados TrackPlayer, el playerStore y Peyma Connect mientras la app vive. */
function PlayerSync() {
  useTrackPlayer();
  useListeningAnalytics();
  usePeymaConnect();
  return null;
}

/** Redirige a /login cuando no hay sesión, salvo en las pantallas públicas. */
function useAuthGate() {
  const router = useRouter();
  const segments = useSegments();
  const navigationState = useRootNavigationState();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isAuthLoading = useAuthStore((s) => s.isLoading);

  useEffect(() => {
    if (!navigationState?.key || isAuthLoading) return;

    const publicRoute = segments[0] === 'login' || segments[0] === 'onboarding';
    if (!isAuthenticated && !publicRoute) {
      router.replace('/login');
    } else if (isAuthenticated && publicRoute) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, isAuthLoading, navigationState?.key, router, segments]);
}

function RootNavigator() {
  const { colors, mode } = useTheme();
  useAuthGate();

  return (
    <>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <PlayerSync />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.surface[50] },
          animation: 'fade',
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="login" />
        <Stack.Screen name="profile" options={{ presentation: 'modal' }} />
        <Stack.Screen name="queue" options={{ presentation: 'modal' }} />
        <Stack.Screen name="notifications" options={{ presentation: 'modal' }} />
        <Stack.Screen name="legal/[slug]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="studio/become-artist" options={{ presentation: 'modal' }} />
        <Stack.Screen name="studio/edit-profile" options={{ presentation: 'modal' }} />
        <Stack.Screen name="studio/release" options={{ presentation: 'modal' }} />
        <Stack.Screen name="lofi/index" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen
          name="player/[trackId]"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
      </Stack>
      <ToastHost />
      <SheetHost />
      <MaintenanceOverlay />
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  /**
   * El reproductor se inicializa, pero NO bloquea el arranque.
   *
   * Antes `isReady` exigía `isPlayerReady`, y `setupTrackPlayer()` devuelve
   * `false` cuando la inicialización nativa falla (módulo parcheado, otra
   * app reteniendo el audio, un emulador sin salida de sonido…). Como ese
   * `false` no cambia nunca más, `isReady` se quedaba en falso para siempre:
   * la app no pasaba del splash, sin llegar al login ni a ninguna pantalla,
   * y sin un solo mensaje que dijera por qué.
   *
   * Escuchar música es lo que la app hace, pero no es requisito para
   * dibujarla: quien no pueda reproducir tiene que poder entrar igual,
   * mirar su biblioteca o cerrar sesión. El fallo del reproductor se nota
   * al darle a play, que es donde significa algo.
   */
  useSetupTrackPlayer();

  const isAuthLoading = useAuthStore((s) => s.isLoading);
  const loadStoredSession = useAuthStore((s) => s.loadStoredSession);

  useEffect(() => {
    loadStoredSession();
  }, [loadStoredSession]);

  /**
   * Red de seguridad del arranque.
   *
   * Si algo de lo que se espera no termina nunca —las fuentes, la sesión—
   * la app se queda en la pantalla de carga sin decir nada, que es el peor
   * fallo posible porque no deja ni reportarlo. Pasados unos segundos se
   * arranca igual: sin la fuente cargada se ve con la del sistema, y sin
   * sesión resuelta el guardia manda al login, que son dos estados
   * recuperables. Quedarse en blanco no lo es.
   */
  const [bootTimedOut, setBootTimedOut] = useState(false);
  /** A los 3 s el arranque ya es anormal: se empieza a explicar la espera. */
  const [bootSlow, setBootSlow] = useState(false);
  useEffect(() => {
    const aviso = setTimeout(() => setBootSlow(true), 3000);
    const salida = setTimeout(() => setBootTimedOut(true), 8000);
    return () => {
      clearTimeout(aviso);
      clearTimeout(salida);
    };
  }, []);

  const isReady = ((fontsLoaded || Boolean(fontError)) && !isAuthLoading) || bootTimedOut;

  useEffect(() => {
    if (isReady) SplashScreen.hideAsync().catch(() => {});
  }, [isReady]);

  if (!isReady) {
    /**
     * Pasados unos segundos, la pantalla de carga dice QUÉ está esperando.
     *
     * El fallo que motivó esto se reportó como "no va ni al login ni nada":
     * un círculo girando sobre negro, sin una pista de qué faltaba. Un
     * renglón de texto convierte ese reporte en algo accionable sin pedirle
     * a nadie que conecte el teléfono a un cable.
     */
    const pendientes = [
      !(fontsLoaded || fontError) ? 'tipografías' : null,
      isAuthLoading ? 'sesión' : null,
    ].filter(Boolean);

    return (
      <View style={styles.bootContainer}>
        <ActivityIndicator size="large" color="#1DB954" />
        {bootSlow && pendientes.length > 0 && (
          <Text style={styles.bootHint}>Esperando: {pendientes.join(' y ')}…</Text>
        )}
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <GestureHandlerRootView style={styles.flex}>
          <RootNavigator />
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

const styles = {
  flex: { flex: 1 },
  bootContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    backgroundColor: '#0A0A0A',
    gap: 16,
  },
  // Sin tokens del tema a propósito: esto se dibuja antes de que las
  // fuentes y el proveedor de tema estén listos, que es justo cuando puede
  // hacer falta.
  bootHint: {
    color: '#A7A7A7',
    fontSize: 13,
  },
};
