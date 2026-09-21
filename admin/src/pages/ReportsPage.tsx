import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Flag, Ban, Trash2, Check, Eye, AlertTriangle, BadgeCheck } from 'lucide-react';
import { AdminShell } from '../components/AdminShell';
import { CoverImage } from '../components/CoverImage';
import { AudioPreview } from '../components/AudioPreview';
import { ConfirmDialog } from '../components/ConfirmDialog';
import {
  fetchReports,
  resolveReport,
  REASON_LABELS,
  STATUS_LABELS,
  type TrackReport,
  type ReportStatus,
} from '../lib/reports';

/**
 * Bandeja de denuncias.
 *
 * El moderador puede escuchar la canción denunciada aquí mismo, por la misma
 * ruta de preview que usa la cola de revisión: decidir sobre un plagio sin
 * poder oír la pista no tiene sentido.
 *
 * Tres desenlaces: desestimar, bloquear (reversible — la canción desaparece
 * del catálogo y deja de sonar, pero se puede restaurar) o borrar
 * (definitivo). Bloquear es el camino por defecto ante una denuncia todavía
 * discutible.
 */

const FILTERS: { value: ReportStatus | 'ALL'; label: string }[] = [
  { value: 'OPEN', label: 'Sin revisar' },
  { value: 'REVIEWING', label: 'En revisión' },
  { value: 'UPHELD', label: 'Aceptadas' },
  { value: 'DISMISSED', label: 'Desestimadas' },
  { value: 'ALL', label: 'Todas' },
];

const STATUS_STYLES: Record<ReportStatus, string> = {
  OPEN: 'bg-amber-500/15 text-amber-400',
  REVIEWING: 'bg-sky-500/15 text-sky-300',
  UPHELD: 'bg-danger/15 text-danger',
  DISMISSED: 'bg-white/10 text-muted',
};

export function ReportsPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<ReportStatus | 'ALL'>('OPEN');
  const [reports, setReports] = useState<TrackReport[] | null>(null);
  const [summary, setSummary] = useState<Partial<Record<ReportStatus, number>>>({});
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [pendingDelete, setPendingDelete] = useState<TrackReport | null>(null);

  const load = useCallback(() => {
    fetchReports(filter)
      .then((res) => {
        setReports(res.reports);
        setSummary(res.summary);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'No se pudieron cargar las denuncias.'));
  }, [filter]);

  useEffect(load, [load]);

  const act = async (report: TrackReport, status: ReportStatus, action: 'NONE' | 'BLOCK' | 'DELETE') => {
    setBusyId(report.id);
    try {
      await resolveReport(report.id, { status, action, note: notes[report.id] || undefined });
      setPendingDelete(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo resolver la denuncia.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AdminShell title="Denuncias" subtitle="Canciones reportadas por los usuarios desde la app y la web">
      {error && (
        <p role="alert" className="mb-6 rounded-xl bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      <div className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map((option) => {
          const count = option.value === 'ALL' ? undefined : summary[option.value];
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

      {!reports ? (
        <div className="flex flex-col gap-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-xl border border-white/10 bg-surface" />
          ))}
        </div>
      ) : reports.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-white/15 py-16 text-center">
          <Flag size={28} className="text-brand" aria-hidden />
          <p className="font-semibold">Nada que revisar</p>
          <p className="text-sm text-muted">No hay denuncias en este estado.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {reports.map((report) => (
            <li key={report.id} className="rounded-xl border border-white/10 bg-surface p-4">
              <div className="flex flex-wrap items-start gap-4">
                <CoverImage src={report.track.coverUrl} alt={report.track.title} size={80} rounded="rounded-lg" />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_STYLES[report.status]}`}>
                      {STATUS_LABELS[report.status]}
                    </span>
                    <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-bold">
                      {REASON_LABELS[report.reason]}
                    </span>
                    {report.totalReportsForTrack > 1 && (
                      <span className="flex items-center gap-1 rounded-full bg-danger/15 px-2.5 py-1 text-xs font-bold text-danger">
                        <AlertTriangle size={11} aria-hidden />
                        {report.totalReportsForTrack} denuncias sobre esta pista
                      </span>
                    )}
                    {report.track.isBlocked && (
                      <span className="rounded-full bg-danger/20 px-2.5 py-1 text-xs font-bold text-danger">BLOQUEADA</span>
                    )}
                  </div>

                  <p className="mt-2 truncate text-base font-semibold">{report.track.title}</p>
                  <p className="flex items-center gap-1.5 truncate text-sm text-muted">
                    <button
                      type="button"
                      onClick={() => navigate(`/artists?search=${encodeURIComponent(report.track.artist.name)}`)}
                      className="transition-colors hover:text-foreground hover:underline"
                    >
                      {report.track.artist.name}
                    </button>
                    {report.track.artist.isVerified && (
                      <BadgeCheck size={13} className="shrink-0 text-sky-400" aria-label="Verificado" />
                    )}
                    {report.track.genre && <span>· {report.track.genre}</span>}
                  </p>

                  {report.details && (
                    <p className="mt-2 rounded-lg bg-black/25 px-3 py-2 text-sm">
                      <span className="text-muted">Dice el denunciante:</span> {report.details}
                    </p>
                  )}

                  <p className="mt-2 text-xs text-muted">
                    {report.reporter ? `${report.reporter.displayName} (${report.reporter.email})` : 'cuenta eliminada'} ·{' '}
                    {new Date(report.createdAt).toLocaleString('es', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    {report.resolvedBy && ` · resuelta por ${report.resolvedBy.displayName}`}
                  </p>
                  {report.resolutionNote && (
                    <p className="mt-1 text-xs italic text-muted">Nota: {report.resolutionNote}</p>
                  )}
                </div>
              </div>

              {/* Escuchar la pista denunciada aquí mismo: decidir sobre un
                  plagio sin poder oírla no tiene sentido. */}
              <div className="mt-4 border-t border-white/5 pt-3">
                <AudioPreview trackId={report.track.id} durationHint={report.track.duration} />
              </div>

              {report.status !== 'UPHELD' && report.status !== 'DISMISSED' && (
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/5 pt-3">
                  <input
                    value={notes[report.id] ?? ''}
                    onChange={(e) => setNotes((prev) => ({ ...prev, [report.id]: e.target.value }))}
                    placeholder="Nota interna (queda en la bitácora)…"
                    className="min-w-48 flex-1 rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm outline-none focus:border-brand"
                  />

                  {report.status === 'OPEN' && (
                    <button
                      type="button"
                      onClick={() => act(report, 'REVIEWING', 'NONE')}
                      disabled={busyId === report.id}
                      className="flex items-center gap-1.5 rounded-full border border-white/25 px-3.5 py-2 text-xs font-semibold transition-colors hover:border-white disabled:opacity-50"
                    >
                      <Eye size={13} aria-hidden />
                      Estoy revisando
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => act(report, 'DISMISSED', 'NONE')}
                    disabled={busyId === report.id}
                    className="flex items-center gap-1.5 rounded-full border border-white/25 px-3.5 py-2 text-xs font-semibold transition-colors hover:border-white disabled:opacity-50"
                  >
                    <Check size={13} aria-hidden />
                    Desestimar
                  </button>

                  <button
                    type="button"
                    onClick={() => act(report, 'UPHELD', 'BLOCK')}
                    disabled={busyId === report.id}
                    className="flex items-center gap-1.5 rounded-full bg-amber-500/20 px-3.5 py-2 text-xs font-bold text-amber-400 transition-colors hover:bg-amber-500/30 disabled:opacity-50"
                  >
                    <Ban size={13} aria-hidden />
                    Bloquear canción
                  </button>

                  <button
                    type="button"
                    onClick={() => setPendingDelete(report)}
                    disabled={busyId === report.id}
                    className="flex items-center gap-1.5 rounded-full border border-danger/50 px-3.5 py-2 text-xs font-semibold text-danger transition-colors hover:border-danger disabled:opacity-50"
                  >
                    <Trash2 size={13} aria-hidden />
                    Eliminar
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title={`Eliminar "${pendingDelete.track.title}"`}
          message="La canción se borra del catálogo definitivamente, junto con su análisis, sus variantes y esta denuncia. No se puede deshacer. Si la denuncia todavía puede discutirse, usá «Bloquear»: la oculta igual pero es reversible."
          confirmLabel="Eliminar definitivamente"
          isSubmitting={busyId === pendingDelete.id}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => act(pendingDelete, 'UPHELD', 'DELETE')}
        />
      )}
    </AdminShell>
  );
}
