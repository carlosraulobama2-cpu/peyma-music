import { useState } from 'react';
import { Download, Music4, Users, UserCog } from 'lucide-react';
import { AdminShell } from '../components/AdminShell';
import { fetchExport, type ExportKind } from '../lib/exports';
import { toCsv, downloadCsv, datedFilename } from '../lib/csv';

/**
 * Exportación completa del catálogo.
 *
 * Distinto de los botones "Exportar CSV" que ya tienen Usuarios o
 * Tendencias (esos exportan sólo lo que hay cargado en pantalla, filtrado
 * o no): esto pide TODO al servidor — hasta el techo del backend — para
 * respaldo o análisis fuera del panel.
 */

const OPTIONS: { kind: ExportKind; label: string; description: string; icon: typeof Music4 }[] = [
  { kind: 'tracks', label: 'Canciones', description: 'Título, artista, álbum, estado, género, duración', icon: Music4 },
  { kind: 'artists', label: 'Artistas', description: 'Nombre, dueño, verificación, canciones, seguidores', icon: Users },
  { kind: 'users', label: 'Usuarios', description: 'Correo, nombre, rol, método de acceso', icon: UserCog },
];

export function ExportPage() {
  const [busy, setBusy] = useState<ExportKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runExport = async (kind: ExportKind) => {
    setBusy(kind);
    setError(null);
    try {
      const { rows } = await fetchExport(kind);
      if (rows.length === 0) {
        setError(`No hay filas para exportar en "${kind}".`);
        return;
      }
      const columns = Object.keys(rows[0]!).map((key) => ({ header: key, value: (row: Record<string, unknown>) => row[key] }));
      downloadCsv(datedFilename(kind), toCsv(rows, columns));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo exportar.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <AdminShell title="Exportar catálogo" subtitle="Descarga completa en CSV — para respaldo o análisis fuera del panel">
      {error && (
        <p role="alert" className="mb-6 rounded-xl bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
        {OPTIONS.map(({ kind, label, description, icon: Icon }) => (
          <div key={kind} className="flex flex-col gap-3 rounded-xl border border-white/10 bg-surface p-5">
            <div className="flex items-center gap-2 text-sm font-bold">
              <Icon size={16} aria-hidden />
              {label}
            </div>
            <p className="text-xs text-muted">{description}</p>
            <button
              type="button"
              onClick={() => runExport(kind)}
              disabled={busy === kind}
              className="mt-auto flex items-center justify-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-bold text-black transition-colors hover:bg-brand-hover disabled:opacity-50"
            >
              <Download size={14} aria-hidden />
              {busy === kind ? 'Exportando…' : 'Descargar CSV'}
            </button>
          </div>
        ))}
      </div>
    </AdminShell>
  );
}
