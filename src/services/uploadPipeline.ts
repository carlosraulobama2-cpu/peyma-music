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

/** Mismo universo que el enum `CreditRole` del backend. */
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

export interface CreditDraft {
  role: CreditRole;
  name: string;
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
  /** Sin álbum, el backend publica un sencillo (ver publish en uploads.ts). */
  albumId?: string;
  /** Créditos a nombre suelto — compositor, productor, etc. Ninguno es obligatorio. */
  credits?: CreditDraft[];
  onStep?: (step: UploadStep) => void;
}

export async function uploadTrack({
  artistId,
  title,
  audio,
  cover,
  durationSeconds,
  albumId,
  credits,
  onStep,
}: UploadParams): Promise<PublishedTrack> {
  onStep?.(0);
  const { upload } = await http.post<{ upload: UploadDraft }>('/uploads', { artistId, title, albumId });

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

  if (credits && credits.length > 0) {
    await http.patch(`/uploads/${upload.id}`, { creditsDraft: credits });
  }

  onStep?.(3);
  await http.post(`/uploads/${upload.id}/analyze`);

  onStep?.(4);
  const { track } = await http.post<{ track: PublishedTrack }>(`/uploads/${upload.id}/publish`, { confirm: true });

  return track;
}

export interface CreatedAlbum {
  id: string;
  title: string;
  coverUrl: string;
  type: 'SINGLE' | 'EP' | 'ALBUM';
}

export interface ReleaseTrackInput {
  title: string;
  audio: LocalFile;
}

export interface UploadReleaseParams {
  artistId: string;
  albumTitle: string;
  albumType: 'EP' | 'ALBUM';
  /** Portada compartida por el álbum y por cada una de sus canciones. */
  cover: LocalFile;
  tracks: ReleaseTrackInput[];
  credits?: CreditDraft[];
  onProgress?: (info: { trackIndex: number; totalTracks: number; step: UploadStep }) => void;
}

export interface PublishedRelease {
  album: CreatedAlbum;
  tracks: PublishedTrack[];
}

/**
 * Publica un EP o álbum entero: crea el álbum y sube cada canción por el
 * mismo pipeline de `uploadTrack`, todas con el mismo `albumId`.
 *
 * El primer track es especial: `POST /albums` exige una `coverUrl` que ya
 * sea una URL válida, y la única forma de conseguir una es subir la
 * portada — así que la primera canción sube su audio y portada ANTES de
 * que el álbum exista, y recién con esa URL real se crea el álbum y se le
 * asigna esa canción (`PATCH /uploads/:id { albumId }`). No se sube la
 * portada por separado (p. ej. como si fuera un avatar): eso exigiría
 * almacenamiento en la nube configurado, y esta ruta ya funciona también en
 * local guardando en disco, igual que cualquier subida normal.
 */
export async function uploadRelease({
  artistId,
  albumTitle,
  albumType,
  cover,
  tracks,
  credits,
  onProgress,
}: UploadReleaseParams): Promise<PublishedRelease> {
  if (tracks.length < 2) {
    throw new Error('Un EP o álbum necesita al menos 2 canciones.');
  }

  const [first, ...rest] = tracks;
  const report = (trackIndex: number, step: UploadStep) => onProgress?.({ trackIndex, totalTracks: tracks.length, step });

  report(0, 0);
  const { upload: draft } = await http.post<{ upload: UploadDraft }>('/uploads', { artistId, title: first!.title });

  report(0, 1);
  const audioForm = new FormData();
  audioForm.append('audio', filePart(first!.audio));
  await uploadFile(`/uploads/${draft.id}/audio`, audioForm);

  report(0, 2);
  const coverForm = new FormData();
  coverForm.append('cover', filePart(cover));
  const { upload: withCover } = await uploadFile<{ upload: UploadDraft }>(`/uploads/${draft.id}/cover`, coverForm);
  if (!withCover.coverUrl) throw new Error('No se pudo subir la portada.');

  const { album } = await http.post<{ album: CreatedAlbum }>('/albums', {
    artistId,
    title: albumTitle,
    coverUrl: withCover.coverUrl,
    releaseYear: new Date().getFullYear(),
    type: albumType,
  });

  await http.patch(`/uploads/${draft.id}`, {
    albumId: album.id,
    ...(credits && credits.length > 0 ? { creditsDraft: credits } : {}),
  });

  report(0, 3);
  await http.post(`/uploads/${draft.id}/analyze`);
  report(0, 4);
  const { track: firstTrack } = await http.post<{ track: PublishedTrack }>(`/uploads/${draft.id}/publish`, { confirm: true });

  const publishedTracks = [firstTrack];
  for (let i = 0; i < rest.length; i++) {
    const input = rest[i]!;
    const track = await uploadTrack({
      artistId,
      title: input.title,
      audio: input.audio,
      cover,
      albumId: album.id,
      credits,
      onStep: (step) => report(i + 1, step),
    });
    publishedTracks.push(track);
  }

  return { album, tracks: publishedTracks };
}
