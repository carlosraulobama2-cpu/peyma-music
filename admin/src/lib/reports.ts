import { http } from './httpClient';

export type ReportReason =
  | 'PLAGIARISM'
  | 'COPYRIGHT'
  | 'EXPLICIT_CONTENT'
  | 'HATE_SPEECH'
  | 'MISLEADING_METADATA'
  | 'LOW_QUALITY'
  | 'OTHER';

export type ReportStatus = 'OPEN' | 'REVIEWING' | 'UPHELD' | 'DISMISSED';

export const REASON_LABELS: Record<ReportReason, string> = {
  PLAGIARISM: 'Plagio',
  COPYRIGHT: 'Derechos de autor',
  EXPLICIT_CONTENT: 'Contenido explícito',
  HATE_SPEECH: 'Incitación al odio',
  MISLEADING_METADATA: 'Metadatos falsos',
  LOW_QUALITY: 'Audio defectuoso',
  OTHER: 'Otro',
};

export const STATUS_LABELS: Record<ReportStatus, string> = {
  OPEN: 'Sin revisar',
  REVIEWING: 'En revisión',
  UPHELD: 'Aceptada',
  DISMISSED: 'Desestimada',
};

export interface TrackReport {
  id: string;
  reason: ReportReason;
  status: ReportStatus;
  details: string | null;
  resolutionNote: string | null;
  createdAt: string;
  /** Cuántas denuncias acumula la pista en total, no sólo esta. */
  totalReportsForTrack: number;
  reporter: { id: string; displayName: string; email: string } | null;
  resolvedBy: { displayName: string } | null;
  track: {
    id: string;
    title: string;
    coverUrl: string;
    duration: number;
    genre: string | null;
    isBlocked: boolean;
    artist: { id: string; name: string; isVerified: boolean };
  };
}

export function fetchReports(status: ReportStatus | 'ALL') {
  return http.get<{
    reports: TrackReport[];
    summary: Partial<Record<ReportStatus, number>>;
  }>(`/admin/reports?limit=40&status=${status}`);
}

export function resolveReport(
  id: string,
  body: { status: ReportStatus; action: 'NONE' | 'BLOCK' | 'DELETE'; note?: string },
) {
  return http.patch<{ message: string }>(`/admin/reports/${id}`, body);
}

export function setTrackBlocked(trackId: string, isBlocked: boolean, reason?: string) {
  return http.patch<{ track: { id: string; isBlocked: boolean } }>(`/admin/tracks/${trackId}/block`, {
    isBlocked,
    reason,
  });
}
