import { STATUS_LABEL, type TrackReviewStatus } from '../lib/moderation';

const STYLES: Record<TrackReviewStatus, string> = {
  PENDING_REVIEW: 'bg-amber-500/15 text-amber-400 ring-1 ring-inset ring-amber-500/30',
  APPROVED: 'bg-brand/15 text-brand ring-1 ring-inset ring-brand/30',
  REJECTED: 'bg-danger/15 text-danger ring-1 ring-inset ring-danger/30',
};

export function StatusBadge({ status }: { status: TrackReviewStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${STYLES[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}
