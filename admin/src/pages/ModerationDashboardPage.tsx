import { AdminShell } from '../components/AdminShell';
import { usePendingTracks } from '../hooks/usePendingTracks';
import { useReviewTrack } from '../hooks/useReviewTrack';
import { ModerationTable } from '../components/ModerationTable';

export function ModerationDashboardPage() {
  const { tracks, loading, error: loadError, removeTrack } = usePendingTracks();
  const { pendingTrackId, approve, reject, error: actionError } = useReviewTrack();

  const handleApprove = async (trackId: string) => {
    if (await approve(trackId)) removeTrack(trackId);
  };

  const handleReject = async (trackId: string, reason: string) => {
    if (await reject(trackId, reason)) removeTrack(trackId);
  };

  const error = actionError ?? loadError;

  return (
    <AdminShell title="Cola de moderación" subtitle={"Pistas publicadas por creadores, esperando aprobación antes de ser públicas."}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Cola de moderación</h1>
            <p className="mt-1 text-sm text-muted">Pistas publicadas por creadores, esperando aprobación antes de ser públicas.</p>
          </div>
          {tracks.length > 0 && (
            <span className="rounded-full bg-amber-500/15 px-3 py-1 text-sm font-bold text-amber-400 ring-1 ring-inset ring-amber-500/30">
              {tracks.length} pendiente{tracks.length === 1 ? '' : 's'}
            </span>
          )}
        </div>

        {error && (
          <p role="alert" className="mt-6 rounded-xl bg-danger/10 px-4 py-3 text-sm font-semibold text-danger backdrop-blur-xl">
            {error}
          </p>
        )}

        {loading ? (
          <div className="mt-8 flex flex-col gap-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl border border-white/10 bg-surface" />
            ))}
          </div>
        ) : (
          <ModerationTable tracks={tracks} pendingTrackId={pendingTrackId} onApprove={handleApprove} onReject={handleReject} />
        )}
    </AdminShell>
  );
}
