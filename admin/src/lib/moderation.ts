import { http } from './httpClient';

/** Espejo de `TrackReviewStatus` en `backend/prisma/schema.prisma`. */
export type TrackReviewStatus = 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';

/**
 * Etiqueta en español de cada estado — fuente única para todo el panel.
 * Antes cada pantalla tenía su propio mapa (y a veces ni eso: `UploadPage`
 * mostraba el código crudo del backend sin traducir) y podían decir cosas
 * distintas para el mismo estado ("Aprobado" acá, "Publicada" en la ficha
 * de artista).
 */
export const STATUS_LABEL: Record<TrackReviewStatus, string> = {
  PENDING_REVIEW: 'Pendiente',
  APPROVED: 'Aprobado',
  REJECTED: 'Rechazado',
};

/** Espejo de `CreditRole` en `backend/prisma/schema.prisma`. */
export type CreditRole =
  | 'MAIN_ARTIST'
  | 'FEATURED_ARTIST'
  | 'REMIXER'
  | 'PRODUCER'
  | 'COMPOSER'
  | 'WRITER'
  | 'MIX_ENGINEER'
  | 'MASTERING_ENGINEER';

export const CREDIT_ROLE_LABEL: Record<CreditRole, string> = {
  MAIN_ARTIST: 'Artista principal',
  FEATURED_ARTIST: 'Artista invitado',
  REMIXER: 'Remixer',
  PRODUCER: 'Productor',
  COMPOSER: 'Compositor',
  WRITER: 'Letrista',
  MIX_ENGINEER: 'Mezcla',
  MASTERING_ENGINEER: 'Masterización',
};

export interface TrackCredit {
  id: string;
  role: CreditRole;
  name: string;
  artistId: string | null;
  splitPercent: number | null;
}

export interface ModerationTrack {
  id: string;
  title: string;
  duration: number;
  coverUrl: string;
  audioUrl: string;
  genre: string | null;
  mood: string | null;
  createdAt: string;
  status: TrackReviewStatus;
  isExplicit: boolean;
  artist: { id: string; name: string; imageUrl: string; isVerified: boolean };
  /// Nulo en pistas que todavía no pasaron por el análisis de audio.
  analysis: {
    bpm: number;
    waveformPeaks: number[];
    integratedLufs: number | null;
    truePeakDb: number | null;
  } | null;
  album: { id: string; title: string; coverUrl: string; type?: 'SINGLE' | 'EP' | 'ALBUM' } | null;
  uploadedBy: { id: string; displayName: string; email: string } | null;
  credits: TrackCredit[];
}

interface PendingResponse {
  tracks: ModerationTrack[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export function fetchPendingTracks(page = 1, limit = 20): Promise<PendingResponse> {
  return http.get<PendingResponse>(`/admin/moderation/pending?page=${page}&limit=${limit}`);
}

export function approveTrack(trackId: string): Promise<{ track: ModerationTrack }> {
  return http.patch<{ track: ModerationTrack }>(`/admin/moderation/${trackId}/review`, { decision: 'APPROVED' });
}

export function rejectTrack(trackId: string, reason: string): Promise<{ track: ModerationTrack }> {
  return http.patch<{ track: ModerationTrack }>(`/admin/moderation/${trackId}/review`, { decision: 'REJECTED', reason });
}
