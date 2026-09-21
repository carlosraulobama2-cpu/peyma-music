import { View, type ColorValue } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MiniPlayer } from '../../src/components';
import { useAuthStore } from '../../src/store';
import { useTheme, typography, layout, spacing } from '../../src/theme';

// React Navigation tipa `color` como `ColorValue` (incluye null/OpaqueColorValue),
// pero tabBarActiveTintColor/InactiveTintColor abajo siempre son strings hex
// de nuestros tokens — en runtime esto nunca es otra cosa.
const asIconColor = (color: ColorValue): string => color as string;

export default function TabLayout() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const isArtist = useAuthStore((s) => s.user?.accountType === 'artist');

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface[50] }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.brand[500],
          tabBarInactiveTintColor: colors.text.secondary,
          tabBarStyle: {
            backgroundColor: colors.surface[50],
            borderTopColor: colors.surface[300],
            borderTopWidth: 1,
            height: layout.tabBarHeight + insets.bottom,
            paddingBottom: insets.bottom + spacing.sm,
            paddingTop: spacing.sm,
          },
          tabBarLabelStyle: {
            fontFamily: typography.family.medium,
            fontSize: typography.size.xs,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Inicio',
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons name={focused ? 'home' : 'home-outline'} size={size} color={asIconColor(color)} />
            ),
          }}
        />
        <Tabs.Screen
          name="search"
          options={{
            title: 'Buscar',
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons name={focused ? 'search' : 'search-outline'} size={size} color={asIconColor(color)} />
            ),
          }}
        />
        <Tabs.Screen
          name="browse"
          options={{
            title: 'Explorar',
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons name={focused ? 'compass' : 'compass-outline'} size={size} color={asIconColor(color)} />
            ),
          }}
        />
        <Tabs.Screen
          name="library"
          options={{
            title: 'Tu biblioteca',
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons name={focused ? 'library' : 'library-outline'} size={size} color={asIconColor(color)} />
            ),
          }}
        />
        <Tabs.Screen
          name="studio"
          options={{
            title: 'Studio',
            // Sin `href`, el tab no aparece en la barra ni es navegable —
            // así se oculta para cuentas que no son de artista.
            href: isArtist ? undefined : null,
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons name={focused ? 'mic' : 'mic-outline'} size={size} color={asIconColor(color)} />
            ),
          }}
        />
      </Tabs>
      <MiniPlayer />
    </View>
  );
}
