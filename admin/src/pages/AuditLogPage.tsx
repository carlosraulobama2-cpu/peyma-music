import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { AdminShell } from '../components/AdminShell';
import { ACTION_LABELS, formatWhen } from '../lib/audit';
import { fetchAuditPage, type AuditFilters, type AuditPage } from '../lib/users';

const TARGET_TYPES = ['artist', 'track', 'editorial', 'user', 'setting', 'genre', 'tracks', 'artists', 'users'];

/**
 * Bitácora completa: la versión filtrable y paginada del cajón lateral
 * (AuditDrawer), que sólo enseña las últimas 20. Para "¿quién aprobó esta
 * pista?" o "¿qué hizo tal admin la semana pasada?" hace falta poder
 * buscar, no sólo mirar lo más reciente.
 */
export function AuditLogPage() {
  const [filters, setFilters] = useState<AuditFilters>({ page: 1 });
  const [data, setData] = useState<AuditPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback((current: AuditFilters) => {
    setLoading(true);
    fetchAuditPage(current)
      .then((res) => {
        setData(res);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'No se pudo cargar la bitácora.'))
      .finally(() => setLoading(false));
  }, []);

  // Rebote en los filtros de texto; la página vuelve a 1 en cada cambio de filtro (salvo el propio paginado).
  useEffect(() => {
    const timer = setTimeout(() => load(filters), 250);
    return () => clearTimeout(timer);
  }, [filters, load]);

  const setFilter = <K extends keyof AuditFilters>(key: K, value: AuditFilters[K]) =>
    setFilters((current) => ({ ...current, [key]: value, page: key === 'page' ? current.page : 1 }));

  return (
    <AdminShell title="Bitácora de auditoría" subtitle="Cada acción con consecuencias, quién la hizo y cuándo">
      {error && (
        <p role="alert" className="mb-6 rounded-xl bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      <div className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-white/10 bg-surface p-4">
        <label className="flex min-w-48 flex-1 flex-col gap-1.5 text-xs font-semibold text-muted">
          Correo de quien actuó
          <input
            value={filters.actorEmail ?? ''}
            onChange={(e) => setFilter('actorEmail', e.target.value || undefined)}
            placeholder="admin@peyma.music"
            className="rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm font-normal text-foreground outline-none focus:border-brand"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted">
          Acción
          <select
            value={filters.action ?? ''}
            onChange={(e) => setFilter('action', e.target.value || undefined)}
            className="w-56 rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm font-normal text-foreground outline-none focus:border-brand"
          >
            <option value="">Todas</option>
            {(data?.availableActions ?? []).map((action) => (
              <option key={action} value={action}>
                {ACTION_LABELS[action] ?? action}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted">
          Tipo de objeto
          <select
            value={filters.targetType ?? ''}
            onChange={(e) => setFilter('targetType', e.target.value || undefined)}
            className="w-36 rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm font-normal text-foreground outline-none focus:border-brand"
          >
            <option value="">Todos</option>
            {TARGET_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted">
          Desde
          <input
            type="date"
            value={filters.from?.slice(0, 10) ?? ''}
            onChange={(e) => setFilter('from', e.target.value ? new Date(e.target.value).toISOString() : undefined)}
            className="rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm font-normal text-foreground outline-none focus:border-brand"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted">
          Hasta
          <input
            type="date"
            value={filters.to?.slice(0, 10) ?? ''}
            onChange={(e) => setFilter('to', e.target.value ? new Date(e.target.value).toISOString() : undefined)}
            className="rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm font-normal text-foreground outline-none focus:border-brand"
          />
        </label>
      </div>

      {loading && !data ? (
        <div className="flex flex-col gap-2">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl border border-white/10 bg-surface" />
          ))}
        </div>
      ) : !data || data.entries.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/15 px-5 py-12 text-center text-sm text-muted">
          Ninguna acción coincide con estos filtros.
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {data.entries.map((entry) => (
              <li key={entry.id} className="rounded-xl border border-white/10 bg-surface px-4 py-3">
                <p className="text-sm">
                  <span className="font-semibold">{ACTION_LABELS[entry.action] ?? entry.action}</span>{' '}
                  {entry.targetLabel && <span className="text-brand">{entry.targetLabel}</span>}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {entry.actorEmail} · {formatWhen(entry.createdAt)}
                  {entry.ipAddress && ` · ${entry.ipAddress}`}
                </p>
                {entry.metadata != null && (
                  <p className="mt-1 truncate font-mono text-[11px] text-muted">{JSON.stringify(entry.metadata)}</p>
                )}
              </li>
            ))}
          </ul>

          <div className="mt-6 flex items-center justify-between text-sm text-muted">
            <span>
              {data.pagination.total} acción(es) · página {data.pagination.page} de {data.pagination.totalPages || 1}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setFilter('page', Math.max(1, (filters.page ?? 1) - 1))}
                disabled={(filters.page ?? 1) <= 1}
                className="flex items-center gap-1 rounded-full border border-white/20 px-3 py-1.5 text-xs font-semibold transition-colors hover:border-white disabled:opacity-40"
              >
                <ChevronLeft size={13} aria-hidden />
                Anterior
              </button>
              <button
                type="button"
                onClick={() => setFilter('page', (filters.page ?? 1) + 1)}
                disabled={(filters.page ?? 1) >= data.pagination.totalPages}
                className="flex items-center gap-1 rounded-full border border-white/20 px-3 py-1.5 text-xs font-semibold transition-colors hover:border-white disabled:opacity-40"
              >
                Siguiente
                <ChevronRight size={13} aria-hidden />
              </button>
            </div>
          </div>
        </>
      )}
    </AdminShell>
  );
}
