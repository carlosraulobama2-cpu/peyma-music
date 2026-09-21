import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Eye,
  EyeOff,
  LoaderCircle,
  Lock,
  ServerCrash,
  ShieldCheck,
  ShieldX,
  WifiOff,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { AuthError, type AuthErrorKind } from '../lib/authContext';
import { NAV_SECTIONS } from '../lib/navigation';

/**
 * Entrada al panel.
 *
 * Dos columnas y no una tarjeta suelta: esta pantalla la abre gente que
 * llega desde un enlace ("mirá esta denuncia") y necesita saber en un
 * vistazo dónde cayó y por qué le piden credenciales distintas a las de la
 * app. La columna izquierda responde eso; la derecha es el formulario.
 *
 * En móvil la columna de contexto se esconde: ahí el formulario es lo único
 * que importa y el texto de apoyo sólo empujaría los campos fuera de la
 * pantalla.
 */

/** Adónde ir si no se venía de ninguna parte. */
const DESTINO_POR_DEFECTO = '/moderation';

/**
 * Cómo se presenta cada causa de fallo.
 *
 * En una tabla y no en una cadena de `if` dentro del JSX porque lo que
 * cambia entre casos no es sólo el texto: también el color (un 429 no es un
 * error del usuario) y si tiene sentido volver a intentar enseguida.
 */
const ERRORES: Record<AuthErrorKind, { icon: LucideIcon; tono: string; ayuda: string }> = {
  credentials: {
    icon: AlertTriangle,
    tono: 'border-danger/30 bg-danger/10 text-danger',
    ayuda: 'Revisá el correo y la contraseña.',
  },
  forbidden: {
    icon: ShieldX,
    tono: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
    ayuda: 'Pedile a otro administrador que te asigne el rol desde Usuarios.',
  },
  'rate-limited': {
    icon: Lock,
    tono: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
    ayuda: 'Se bloquean los intentos por unos minutos para frenar ataques de fuerza bruta.',
  },
  network: {
    icon: WifiOff,
    tono: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
    ayuda: 'Comprobá que la API esté levantada y que VITE_API_URL apunte a ella.',
  },
  server: {
    icon: ServerCrash,
    tono: 'border-danger/30 bg-danger/10 text-danger',
    ayuda: 'Probá de nuevo en un momento. Si sigue, mirá los logs de la API.',
  },
};

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isSubmitting, user, isLoading } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verPassword, setVerPassword] = useState(false);
  const [bloqMayus, setBloqMayus] = useState(false);
  const [error, setError] = useState<AuthError | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  /**
   * De dónde venía quien fue expulsado al login (lo deja RequireAdminRoute).
   * Se descartan destinos que no sean una ruta interna: `state` viaja en el
   * historial del navegador y se puede manipular, y un `//evil.com` acá
   * sería una redirección abierta.
   */
  const solicitado = (location.state as { from?: unknown } | null)?.from;
  const destino =
    typeof solicitado === 'string' && solicitado.startsWith('/') && !solicitado.startsWith('//')
      ? solicitado
      : DESTINO_POR_DEFECTO;

  if (!isLoading && user?.role === 'ADMIN') {
    return <Navigate to={destino} replace />;
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await login(email, password);
      navigate(destino, { replace: true });
    } catch (err) {
      const fallo = err instanceof AuthError ? err : new AuthError('No se pudo iniciar sesión.', 'server');
      setError(fallo);
      // Se limpia la contraseña y NO el correo: reescribir el correo entero
      // en cada intento fallido es la parte molesta, y dejar la contraseña
      // puesta invita a reenviar la misma sin mirar.
      setPassword('');
      passwordRef.current?.focus();
    }
  };

  /**
   * Aviso de Bloq Mayús.
   *
   * Es la causa más común de "la contraseña es correcta y no entra", y con
   * el campo enmascarado no hay forma de darse cuenta. `getModifierState` lo
   * informa el propio evento de teclado; no hay que rastrear nada.
   */
  const detectarMayus = (event: KeyboardEvent<HTMLInputElement>) => {
    setBloqMayus(event.getModifierState('CapsLock'));
  };

  const detalleError = error ? ERRORES[error.kind] : null;
  const ErrorIcon = detalleError?.icon;

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden lg:flex-row">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(700px circle at 15% 0%, rgba(29,185,84,0.18), transparent 55%), radial-gradient(600px circle at 95% 100%, rgba(29,185,84,0.08), transparent 55%)',
        }}
      />

      {/* --------------------------------------------------------------
          Contexto. Explica qué es este panel y qué se puede hacer, para
          que nadie confunda esta pantalla con el login de la app.
      -------------------------------------------------------------- */}
      <aside className="hidden flex-1 flex-col justify-between border-r border-white/5 p-12 lg:flex xl:p-16">
        <div className="text-xl font-bold tracking-tight">
          Peyma <span className="font-normal text-muted">/ Admin</span>
        </div>

        <div className="max-w-md">
          <h2 className="text-4xl font-extrabold tracking-tight text-balance">
            El panel donde se decide qué se publica
          </h2>
          <p className="mt-5 text-muted">
            Moderación de subidas, denuncias de oyentes, catálogo, secciones de la portada y métricas en vivo. Todo lo
            que la app y la web muestran sale de acá.
          </p>

          <ul className="mt-9 grid grid-cols-2 gap-x-6 gap-y-3">
            {NAV_SECTIONS.map(({ to, label, icon: Icon }) => (
              <li key={to} className="flex items-center gap-2.5 text-sm text-muted">
                <Icon size={15} aria-hidden className="shrink-0" />
                {label}
              </li>
            ))}
          </ul>
        </div>

        <p className="flex items-center gap-2 text-xs text-muted">
          <ShieldCheck size={14} aria-hidden />
          Acceso restringido a cuentas con rol de administrador.
        </p>
      </aside>

      {/* --------------------------------------------------------------
          Formulario.
      -------------------------------------------------------------- */}
      <main className="flex flex-1 items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center text-xl font-bold tracking-tight lg:hidden">
            Peyma <span className="font-normal text-muted">/ Admin</span>
          </div>

          <h1 className="text-2xl font-bold">Iniciar sesión</h1>
          <p className="mt-1.5 text-sm text-muted">
            Usá tu cuenta de Peyma. Tiene que tener permisos de administrador.
          </p>

          <form onSubmit={handleSubmit} noValidate className="mt-8 flex flex-col gap-4" aria-busy={isSubmitting}>
            <label className="flex flex-col gap-2 text-sm font-semibold">
              Correo electrónico
              <input
                type="email"
                required
                autoFocus
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={error?.kind === 'credentials'}
                aria-describedby={error ? 'login-error' : undefined}
                placeholder="tu@correo.com"
                className="rounded-lg border border-white/15 bg-black/25 px-4 py-3 text-sm font-normal outline-none transition-colors focus:border-brand"
              />
            </label>

            <label className="flex flex-col gap-2 text-sm font-semibold">
              Contraseña
              {/* El ojo va DENTRO del campo (posicionado) en vez de al lado:
                  puesto al lado, el input se encoge y los dos campos dejan
                  de tener el mismo ancho. */}
              <div className="relative">
                <input
                  ref={passwordRef}
                  type={verPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyUp={detectarMayus}
                  onBlur={() => setBloqMayus(false)}
                  aria-invalid={error?.kind === 'credentials'}
                  aria-describedby={error ? 'login-error' : undefined}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-white/15 bg-black/25 py-3 pl-4 pr-12 text-sm font-normal outline-none transition-colors focus:border-brand"
                />
                <button
                  type="button"
                  onClick={() => setVerPassword((visible) => !visible)}
                  // `tabIndex={-1}`: al tabular desde la contraseña se quiere
                  // llegar al botón de entrar, no a este.
                  tabIndex={-1}
                  aria-label={verPassword ? 'Ocultar la contraseña' : 'Mostrar la contraseña'}
                  className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-muted transition-colors hover:text-foreground"
                >
                  {verPassword ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
                </button>
              </div>
            </label>

            {bloqMayus && (
              <p className="flex items-center gap-2 text-xs font-semibold text-amber-400" role="status">
                <AlertTriangle size={13} aria-hidden />
                Bloq Mayús está activado.
              </p>
            )}

            {error && detalleError && ErrorIcon && (
              <div
                id="login-error"
                role="alert"
                className={`flex gap-2.5 rounded-lg border px-3.5 py-3 text-sm ${detalleError.tono}`}
              >
                <ErrorIcon size={16} aria-hidden className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold">{error.message}</p>
                  <p className="mt-0.5 text-xs opacity-80">{detalleError.ayuda}</p>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting || email.trim() === '' || password === ''}
              className="mt-2 flex items-center justify-center gap-2 rounded-full bg-brand py-3.5 text-base font-bold text-black transition-all duration-300 ease-in-out hover:scale-[1.02] hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
            >
              {isSubmitting && <LoaderCircle size={17} aria-hidden className="animate-spin" />}
              {isSubmitting ? 'Entrando…' : 'Entrar al panel'}
            </button>
          </form>

          <p className="mt-8 text-center text-xs leading-relaxed text-muted">
            ¿Es la primera vez? Un administrador tiene que darte el rol, o se crea la cuenta desde el servidor con{' '}
            <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[11px]">npm run admin:create</code>.
          </p>
        </div>
      </main>
    </div>
  );
}
