/**
 * Temas del panel.
 *
 * Cada tema es un juego de valores para las mismas variables CSS que ya
 * define `index.css`. Cambiar de tema reescribe esas variables en
 * `document.documentElement` y toda la interfaz se actualiza al instante,
 * sin recargar y sin que ningún componente tenga que enterarse: todos leen
 * `bg-surface`, `text-muted`… que apuntan a las variables.
 *
 * Por eso no hay clases `dark:` por ningún lado. Con un solo juego de
 * variables, añadir un tema es añadir una entrada a esta lista.
 */

export interface ThemeTokens {
  background: string;
  surface: string;
  'surface-raised': string;
  foreground: string;
  muted: string;
  brand: string;
  'brand-hover': string;
  danger: string;
}

export interface AdminTheme {
  id: string;
  label: string;
  icon: string;
  description: string;
  /** Para la miniatura del selector, sin tener que aplicar el tema. */
  preview: [string, string, string];
  tokens: ThemeTokens;
}

export const THEMES: readonly AdminTheme[] = [
  {
    id: 'peyma-dark',
    label: 'Peyma Dark',
    icon: '🎵',
    description: 'El de siempre: negro profundo y verde de marca.',
    preview: ['#121212', '#282828', '#1db954'],
    tokens: {
      background: '#121212',
      surface: '#181818',
      'surface-raised': '#282828',
      foreground: '#ffffff',
      muted: '#a7a7a7',
      brand: '#1db954',
      'brand-hover': '#1ed760',
      danger: '#f15e6c',
    },
  },
  {
    id: 'dark-neon',
    label: 'Dark Neon',
    icon: '🌙',
    description: 'Negro absoluto con acentos violeta.',
    preview: ['#09090b', '#1c1c22', '#a855f7'],
    tokens: {
      background: '#09090b',
      surface: '#121216',
      'surface-raised': '#1c1c22',
      foreground: '#fafafa',
      muted: '#9a9aa8',
      brand: '#a855f7',
      'brand-hover': '#c084fc',
      danger: '#fb7185',
    },
  },
  {
    id: 'clean-light',
    label: 'Clean Light',
    icon: '☀️',
    description: 'Claro, para trabajar de día.',
    preview: ['#f7f7f8', '#e6e6ea', '#0f62fe'],
    tokens: {
      background: '#f7f7f8',
      surface: '#ffffff',
      'surface-raised': '#e6e6ea',
      // En claro, el texto se invierte: si no, todo quedaría blanco sobre
      // blanco. Es justo lo que un tema basado sólo en el color de acento
      // no puede resolver, y por eso cada tema define el juego completo.
      foreground: '#18181b',
      muted: '#61616b',
      brand: '#0f62fe',
      'brand-hover': '#0353e9',
      danger: '#d02670',
    },
  },
  {
    id: 'green-studio',
    label: 'Green Studio',
    icon: '🟢',
    description: 'Oscuro de estudio, verdes apagados.',
    preview: ['#0c110e', '#1b241d', '#34d399'],
    tokens: {
      background: '#0c110e',
      surface: '#121a15',
      'surface-raised': '#1b241d',
      foreground: '#eefaf3',
      muted: '#8aa396',
      brand: '#34d399',
      'brand-hover': '#6ee7b7',
      danger: '#f87171',
    },
  },
] as const;

const STORAGE_KEY = 'peyma-admin-theme';
const ACCENT_KEY = 'peyma-admin-accent';

export const DEFAULT_THEME_ID = THEMES[0]!.id;

export function getTheme(id: string): AdminTheme {
  return THEMES.find((theme) => theme.id === id) ?? THEMES[0]!;
}

/**
 * Aplica un tema escribiendo las variables CSS en el elemento raíz.
 *
 * `accent` sobrescribe sólo el color de marca. Se separa del tema porque son
 * dos decisiones distintas: el tema define legibilidad (fondos y textos) y
 * el acento es identidad visual. Mezclarlos obligaría a crear un tema nuevo
 * por cada color de marca que alguien quisiera probar.
 */
export function applyTheme(themeId: string, accent?: string | null): void {
  const theme = getTheme(themeId);
  const root = document.documentElement;

  for (const [name, value] of Object.entries(theme.tokens)) {
    root.style.setProperty(`--${name}`, value);
  }

  if (accent) {
    root.style.setProperty('--brand', accent);
    // El hover se deriva aclarando el acento, en vez de pedir dos colores:
    // nadie quiere elegir a mano el tono de hover de su color de marca.
    root.style.setProperty('--brand-hover', lighten(accent, 0.15));
  }

  // `color-scheme` le dice al navegador cómo pintar lo que no controlamos:
  // barras de scroll nativas, autocompletado de formularios y controles del
  // sistema. Sin esto, un tema claro conserva scrollbars oscuros.
  root.style.colorScheme = isLight(theme.tokens.background) ? 'light' : 'dark';
}

/**
 * ¿Es un color claro?
 *
 * Por luminancia percibida, no por comparación de cadenas: `'#f7f7f8'` y
 * `'#121212'` son strings y compararlos como tales da resultados
 * arbitrarios. Los coeficientes 0.299/0.587/0.114 son los de la norma
 * ITU-R BT.601 — el verde pesa más porque el ojo lo percibe más brillante.
 */
function isLight(hex: string): boolean {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return false;

  const [r, g, b] = [0, 2, 4].map((offset) => parseInt(normalized.slice(offset, offset + 2), 16));
  return 0.299 * r! + 0.587 * g! + 0.114 * b! > 128;
}

/** Aclara un color HEX hacia el blanco. */
export function lighten(hex: string, amount: number): string {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return hex;

  const channels = [0, 2, 4].map((offset) => {
    const value = parseInt(normalized.slice(offset, offset + 2), 16);
    return Math.round(value + (255 - value) * amount);
  });

  return `#${channels.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

export interface StoredThemePreference {
  themeId: string;
  accent: string | null;
}

/**
 * Lee la preferencia guardada.
 *
 * Todo en try/catch: en ventana privada o con el almacenamiento bloqueado,
 * `localStorage` lanza al leerlo, y un panel que no arranca por no poder
 * recordar un color sería absurdo.
 */
export function readThemePreference(): StoredThemePreference {
  try {
    return {
      themeId: localStorage.getItem(STORAGE_KEY) ?? DEFAULT_THEME_ID,
      accent: localStorage.getItem(ACCENT_KEY),
    };
  } catch {
    return { themeId: DEFAULT_THEME_ID, accent: null };
  }
}

export function saveThemePreference({ themeId, accent }: StoredThemePreference): void {
  try {
    localStorage.setItem(STORAGE_KEY, themeId);
    if (accent) localStorage.setItem(ACCENT_KEY, accent);
    else localStorage.removeItem(ACCENT_KEY);
  } catch {
    // Sin almacenamiento el tema no sobrevive a la recarga, pero la sesión
    // actual funciona igual.
  }
}
