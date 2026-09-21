/**
 * Peyma Music (app) — Subida real de una canción
 *
 * Hasta ahora la pantalla "Publicar canción" escribía en un store local con
 * el URI del archivo del teléfono como `audioUrl`. La canción nunca salía
 * del dispositivo: no llegaba al servidor, no entraba en la cola de
 * moderación y nadie más podía oírla. Parecía funcionar porque aparecía en
 * el perfil del propio artista.
 *
 * Esto la sube de verdad, por el MISMO pipeline de cinco pasos que usa el
 * panel de control:
 *
 *   1. crear borrador   POST /uploads
 *   2. subir audio      POST /uploads/:id/audio      (multipart)
 *   3. subir portada    POST /uploads/:id/cover      (multipart)
 *   4. analizar         POST /uploads/:id/analyze    (BPM, tonalidad, mood)
 *   5. publicar         POST /uploads/:id/publish    → PENDING_REVIEW
 *
 * Termina en PENDING_REVIEW, nunca público: la canción aparece en el panel
 * y un administrador la aprueba. Ese es el punto de todo el flujo.
 */
import { http, uploadFile } from './httpClient';

export interface UploadDraft {
  id: string;
  status: string;
  title: string | null;
  audioUrl: string | null;
  coverUrl: string | null;
}

export interface PublishedTrack {
  id: string;
  title: string;
  status: string;
}

/** Los pasos, para que la interfaz muestre en cuál va sin duplicar la lista. */
export const UPLOAD_STEPS = [
  'Creando borrador',
  'Subiendo audio',
  'Subiendo portada',
  'Analizando la canción',
  'Enviando a revisión',
] as const;

export type UploadStep = 0 | 1 | 2 | 3 | 4;

export interface LocalFile {
  uri: string;
  name: string;
  mimeType: string;
}

/**
 * Construye el FormData de un archivo local.
 *
 * En React Native se pasa `{ uri, name, type }` y es el puente nativo quien
 * lee el archivo — NO se hace `fetch(uri)` para obtener un blob: eso
 * cargaría un máster de 100 MB entero en la RAM del teléfono antes de
 * empezar a subir, y en gama media lo mata.
 */
function filePart(file: LocalFile): Blob {
  // El cast es necesario: React Native acepta este objeto donde los tipos
  // del DOM esperan un Blob, y no hay forma de expresarlo sin él.
  return { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob;
}

export interface UploadParams {
  artistId: string;
  title: string;
  audio: LocalFile;
  cover: LocalFile;
  /** Duración en segundos, si el cliente pudo leerla. */
  durationSeconds?: number;
  onStep?: (step: UploadStep) => void;
}

export async function uploadTrack({
  artistId,
  title,
  audio,
  cover,
  durationSeconds,
  onStep,
}: UploadParams): Promise<PublishedTrack> {
  onStep?.(0);
  const { upload } = await http.post<{ upload: UploadDraft }>('/uploads', { artistId, title });

  onStep?.(1);
  const audioForm = new FormData();
  audioForm.append('audio', filePart(audio));
  if (durationSeconds && durationSeconds > 0) {
    audioForm.append('durationSeconds', String(Math.round(durationSeconds)));
  }
  await uploadFile(`/uploads/${upload.id}/audio`, audioForm);

  onStep?.(2);
  const coverForm = new FormData();
  coverForm.append('cover', filePart(cover));
  await uploadFile(`/uploads/${upload.id}/cover`, coverForm);

  onStep?.(3);
  await http.post(`/uploads/${upload.id}/analyze`);

  onStep?.(4);
  const { track } = await http.post<{ track: PublishedTrack }>(`/uploads/${upload.id}/publish`, { confirm: true });

  return track;
}
