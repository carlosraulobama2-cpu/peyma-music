import { http, uploadFile } from "./httpClient";

/**
 * Subida de una canción desde la web.
 *
 * Es el MISMO pipeline de cinco pasos que la app y el panel de control. Los
 * tres hablan con los mismos endpoints a propósito: si cada cliente tuviera
 * su propio flujo, una regla nueva (un formato prohibido, un campo
 * obligatorio) habría que implementarla tres veces y se olvidaría en una.
 *
 *   1. crear borrador   POST /uploads
 *   2. subir audio      POST /uploads/:id/audio
 *   3. subir portada    POST /uploads/:id/cover
 *   4. analizar         POST /uploads/:id/analyze
 *   5. publicar         POST /uploads/:id/publish  → PENDING_REVIEW
 *
 * Termina en PENDING_REVIEW, nunca público: aparece en el panel y un
 * administrador decide.
 */

export const UPLOAD_STEPS = [
  "Creando borrador",
  "Subiendo audio",
  "Subiendo portada",
  "Analizando la canción",
  "Enviando a revisión",
] as const;

export type UploadStep = 0 | 1 | 2 | 3 | 4;

/**
 * Lee la duración real del archivo antes de subirlo.
 *
 * El servidor no puede deducirla sin decodificar el audio, y el navegador
 * ya lo hace gratis al cargar los metadatos. Si falla devuelve 0 en vez de
 * romper: una duración desconocida es un inconveniente, no un error.
 */
export function readAudioDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const finish = (value: number) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    audio.addEventListener("loadedmetadata", () => finish(Number.isFinite(audio.duration) ? audio.duration : 0));
    audio.addEventListener("error", () => finish(0));
    audio.src = url;
  });
}

export interface UploadParams {
  artistId: string;
  title: string;
  audio: File;
  cover: File;
  onStep?: (step: UploadStep) => void;
}

export interface PublishedTrack {
  id: string;
  title: string;
  status: string;
}

export async function uploadTrack({
  artistId,
  title,
  audio,
  cover,
  onStep,
}: UploadParams): Promise<PublishedTrack> {
  onStep?.(0);
  const { upload } = await http.post<{ upload: { id: string } }>("/uploads", { artistId, title });

  onStep?.(1);
  const duration = await readAudioDuration(audio);
  const audioForm = new FormData();
  audioForm.append("audio", audio);
  if (duration > 0) audioForm.append("durationSeconds", String(Math.round(duration)));
  await uploadFile(`/uploads/${upload.id}/audio`, audioForm);

  onStep?.(2);
  const coverForm = new FormData();
  coverForm.append("cover", cover);
  await uploadFile(`/uploads/${upload.id}/cover`, coverForm);

  onStep?.(3);
  await http.post(`/uploads/${upload.id}/analyze`);

  onStep?.(4);
  const { track } = await http.post<{ track: PublishedTrack }>(`/uploads/${upload.id}/publish`, { confirm: true });

  return track;
}
