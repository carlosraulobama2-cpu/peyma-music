import { http, uploadFile } from './httpClient';
import type { TrackReviewStatus } from './moderation';

export interface UploadDraft {
  id: string;
  status: 'DRAFT' | 'UPLOADING' | 'ANALYZING' | 'PENDING_REVIEW' | 'PUBLISHED' | 'FAILED' | 'CANCELLED';
  title: string | null;
  coverUrl: string | null;
  audioUrl: string | null;
  genreOverride: string | null;
  moodOverride: string | null;
  analysisDraft: { bpm: number; musicalKey: number; mode: string; suggestedGenre: string; suggestedMood: string } | null;
}

export function createUpload(artistId: string, title: string): Promise<{ upload: UploadDraft }> {
  return http.post<{ upload: UploadDraft }>('/uploads', { artistId, title });
}

export function uploadAudio(uploadId: string, file: File, durationSeconds: number): Promise<{ upload: UploadDraft }> {
  const form = new FormData();
  form.append('audio', file);
  // Sólo si se pudo leer. El backend valida `positive()`, así que mandar el 0
  // que devuelve `readAudioDuration` cuando el navegador no entiende el
  // formato tumbaba la subida entera con un 400 — justo lo contrario de lo
  // que ese 0 promete. La web y la app ya lo filtraban; esto faltaba aquí.
  if (durationSeconds > 0) {
    form.append('durationSeconds', String(Math.round(durationSeconds)));
  }
  return uploadFile<{ upload: UploadDraft }>(`/uploads/${uploadId}/audio`, form);
}

export function uploadCover(uploadId: string, file: File): Promise<{ upload: UploadDraft }> {
  const form = new FormData();
  form.append('cover', file);
  return uploadFile<{ upload: UploadDraft }>(`/uploads/${uploadId}/cover`, form);
}

export function analyzeUpload(uploadId: string): Promise<{ upload: UploadDraft }> {
  return http.post<{ upload: UploadDraft }>(`/uploads/${uploadId}/analyze`);
}

export function publishUpload(
  uploadId: string,
): Promise<{ track: { id: string; title: string; status: TrackReviewStatus } }> {
  return http.post<{ track: { id: string; title: string; status: TrackReviewStatus } }>(
    `/uploads/${uploadId}/publish`,
    { confirm: true },
  );
}

/**
 * Lee la duración real del archivo en el navegador antes de subirlo — el
 * backend la guarda como metadato y no puede deducirla sin decodificar.
 */
export function readAudioDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const cleanup = () => URL.revokeObjectURL(url);
    audio.addEventListener('loadedmetadata', () => {
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      cleanup();
      resolve(duration);
    });
    // Si el navegador no puede leer los metadatos, se devuelve 0 y `uploadAudio`
    // no manda el campo; el backend la saca del archivo con ffmpeg.
    audio.addEventListener('error', () => {
      cleanup();
      resolve(0);
    });
    audio.src = url;
  });
}
