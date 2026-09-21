import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, RotateCcw } from 'lucide-react';
import { AdminShell } from '../components/AdminShell';
import { fetchJobs, retryJob, type JobsPage as JobsPayload, type JobStatus } from '../lib/metrics';

/**
 * Monitor de la cola de procesamiento.
 *
 * Muestra el estado real de los trabajos de ffmpeg (waveform, loudness,
 * transcodificación) con su error completo y un botón para reintentar. El
 * error se muestra entero y no recortado: el final del stderr de ffmpeg es
 * literalmente la razón por la que falló, y esconderlo obligaría a entrar
 * por SSH a leer los logs.
 */

const REFRESH_MS = 5000;

const STATUS_STYLES: Record<JobStatus, string> = {
  QUEUED: 'bg-white/10 text-muted',
  RUNNING: 'bg-sky-500/15 text-sky-300',
  COMPLETED: 'bg-brand/15 text-brand',
  FAILED: 'bg-danger/15 text-danger',
};

const FILTERS: { label: string; value: JobStatus | 'ALL' }[] = [
  { label: 'Todos', value: 'ALL' },
  { label: 'En cola', value: 'QUEUED' },
  { label: 'Corriendo', value: 'RUNNING' },
  { label: 'Completados', value: 'COMPLETED' },
  { label: 'Fallidos', value: 'FAILED' },
];

export function JobsPage() {
  const [filter, setFilter] = useState<JobStatus | 'ALL'>('ALL');
  const [data, setData] = useState<JobsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchJobs(filter === 'ALL' ? undefined : filter)
      .then((payload) => {
        setData(payload);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'No se pudo cargar la cola.'));
  }, [filter]);

  // Sondeo continuo: un trabajo de transcodificación tarda decenas de
  // segundos y la gracia de esta pantalla es ver cómo avanza.
  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const handleRetry = async (jobId: string) => {
    setRetrying(jobId);
    try {
      await retryJob(jobId);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo reintentar.');
    } finally {
      setRetrying(null);
    }
  };

  return (
    <AdminShell
      title="Procesamiento"
      subtitle="Cola de waveform, sonoridad y transcodificación"
      actions={
        <button
          type="button"
          onClick={load}
          className="flex items-center gap-2 rounded-full border border-white/20 px-3 py-1.5 text-sm font-semibold transition-colors hover:border-white"
        >
          <RefreshCw size={14} aria-hidden />
          <span className="hidden sm:inline">Actualizar</span>
        </button>
      }
    >
      {error && (
        <p role="alert" className="mb-6 rounded-xl bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      <div className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map((option) => {
          const count = option.value === 'ALL' ? undefined : data?.summary[option.value];
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setFilter(option.value)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                filter === option.value ? 'bg-white text-black' : 'bg-white/10 text-muted hover:text-foreground'
              }`}
            >
              {option.label}
              {count !== undefined && count > 0 && <span className="ml-1.5 tabular-nums opacity-70">{count}</span>}
            </button>
          );
        })}
      </div>

      {!data ? (
        <div className="flex flex-col gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl border border-white/10 bg-surface" />
          ))}
        </div>
      ) : data.jobs.length === 0 ? (
        <p className="rounded-xl border border-white/10 bg-surface px-5 py-10 text-center text-sm text-muted">
          No hay trabajos en este estado.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {data.jobs.map((job) => (
            <li key={job.id} className="rounded-xl border border-white/10 bg-surface p-4">
              {/* Columnas de ancho fijo. COMPLETED es casi el doble de ancho
                  que FAILED, así que con el ancho al contenido el tipo de
                  trabajo y el título de la pista empezaban en una posición
                  distinta en cada fila y la cola no se podía leer en vertical.
                  Lo mismo con los intentos y el botón de reintentar: se
                  reservan aunque no haya nada que poner. */}
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={`w-28 shrink-0 rounded-full px-2.5 py-1 text-center text-xs font-bold ${STATUS_STYLES[job.status]}`}
                >
                  {job.status}
                </span>
                <span className="w-24 shrink-0 font-mono text-xs font-semibold text-muted">{job.kind}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {job.track ? `${job.track.title} — ${job.track.artist.name}` : 'sin pista asociada'}
                </span>
                <span className="w-20 shrink-0 text-right text-xs text-muted">
                  {job.attempts > 1 ? `${job.attempts} intentos` : ''}
                </span>
                <span className="flex w-32 shrink-0 justify-end">
                  {job.status === 'FAILED' && (
                    <button
                      type="button"
                      onClick={() => handleRetry(job.id)}
                      disabled={retrying === job.id}
                      className="flex items-center gap-1.5 rounded-full border border-white/20 px-3 py-1 text-xs font-semibold transition-colors hover:border-white disabled:opacity-50"
                    >
                      <RotateCcw size={12} aria-hidden />
                      {retrying === job.id ? 'Reencolando…' : 'Reintentar'}
                    </button>
                  )}
                </span>
              </div>

              {job.errorMessage && (
                <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-black/40 p-3 text-xs text-danger">
                  {job.errorMessage}
                </pre>
              )}
              {job.status === 'COMPLETED' && job.result !== null && (
                <pre className="mt-3 overflow-auto rounded-lg bg-black/30 p-3 text-xs text-muted">
                  {JSON.stringify(job.result)}
                </pre>
              )}
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}
