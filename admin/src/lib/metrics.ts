import { http } from './httpClient';

export interface Top1Track {
  trackId: string;
  title: string;
  coverUrl: string;
  duration: number;
  genre: string | null;
  bpm: number | null;
  artistId: string;
  artistName: string;
  isVerified: boolean;
  streams: number;
  listeners: number;
}

export interface AdminMetrics {
  windowDays: number;
  /** La canción número 1 de la semana. Nula si no hubo reproducciones. */
  top1: Top1Track | null;
  catalog: {
    totalTracks: number;
    pendingReview: number;
    totalArtists: number;
    blockedArtists: number;
    verifiedArtists: number;
    totalUsers: number;
  };
  audience: { streams28d: number; listeners28d: number; liveListeners: number };
  jobs: { failed: number; active: number };
  dailyStreams: { day: string; streams: number }[];
  topGenres: { genre: string; streams: number }[];
}

export function fetchMetrics(): Promise<AdminMetrics> {
  return http.get<AdminMetrics>('/admin/metrics');
}

export type JobStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
export type JobKind = 'WAVEFORM' | 'LOUDNESS' | 'TRANSCODE' | 'ARTWORK' | 'COLOR' | 'FINGERPRINT';

export interface ProcessingJob {
  id: string;
  kind: JobKind;
  status: JobStatus;
  attempts: number;
  errorMessage: string | null;
  result: unknown;
  createdAt: string;
  finishedAt: string | null;
  track: { id: string; title: string; artist: { name: string } } | null;
}

export interface JobsPage {
  jobs: ProcessingJob[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  summary: Partial<Record<JobStatus, number>>;
}

export function fetchJobs(status?: JobStatus): Promise<JobsPage> {
  const query = status ? `?limit=30&status=${status}` : '?limit=30';
  return http.get<JobsPage>(`/admin/jobs${query}`);
}

export function retryJob(jobId: string): Promise<{ message: string }> {
  return http.post<{ message: string }>(`/admin/jobs/${jobId}/retry`);
}

export function processTrack(trackId: string): Promise<{ message: string }> {
  return http.post<{ message: string }>(`/admin/tracks/${trackId}/process`, {});
}
