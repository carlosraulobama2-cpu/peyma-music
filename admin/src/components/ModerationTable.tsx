import { TrackRow } from './TrackRow';
import type { ModerationTrack } from '../lib/moderation';

interface ModerationTableProps {
  tracks: ModerationTrack[];
  pendingTrackId: string | null;
  onApprove: (trackId: string) => void;
  onReject: (trackId: string, reason: string) => void;
}

export function ModerationTable({ tracks, pendingTrackId, onApprove, onReject }: ModerationTableProps) {
  if (tracks.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-white/15 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand/15 text-brand">✓</div>
        <p className="font-semibold">Todo al día</p>
        <p className="text-sm text-muted">No hay nada pendiente de revisión ahora mismo.</p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {tracks.map((track) => (
        <li key={track.id}>
          <TrackRow track={track} isPending={pendingTrackId === track.id} onApprove={onApprove} onReject={onReject} />
        </li>
      ))}
    </ul>
  );
}
