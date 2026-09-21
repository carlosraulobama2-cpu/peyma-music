/**
 * Peyma Music — Design Tokens
 *
 * Única fuente de verdad del sistema visual. Ninguna pantalla debe declarar
 * colores, tamaños, radios ni duraciones "a mano".
 */

export type ThemeMode = 'dark' | 'light';

/** Forma de una paleta. Ambos temas la cumplen, así el tipado no depende del modo. */
export interface Palette {
  brand: Record<50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900, string>;
  surface: Record<0 | 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900, string>;
  text: {
    primary: string;
    secondary: string;
    muted: string;
    inverse: string;
    /** Texto sobre un relleno de marca (siempre alto contraste). */
    onBrand: string;
  };
  semantic: {
    error: string;
    warning: string;
    success: string;
    info: string;
  };
  /** Capas translúcidas para overlays, scrims y cristal. */
  overlay: {
    scrim: string;
    scrimStrong: string;
    glass: string;
    hairline: string;
  };
}

const brand = {
  50: '#E8FFF0',
  100: '#C6FFD9',
  200: '#8BFFB3',
  300: '#4FFF8D',
  400: '#1AE86A',
  500: '#1DB954',
  600: '#17A348',
  700: '#118839',
  800: '#0C6D2C',
  900: '#065220',
} as const;

const darkPalette: Palette = {
  brand,
  surface: {
    0: '#000000',
    50: '#0A0A0A',
    100: '#121212',
    200: '#1A1A1A',
    300: '#232323',
    400: '#2A2A2A',
    500: '#333333',
    600: '#404040',
    700: '#555555',
    800: '#717171',
    900: '#B3B3B3',
  },
  text: {
    primary: '#FFFFFF',
    secondary: '#B3B3B3',
    muted: '#717171',
    inverse: '#0A0A0A',
    onBrand: '#04150A',
  },
  semantic: {
    error: '#FF6B6B',
    warning: '#F5A623',
    success: '#1DB954',
    info: '#4A9EFF',
  },
  overlay: {
    scrim: 'rgba(0,0,0,0.45)',
    scrimStrong: 'rgba(0,0,0,0.72)',
    glass: 'rgba(255,255,255,0.08)',
    hairline: 'rgba(255,255,255,0.10)',
  },
};

/**
 * En claro las rampas `surface` se invierten: 0 es el papel y 900 el contraste
 * máximo. Así un componente puede usar `surface[200]` como "un paso por encima
 * del fondo" sin saber en qué tema está.
 */
const lightPalette: Palette = {
  brand,
  surface: {
    0: '#FFFFFF',
    50: '#F7F8FA',
    100: '#F1F3F5',
    200: '#E8EBEF',
    300: '#DDE1E7',
    400: '#C7CDD6',
    500: '#9AA3AF',
    600: '#6B7280',
    700: '#4B5563',
    800: '#1F2937',
    900: '#0F172A',
  },
  text: {
    primary: '#0F172A',
    secondary: '#4B5563',
    muted: '#6B7280',
    inverse: '#FFFFFF',
    onBrand: '#04150A',
  },
  semantic: {
    error: '#D93030',
    warning: '#B26A00',
    success: '#17A348',
    info: '#1D63D1',
  },
  overlay: {
    scrim: 'rgba(15,23,42,0.35)',
    scrimStrong: 'rgba(15,23,42,0.62)',
    glass: 'rgba(15,23,42,0.05)',
    hairline: 'rgba(15,23,42,0.10)',
  },
};

const palettes: Record<ThemeMode, Palette> = {
  dark: darkPalette,
  light: lightPalette,
};

export function getPalette(mode: ThemeMode): Palette {
  return palettes[mode];
}

/**
 * Paleta oscura por defecto, para los pocos sitios que corren fuera de React
 * (p. ej. opciones de navegación evaluadas antes del primer render).
 * En componentes usa siempre `useTheme()`.
 */
export const colors = darkPalette;

export const typography = {
  family: {
    regular: 'Inter_400Regular',
    medium: 'Inter_500Medium',
    semibold: 'Inter_600SemiBold',
    bold: 'Inter_700Bold',
  },
  size: {
    xs: 11,
    sm: 13,
    base: 15,
    md: 17,
    lg: 20,
    xl: 24,
    '2xl': 28,
    '3xl': 34,
    '4xl': 40,
  },
  /** Alturas de línea absolutas: RN no acepta multiplicadores. */
  lineHeight: {
    xs: 14,
    sm: 18,
    base: 21,
    md: 24,
    lg: 26,
    xl: 30,
    '2xl': 34,
    '3xl': 40,
    '4xl': 46,
  },
  letterSpacing: {
    tight: -0.4,
    normal: 0,
    wide: 0.5,
  },
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
  '5xl': 48,
  '6xl': 64,
} as const;

export const radius = {
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  '2xl': 20,
  '3xl': 28,
  full: 9999,
} as const;

export const layout = {
  miniPlayerHeight: 64,
  tabBarHeight: 62,
  screenPadding: 16,
  headerHeight: 56,
  coverSm: 48,
  coverMd: 64,
  coverLg: 156,
  touchTarget: 44,
} as const;

/**
 * Curvas y duraciones compartidas. Tener un solo juego de valores es lo que
 * hace que la app se sienta coherente al navegar entre pantallas.
 */
export const motion = {
  duration: {
    instant: 120,
    fast: 200,
    normal: 300,
    slow: 450,
  },
  spring: {
    /** Respuesta táctil: press-in / press-out. */
    snappy: { damping: 18, stiffness: 260, mass: 0.7 },
    /** Entradas de pantalla y sheets. */
    smooth: { damping: 20, stiffness: 140, mass: 0.9 },
    /** Rebote sutil para likes y badges. */
    bouncy: { damping: 11, stiffness: 190, mass: 0.8 },
  },
  /** Desfase entre elementos de una lista al entrar en pantalla. */
  stagger: 55,
} as const;

/** Sombras ya combinadas para iOS (shadow*) y Android (elevation). */
export const elevation = {
  none: {},
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 6,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 12,
  },
} as const;
