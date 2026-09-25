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
export interface NavSection {
  to: string;
  label: string;
  icon: LucideIcon;
  description: string;
}

export const NAV_SECTIONS: readonly NavSection[] = [
  { to: '/dashboard', label: 'Tablero', icon: LayoutDashboard, description: 'Métricas en vivo y catálogo' },
  { to: '/moderation', label: 'Moderación', icon: ShieldCheck, description: 'Pistas esperando aprobación' },
  { to: '/reports', label: 'Denuncias', icon: Flag, description: 'Canciones reportadas por plagio u otros motivos' },
  { to: '/artists', label: 'Artistas', icon: Users, description: 'Bloquear o eliminar artistas' },
  { to: '/verification', label: 'Verificación', icon: BadgeCheck, description: 'Candidatos al check azul, por actividad real' },
  { to: '/trending', label: 'Tendencias', icon: TrendingUp, description: 'El número 1 y el top de la plataforma' },
  { to: '/audience', label: 'Audiencia', icon: Headphones, description: 'Horas escuchadas, búsquedas y altas fallidas' },
  { to: '/editorial', label: 'Secciones', icon: LayoutList, description: 'Lo nuevo, Mola, Los mejores álbumes' },
  { to: '/playlists', label: 'Playlists', icon: ListMusic, description: 'Listas de los usuarios' },
  { to: '/genres', label: 'Ritmos', icon: Music4, description: 'Drill, Trap, Amapiano…' },
  { to: '/users', label: 'Usuarios', icon: UserCog, description: 'Cuentas y roles' },
  { to: '/upload', label: 'Subir canción', icon: UploadCloud, description: 'Ingesta de audio y metadatos' },
  { to: '/jobs', label: 'Procesamiento', icon: Cpu, description: 'Cola de waveform, loudness y transcodificación' },
  { to: '/system', label: 'Estado del sistema', icon: Activity, description: 'Base de datos, almacenamiento, ffmpeg' },
  { to: '/audit', label: 'Auditoría', icon: ScrollText, description: 'Bitácora completa, filtrable' },
  { to: '/export', label: 'Exportar', icon: Download, description: 'Catálogo completo en CSV' },
  { to: '/settings', label: 'Ajustes', icon: Settings, description: 'Mantenimiento, audio, moderación' },
] as const;
