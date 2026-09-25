import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { X, ScrollText } from 'lucide-react';
import { fetchAudit, type AuditEntry } from '../lib/users';
import { ACTION_LABELS, formatWhen } from '../lib/audit';

/**
 * Cajón lateral con las últimas acciones del panel.
 *
 * Se monta sólo cuando está abierto (lo controla el shell), así el estado se
 * reinicia solo y no hace falta limpiarlo desde un efecto.
 */

export function AuditDrawer({ onClose }: { onClose: () => void }) {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAudit(20)
      .then((res) => setEntries(res.entries))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'No se pudo cargar la bitácora.'));
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Cerrar bitácora" onClick={onClose} className="absolute inset-0 bg-black/60" />

      <aside
        role="dialog"
        aria-label="Bitácora de auditoría"
        className="relative flex w-full max-w-md flex-col border-l border-white/10 bg-surface shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <ScrollText size={16} aria-hidden />
            Últimas acciones
          </h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-muted hover:text-foreground">
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && <p className="text-sm font-semibold text-danger">{error}</p>}

          {!entries && !error && (
            <div className="flex flex-col gap-2">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-white/5" />
              ))}
            </div>
          )}

          {entries?.length === 0 && (
            <p className="py-10 text-center text-sm text-muted">Todavía no hay acciones registradas.</p>
          )}

          <ul className="flex flex-col gap-3">
            {entries?.map((entry) => (
              <li key={entry.id} className="border-b border-white/5 pb-3 last:border-0">
                <p className="text-sm">
                  <span className="font-semibold">{ACTION_LABELS[entry.action] ?? entry.action}</span>{' '}
                  {entry.targetLabel && <span className="text-brand">{entry.targetLabel}</span>}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {entry.actorEmail} · {formatWhen(entry.createdAt)}
                  {entry.ipAddress && ` · ${entry.ipAddress}`}
                </p>
                {entry.metadata != null && (
                  <p className="mt-1 font-mono text-[11px] text-muted">{JSON.stringify(entry.metadata)}</p>
                )}
              </li>
            ))}
          </ul>
        </div>

        <footer className="flex items-center justify-between border-t border-white/10 px-5 py-3 text-[11px] text-muted">
          <span>Registro de sólo lectura: no hay forma de editarlo ni borrarlo.</span>
          <Link to="/audit" onClick={onClose} className="shrink-0 font-semibold text-brand hover:underline">
            Ver todo →
          </Link>
        </footer>
      </aside>
    </div>
  );
}
