import {
  LayoutDashboard,
  ShieldCheck,
  Users,
  UploadCloud,
  Cpu,
  LayoutList,
  UserCog,
  TrendingUp,
  Headphones,
  ListMusic,
  Music4,
  Settings,
  Flag,
  BadgeCheck,
  Activity,
  ScrollText,
  Download,
  Disc3,
  type LucideIcon,
} from 'lucide-react';

/**
 * Secciones del panel, declaradas una sola vez.
 *
 * Viven en su propio módulo y no junto al shell por dos motivos: la paleta de
 * comandos también las necesita (y no debe importar el shell, que la importa
 * a ella), y exportar constantes desde un archivo de componentes rompe el
 * fast refresh de Vite.
 *
 * Al añadir una sección hay que tocar además la tabla de rutas de `App.tsx`.
 */
/** Categoría bajo la que se agrupa cada sección en la barra lateral. */
export type NavGroup = 'Resumen' | 'Moderación' | 'Catálogo' | 'Audiencia' | 'Sistema';

export interface NavSection {
  to: string;
  label: string;
  icon: LucideIcon;
  description: string;
  group: NavGroup;
}

/**
 * Orden de las categorías en la barra lateral — no es alfabético, es por
 * frecuencia de uso: lo que se mira todos los días (Resumen, Moderación) va
 * arriba, lo que se consulta una vez por semana (Sistema) al fondo.
 */
export const NAV_GROUP_ORDER: readonly NavGroup[] = ['Resumen', 'Moderación', 'Catálogo', 'Audiencia', 'Sistema'];

export const NAV_SECTIONS: readonly NavSection[] = [
  { to: '/dashboard', label: 'Tablero', icon: LayoutDashboard, description: 'Métricas en vivo y catálogo', group: 'Resumen' },
  { to: '/moderation', label: 'Moderación', icon: ShieldCheck, description: 'Pistas esperando aprobación', group: 'Moderación' },
  { to: '/releases', label: 'Lanzamientos', icon: Disc3, description: 'EP y álbumes nuevos, agrupados', group: 'Moderación' },
  { to: '/reports', label: 'Denuncias', icon: Flag, description: 'Canciones reportadas por plagio u otros motivos', group: 'Moderación' },
  { to: '/verification', label: 'Verificación', icon: BadgeCheck, description: 'Candidatos al check azul, por actividad real', group: 'Moderación' },
  { to: '/artists', label: 'Artistas', icon: Users, description: 'Bloquear o eliminar artistas', group: 'Catálogo' },
  { to: '/editorial', label: 'Secciones', icon: LayoutList, description: 'Lo nuevo, Mola, Los mejores álbumes', group: 'Catálogo' },
  { to: '/playlists', label: 'Playlists', icon: ListMusic, description: 'Listas de los usuarios', group: 'Catálogo' },
  { to: '/genres', label: 'Ritmos', icon: Music4, description: 'Drill, Trap, Amapiano…', group: 'Catálogo' },
  { to: '/upload', label: 'Subir canción', icon: UploadCloud, description: 'Ingesta de audio y metadatos', group: 'Catálogo' },
  { to: '/trending', label: 'Tendencias', icon: TrendingUp, description: 'El número 1 y el top de la plataforma', group: 'Audiencia' },
  { to: '/audience', label: 'Audiencia', icon: Headphones, description: 'Horas escuchadas, búsquedas y altas fallidas', group: 'Audiencia' },
  { to: '/users', label: 'Usuarios', icon: UserCog, description: 'Cuentas y roles', group: 'Sistema' },
  { to: '/jobs', label: 'Procesamiento', icon: Cpu, description: 'Cola de waveform, loudness y transcodificación', group: 'Sistema' },
  { to: '/system', label: 'Estado del sistema', icon: Activity, description: 'Base de datos, almacenamiento, ffmpeg', group: 'Sistema' },
  { to: '/audit', label: 'Auditoría', icon: ScrollText, description: 'Bitácora completa, filtrable', group: 'Sistema' },
  { to: '/export', label: 'Exportar', icon: Download, description: 'Catálogo completo en CSV', group: 'Sistema' },
  { to: '/settings', label: 'Ajustes', icon: Settings, description: 'Mantenimiento, audio, moderación', group: 'Sistema' },
] as const;
