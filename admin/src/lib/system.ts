import { http } from './httpClient';

export interface SystemStatus {
  checkedAt: string;
  database: { ok: boolean; latencyMs: number | null };
  objectStorage: { enabled: boolean };
  ffmpeg: { available: boolean };
  jobs: { failedLast24h: number; oldestQueuedAt: string | null };
  uploads: { stuckAnalyzing: number };
}

export function fetchSystemStatus(): Promise<SystemStatus> {
  return http.get('/admin/system/status');
}
