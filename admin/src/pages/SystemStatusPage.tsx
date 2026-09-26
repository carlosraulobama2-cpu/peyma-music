import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Database, HardDrive, AudioWaveform, AlertTriangle, Clock } from 'lucide-react';
import { AdminShell } from '../components/AdminShell';
import { fetchSystemStatus, type SystemStatus } from '../lib/system';

/**
 * Estado del sistema: lo que un admin necesita ver ANTES de que un artista
 * escriba para avisar que "algo no anda". Todo lo que muestra ya se puede
 * inferir con paciencia de otras pantallas (Procesamiento, Ajustes) — esto
 * lo junta en un solo vistazo.
 */

const REFRESH_MS = 15_000;

function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

interface StatusRowProps {
  icon: typeof Database;
  label: string;
  ok: boolean;
  detail: string;
}

function StatusRow({ icon: Icon, label, ok, detail }: StatusRowProps) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-white/10 bg-surface p-4">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${ok ? 'bg-brand/15 text-brand' : 'bg-danger/15 text-danger'}`}>
        <Icon size={18} aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-bold">
          {label}
          <span className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-brand' : 'bg-danger'}`} aria-hidden />
        </p>
        <p className="truncate text-xs text-muted">{detail}</p>
      </div>
    </div>
  );
}

export function SystemStatusPage() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchSystemStatus()
      .then((data) => {
        setStatus(data);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'No se pudo consultar el estado.'));
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <AdminShell
      title="Estado del sistema"
      subtitle="Base de datos, almacenamiento y cola de procesamiento — se refresca solo"
      actions={
        <button
          type="button"
          onClick={load}
          className="flex items-center gap-2 rounded-full border border-white/20 px-3 py-1.5 text-sm font-semibold transition-colors hover:border-white"
        >
          <RefreshCw size={14} aria-hidden />
          <span className="hidden sm:inline">Refrescar</span>
        </button>
      }
    >
      {error && (
        <p role="alert" className="mb-6 rounded-xl bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      {!status ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl border border-white/10 bg-surface" />
          ))}
        </div>
      ) : (
        <div className="flex max-w-3xl flex-col gap-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <StatusRow
              icon={Database}
              label="Base de datos"
              ok={status.database.ok}
              detail={status.database.ok ? `Responde en ${status.database.latencyMs} ms` : 'Sin conexión'}
            />
            <StatusRow
              icon={HardDrive}
              label="Almacenamiento de archivos"
              ok={status.objectStorage.enabled}
              detail={status.objectStorage.enabled ? 'Bucket configurado (S3/R2)' : 'Disco local — se pierde en cada despliegue'}
            />
            <StatusRow
              icon={AudioWaveform}
              label="ffmpeg (procesamiento de audio)"
              ok={status.ffmpeg.available}
              detail={status.ffmpeg.available ? 'Disponible' : 'No disponible — el procesamiento fallará'}
            />
            <StatusRow
              icon={AlertTriangle}
              label="Trabajos fallidos (24 h)"
              ok={status.jobs.failedLast24h === 0}
              detail={
                status.jobs.failedLast24h === 0
                  ? 'Ninguno'
                  : `${status.jobs.failedLast24h} trabajo(s) — revisá Procesamiento`
              }
            />
          </div>

          <div className="rounded-xl border border-white/10 bg-surface p-4">
            <p className="flex items-center gap-2 text-sm font-bold">
              <Clock size={15} aria-hidden />
              Cola de procesamiento
            </p>
            <p className="mt-1 text-xs text-muted">
              Trabajo en cola más antiguo: {formatWhen(status.jobs.oldestQueuedAt)}
              {status.jobs.oldestQueuedAt && ' — si lleva mucho ahí, el worker puede estar caído.'}
            </p>
          </div>

          {status.uploads.stuckAnalyzing > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
              <p className="text-sm font-bold text-amber-400">
                {status.uploads.stuckAnalyzing} borrador(es) llevan más de 24 h en &ldquo;Analizando&rdquo;
              </p>
              <p className="mt-1 text-xs text-muted">
                Probablemente un trabajo se perdió antes de terminar. El artista los ve como &ldquo;subiendo&rdquo; sin avanzar.
              </p>
            </div>
          )}
        </div>
      )}
    </AdminShell>
  );
}
