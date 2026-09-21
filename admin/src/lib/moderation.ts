import { http } from './httpClient';

export interface ModerationTrack {
  id: string;
  title: string;
  duration: number;
  coverUrl: string;
  audioUrl: string;
  genre: string | null;
  mood: string | null;
  createdAt: string;
  status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
  isExplicit: boolean;
  artist: { id: string; name: string; imageUrl: string; isVerified: boolean };
  /// Nulo en pistas que todavía no pasaron por el análisis de audio.
  analysis: {
    bpm: number;
    waveformPeaks: number[];
    integratedLufs: number | null;
    truePeakDb: number | null;
  } | null;
  album: { id: string; title: string; coverUrl: string } | null;
  uploadedBy: { id: string; displayName: string; email: string } | null;
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
