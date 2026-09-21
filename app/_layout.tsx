import { useEffect } from 'react';
import { MaintenanceOverlay } from '../src/components/MaintenanceOverlay';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { Stack, useRouter, useRootNavigationState, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, ActivityIndicator } from 'react-native';
import TrackPlayer from 'react-native-track-player';
import { playbackService } from '../src/services/trackPlayerService';
import { useSetupTrackPlayer, useTrackPlayer, useListeningAnalytics } from '../src/hooks';
import { useAuthStore } from '../src/store';
import { useTheme } from '../src/theme';
import { ErrorBoundary, ToastHost, SheetHost } from '../src/components';

// Debe registrarse en el módulo raíz, antes de cualquier render.
TrackPlayer.registerPlaybackService(() => playbackService);
SplashScreen.preventAutoHideAsync().catch(() => {});

/** Mantiene sincronizados TrackPlayer y el playerStore mientras la app vive. */
function PlayerSync() {
  useTrackPlayer();
  useListeningAnalytics();
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

  const isPlayerReady = useSetupTrackPlayer();
  const isAuthLoading = useAuthStore((s) => s.isLoading);
  const loadStoredSession = useAuthStore((s) => s.loadStoredSession);

  useEffect(() => {
    loadStoredSession();
  }, [loadStoredSession]);

  const isReady = (fontsLoaded || Boolean(fontError)) && isPlayerReady && !isAuthLoading;

  useEffect(() => {
    if (isReady) SplashScreen.hideAsync().catch(() => {});
  }, [isReady]);

  if (!isReady) {
    return (
      <View style={styles.bootContainer}>
        <ActivityIndicator size="large" color="#1DB954" />
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
  },
};
