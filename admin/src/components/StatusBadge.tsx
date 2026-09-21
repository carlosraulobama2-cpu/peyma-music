import type { ModerationTrack } from '../lib/moderation';

const STYLES: Record<ModerationTrack['status'], string> = {
  PENDING_REVIEW: 'bg-amber-500/15 text-amber-400 ring-1 ring-inset ring-amber-500/30',
  APPROVED: 'bg-brand/15 text-brand ring-1 ring-inset ring-brand/30',
  REJECTED: 'bg-danger/15 text-danger ring-1 ring-inset ring-danger/30',
};

const LABELS: Record<ModerationTrack['status'], string> = {
  PENDING_REVIEW: 'Pendiente',
  APPROVED: 'Aprobado',
  REJECTED: 'Rechazado',
};

export function StatusBadge({ status }: { status: ModerationTrack['status'] }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${STYLES[status]}`}>{LABELS[status]}</span>;
}
