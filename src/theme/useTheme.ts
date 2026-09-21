/**
 * Peyma Music — Acceso al tema desde componentes
 *
 * `useThemedStyles` memoiza la hoja de estilos por paleta, no por render: al
 * cambiar de tema se recalcula una vez y se reutiliza mientras el modo no varíe.
 */
import { useColorScheme, StyleSheet } from 'react-native';
import { useMemo } from 'react';
import { useThemeStore } from '../store/themeStore';
import { getPalette, type Palette, type ThemeMode } from './tokens';

export interface Theme {
  mode: ThemeMode;
  colors: Palette;
  isDark: boolean;
}

/** Resuelve la preferencia del usuario ('system' incluido) al modo efectivo. */
export function useTheme(): Theme {
  const preference = useThemeStore((s) => s.preference);
  const systemScheme = useColorScheme();

  return useMemo(() => {
    const mode: ThemeMode =
      preference === 'system' ? (systemScheme === 'light' ? 'light' : 'dark') : preference;
    return { mode, colors: getPalette(mode), isDark: mode === 'dark' };
  }, [preference, systemScheme]);
}

/**
 * Restricción laxa a propósito. Escribirla como
 * `{ [P in keyof T]: ViewStyle | TextStyle | ImageStyle }` tiene dos problemas
 * con los tipos que trae React Native 0.87:
 *
 *  1. Colapsa el tipo de cada estilo a esa unión, así que `styles.titulo` deja
 *     de ser un `TextStyle` concreto y ya no se puede pasar a `<Text style>`.
 *  2. Los `ViewStyle`/`TextStyle` públicos de RN 0.87 incluyen propiedades sólo
 *     de web (`position: 'fixed'`, `transitionDuration: number`) que el tipo
 *     interno que espera `StyleSheet.create` no acepta.
 *
 * Dejando inferir la forma literal de cada `makeStyles`, cada estilo conserva
 * su tipo exacto y RN valida en el punto de uso (`style={styles.x}`), que es
 * donde el error realmente importa.
 */
type StyleSheetInput = Parameters<typeof StyleSheet.create>[0];

/**
 * Cachés por fábrica de estilos. Cada `makeStyles` guarda su resultado por modo,
 * así montar 200 filas de una lista no recrea la hoja 200 veces.
 */
const styleCache = new WeakMap<object, Partial<Record<ThemeMode, unknown>>>();

export function useThemedStyles<T extends Record<string, object>>(factory: (theme: Theme) => T): T {
  const theme = useTheme();

  return useMemo(() => {
    let perMode = styleCache.get(factory);
    if (!perMode) {
      perMode = {};
      styleCache.set(factory, perMode);
    }
    const cached = perMode[theme.mode];
    if (cached) return cached as T;

    const created = StyleSheet.create(factory(theme) as StyleSheetInput);
    perMode[theme.mode] = created;
    return created as unknown as T;
  }, [factory, theme]);
}
