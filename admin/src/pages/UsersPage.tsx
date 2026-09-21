import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, User as UserIcon, Mic2, Download } from 'lucide-react';
import { AdminShell } from '../components/AdminShell';
import { fetchUsers, setUserRole, type AdminUser, type UserRole } from '../lib/users';
import { toCsv, downloadCsv, datedFilename } from '../lib/csv';

/**
 * Gestión de cuentas.
 *
 * El único cambio que se puede hacer desde aquí es el rol. Suspender, banear
 * o borrar cuentas se dejó fuera a propósito: son acciones con implicaciones
 * legales (RGPD) que necesitan su propio flujo de retención y notificación,
 * y un botón que sólo ponga un booleano daría la falsa sensación de que eso
 * ya está resuelto.
 */

const ROLE_META: Record<UserRole, { label: string; icon: typeof UserIcon; className: string }> = {
  USER: { label: 'Oyente', icon: UserIcon, className: 'bg-white/10 text-muted' },
  ARTIST: { label: 'Artista', icon: Mic2, className: 'bg-sky-500/15 text-sky-300' },
  ADMIN: { label: 'Admin', icon: ShieldCheck, className: 'bg-brand/15 text-brand' },
};

const ROLES = Object.keys(ROLE_META) as UserRole[];

export function UsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback((term: string) => {
    setLoading(true);
    fetchUsers(term)
      .then((res) => {
        setUsers(res.users);
        setTotal(res.pagination.total);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'No se pudieron cargar los usuarios.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    // Rebote: cada tecla no debe disparar una consulta.
    const timer = setTimeout(() => load(search), 250);
    return () => clearTimeout(timer);
  }, [search, load]);

  const changeRole = async (user: AdminUser, role: UserRole) => {
    setBusyId(user.id);
    try {
      await setUserRole(user.id, role);
      load(search);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar el rol.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AdminShell
      title="Usuarios"
      subtitle={`${total} cuenta(s) registrada(s)`}
      actions={
        <button
          type="button"
          disabled={users.length === 0}
          onClick={() =>
            downloadCsv(
              datedFilename('usuarios'),
              toCsv(users, [
                { header: 'Nombre', value: (r) => r.displayName },
                { header: 'Correo', value: (r) => r.email },
                { header: 'Rol', value: (r) => ROLE_META[r.role].label },
                { header: 'Google', value: (r) => (r.usesGoogle ? 'si' : 'no') },
                { header: 'Reproducciones', value: (r) => r._count.streamLogs },
                { header: 'Playlists', value: (r) => r._count.playlists },
                { header: 'Alta', value: (r) => r.createdAt },
              ]),
            )
          }
          className="flex items-center gap-2 rounded-full border border-white/20 px-3 py-1.5 text-sm font-semibold transition-colors hover:border-white disabled:opacity-40"
        >
          <Download size={14} aria-hidden />
          <span className="hidden sm:inline">Exportar CSV</span>
        </button>
      }
    >
      {error && (
        <p role="alert" className="mb-6 rounded-xl bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar por correo o nombre…"
        className="mb-6 w-full max-w-md rounded-lg border border-white/15 bg-black/20 px-4 py-2.5 text-sm outline-none focus:border-brand"
      />

      {loading ? (
        <div className="flex flex-col gap-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl border border-white/10 bg-surface" />
          ))}
        </div>
      ) : users.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/15 px-5 py-12 text-center text-sm text-muted">
          Ningún usuario coincide con la búsqueda.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {users.map((user) => {
            const meta = ROLE_META[user.role];
            const Icon = meta.icon;
            return (
              <li
                key={user.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-surface px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{user.displayName}</p>
                  <p className="truncate text-xs text-muted">
                    {user.email}
                    {user.usesGoogle && <span className="ml-2 rounded bg-white/10 px-1.5 py-0.5 text-[10px]">Google</span>}
                  </p>
                </div>

                <div className="hidden shrink-0 gap-4 font-mono text-[11px] text-muted sm:flex">
                  <span>{user._count.streamLogs} repr.</span>
                  <span>{user._count.playlists} listas</span>
                  <span>{user._count.favorites} favs</span>
                </div>

                <span className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${meta.className}`}>
                  <Icon size={12} aria-hidden />
                  {meta.label}
                </span>

                <select
                  value={user.role}
                  onChange={(e) => changeRole(user, e.target.value as UserRole)}
                  disabled={busyId === user.id}
                  aria-label={`Rol de ${user.displayName}`}
                  className="shrink-0 rounded-lg border border-white/15 bg-black/20 px-2 py-1.5 text-xs outline-none focus:border-brand disabled:opacity-50"
                >
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_META[role].label}
                    </option>
                  ))}
                </select>
              </li>
            );
          })}
        </ul>
      )}
    </AdminShell>
  );
}
