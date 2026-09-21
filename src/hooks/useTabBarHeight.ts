/**
 * Altura real de la barra de tabs, incluyendo el inset inferior del sistema
 * (home indicator en iOS, gesto de navegación en Android). Tenerlo en un solo
 * hook evita que `(tabs)/_layout.tsx` y `MiniPlayer` calculen el número por
 * separado y se desincronicen.
 */
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { layout } from '../theme/tokens';

export function useTabBarHeight(): number {
  const insets = useSafeAreaInsets();
  return layout.tabBarHeight + insets.bottom;
}
