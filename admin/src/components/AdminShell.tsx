import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Search, LogOut, Menu, X, PanelLeftClose, PanelLeft, ScrollText, Palette } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { CommandPalette } from './CommandPalette';
import { AuditDrawer } from './AuditDrawer';
import { ThemePicker } from './ThemePicker';
import { NAV_SECTIONS } from '../lib/navigation';

/**
 * Shell del panel: barra lateral modular + cabecera.
 *
 * Existe para que las páginas no repitan la navegación. Antes cada página
 * llevaba su propia cabecera copiada, así que añadir una sección obligaba a
 * editar N archivos y era cuestión de tiempo que se desincronizaran. Ahora
 * las secciones se declaran una vez, en `NAV_SECTIONS`, y cada página sólo
 * aporta su contenido.
 */

const COLLAPSED_KEY = 'peyma-admin-sidebar-collapsed';

/** Segunda tecla de la secuencia `G` → destino, estilo GitHub. */
const SHORTCUTS: Record<string, string> = {
  h: '/dashboard',
  m: '/moderation',
  a: '/artists',
  u: '/users',
  s: '/upload',
  e: '/editorial',
  p: '/jobs',
  t: '/trending',
  o: '/audience',
  l: '/playlists',
  r: '/genres',
  c: '/settings',
  d: '/reports',
};

/** Lee la preferencia guardada. Va en el `useState` inicial para no parpadear. */
function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    // Ventana privada o almacenamiento bloqueado: se asume expandida.
    return false;
  }
}

interface AdminShellProps {
  title: string;
  subtitle?: string;
  /** Acciones a la derecha del título (botones propios de la página). */
  actions?: ReactNode;
  children: ReactNode;
}

export function AdminShell({ title, subtitle, actions, children }: AdminShellProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);

  /**
   * ¿Se pulsó `G` y estamos esperando la segunda tecla?
   *
   * En una ref y no en estado porque no se dibuja nada con ella: en estado
   * forzaría un render por cada pulsación de tecla.
   */
  const awaitingSecondKey = useRef(false);

  useEffect(() => {
    let resetTimer: ReturnType<typeof setTimeout>;

    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        // preventDefault porque Ctrl+K es "buscar en la barra" en varios
        // navegadores y si no, se abren las dos cosas a la vez.
        event.preventDefault();
        setPaletteOpen(true);
        return;
      }

      if (event.key === 'Escape') {
        setPaletteOpen(false);
        setAuditOpen(false);
        setThemeOpen(false);
        return;
      }

      // Nunca secuestrar teclas mientras se escribe en un campo: si no,
      // teclear "gm" en el buscador de artistas te sacaría de la página.
      const target = event.target as HTMLElement | null;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable === true;

      if (isTyping || event.metaKey || event.ctrlKey || event.altKey) return;

      if (awaitingSecondKey.current) {
        awaitingSecondKey.current = false;
        const destination = SHORTCUTS[event.key.toLowerCase()];
        if (destination) {
          event.preventDefault();
          navigate(destination);
        }
        return;
      }

      if (event.key.toLowerCase() === 'g') {
        awaitingSecondKey.current = true;
        // Si la segunda tecla no llega pronto se olvida: dejarlo armado
        // convertiría una "h" escrita minutos después en una navegación.
        clearTimeout(resetTimer);
        resetTimer = setTimeout(() => {
          awaitingSecondKey.current = false;
        }, 1500);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      clearTimeout(resetTimer);
    };
  }, [navigate]);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0');
    } catch {
      // Sin almacenamiento la preferencia no sobrevive a la recarga, pero la
      // sesión actual funciona igual. No vale la pena molestar con un aviso.
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen bg-background">
      {mobileNavOpen && (
        <button
          type="button"
          aria-label="Cerrar navegación"
          onClick={() => setMobileNavOpen(false)}
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r border-white/10 bg-surface/60 backdrop-blur-xl transition-all lg:static lg:translate-x-0 ${
          collapsed ? 'w-16' : 'w-64'
        } ${mobileNavOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex items-center justify-between px-4 py-5">
          {!collapsed && (
            <div className="text-base font-bold tracking-tight">
              Peyma <span className="font-normal text-muted">/ Admin</span>
            </div>
          )}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral'}
            className="hidden text-muted transition-colors hover:text-foreground lg:block"
          >
            {collapsed ? <PanelLeft size={17} /> : <PanelLeftClose size={17} />}
          </button>
          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            className="text-muted transition-colors hover:text-foreground lg:hidden"
            aria-label="Cerrar navegación"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3">
          {NAV_SECTIONS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setMobileNavOpen(false)}
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${
                  collapsed ? 'justify-center' : ''
                } ${isActive ? 'bg-white/10 text-foreground' : 'text-muted hover:bg-white/5 hover:text-foreground'}`
              }
            >
              <Icon size={18} aria-hidden />
              {!collapsed && label}
            </NavLink>
          ))}
        </nav>

        <div className="flex flex-col gap-2 border-t border-white/10 p-3">
          <button
            type="button"
            onClick={() => setThemeOpen(true)}
            title="Apariencia del panel"
            className={`flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-muted transition-colors hover:border-white/30 hover:text-foreground ${
              collapsed ? 'justify-center' : ''
            }`}
          >
            <Palette size={15} aria-hidden />
            {!collapsed && 'Apariencia'}
          </button>
          <button
            type="button"
            onClick={() => setAuditOpen(true)}
            title="Bitácora de acciones"
            className={`flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-muted transition-colors hover:border-white/30 hover:text-foreground ${
              collapsed ? 'justify-center' : ''
            }`}
          >
            <ScrollText size={15} aria-hidden />
            {!collapsed && 'Bitácora'}
          </button>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            title="Buscar (Ctrl+K)"
            className={`flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-muted transition-colors hover:border-white/30 hover:text-foreground ${
              collapsed ? 'justify-center' : ''
            }`}
          >
            <Search size={15} aria-hidden />
            {!collapsed && (
              <>
                Buscar…
                <kbd className="ml-auto rounded border border-white/15 px-1.5 py-0.5 text-[10px] font-semibold">Ctrl K</kbd>
              </>
            )}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-4 border-b border-white/10 bg-background/60 px-5 py-4 backdrop-blur-xl sm:px-8">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="text-muted transition-colors hover:text-foreground lg:hidden"
            aria-label="Abrir navegación"
          >
            <Menu size={20} />
          </button>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-bold">{title}</h1>
            {subtitle && <p className="mt-0.5 truncate text-sm text-muted">{subtitle}</p>}
          </div>

          {actions}

          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted sm:inline">{user?.displayName}</span>
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-2 rounded-full border border-white/20 px-3 py-1.5 text-sm font-semibold transition-colors hover:border-white"
            >
              <LogOut size={15} aria-hidden />
              <span className="hidden sm:inline">Salir</span>
            </button>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-5 py-8 sm:px-8">{children}</main>
      </div>

      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
      {auditOpen && <AuditDrawer onClose={() => setAuditOpen(false)} />}
      {themeOpen && <ThemePicker onClose={() => setThemeOpen(false)} />}
    </div>
  );
}
