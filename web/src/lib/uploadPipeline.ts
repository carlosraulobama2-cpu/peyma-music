import { http, uploadFile, getAuthToken } from "./httpClient";

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

/** Mismo universo que el enum `CreditRole` del backend. */
export type CreditRole =
  | "MAIN_ARTIST"
  | "FEATURED_ARTIST"
  | "REMIXER"
  | "PRODUCER"
  | "COMPOSER"
  | "WRITER"
  | "MIX_ENGINEER"
  | "MASTERING_ENGINEER";

export const CREDIT_ROLE_LABEL: Record<CreditRole, string> = {
  MAIN_ARTIST: "Artista principal",
  FEATURED_ARTIST: "Artista invitado",
  REMIXER: "Remixer",
  PRODUCER: "Productor",
  COMPOSER: "Compositor",
  WRITER: "Letrista",
  MIX_ENGINEER: "Mezcla",
  MASTERING_ENGINEER: "Masterización",
};

export interface CreditDraft {
  role: CreditRole;
  name: string;
}

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
  /** Sin álbum, el backend publica un sencillo (ver publish en uploads.ts). */
  albumId?: string;
  /** Créditos a nombre suelto — compositor, productor, etc. Ninguno es obligatorio. */
  credits?: CreditDraft[];
  /**
   * Letra en texto plano, opcional. Viaja en el paso de metadatos, que hasta
   * ahora el pipeline de la web se saltaba entero.
   */
  lyrics?: string | null;
  /** Id de un `MusicGenre`. Opcional: mejor sin género que con uno inventado. */
  genreId?: string | null;
  token: string | null;
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
  albumId,
  credits,
  lyrics,
  genreId,
  token,
  onStep,
}: UploadParams): Promise<PublishedTrack> {
  onStep?.(0);
  const { upload } = await http.post<{ upload: { id: string } }>("/uploads", { artistId, title, albumId });

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

  if (credits && credits.length > 0) {
    await http.patch(`/uploads/${upload.id}`, { creditsDraft: credits });
  }

  onStep?.(3);
  await http.post(`/uploads/${upload.id}/analyze`);

  // Metadatos antes de publicar: es `publish` quien vuelca
  // `lyricsPlainDraft` en la tabla `Lyrics`, así que mandarla después no
  // serviría de nada. Comparte paso con el análisis a propósito en vez de
  // tener uno propio: es una llamada corta y casi siempre instantánea, y un
  // sexto punto en la barra de progreso sólo haría el proceso más lento a
  // la vista sin informar de nada.
  const letra = lyrics?.trim();
  if (letra || genreId) {
    await http.patch(`/uploads/${upload.id}`, {
      ...(letra ? { lyricsPlainDraft: letra } : {}),
      ...(genreId ? { genreOverrideId: genreId } : {}),
    });
  }

  onStep?.(4);
  const { track } = await http.post<{ track: PublishedTrack }>(`/uploads/${upload.id}/publish`, { confirm: true });

  return track;
}

export interface CreatedAlbum {
  id: string;
  title: string;
  coverUrl: string;
  type: "SINGLE" | "EP" | "ALBUM";
}

export interface ReleaseTrackInput {
  title: string;
  audio: File;
}

export interface UploadReleaseParams {
  artistId: string;
  albumTitle: string;
  albumType: "EP" | "ALBUM";
  /** Portada compartida por el álbum y por cada una de sus canciones. */
  cover: File;
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
 * mismo pipeline de `uploadTrack`, todas con el mismo `albumId`. Mismo
 * mecanismo que `src/services/uploadPipeline.ts` en la app — ver el
 * comentario ahí para el porqué del primer track especial: `POST /albums`
 * exige una `coverUrl` que ya sea una URL válida, y la única forma de
 * conseguir una es subir la portada primero, así que la primera canción
 * sube su audio y portada ANTES de que el álbum exista, y recién con esa
 * URL real se crea el álbum y se le asigna esa canción.
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
    throw new Error("Un EP o álbum necesita al menos 2 canciones.");
  }

  const [first, ...rest] = tracks;
  const report = (trackIndex: number, step: UploadStep) => onProgress?.({ trackIndex, totalTracks: tracks.length, step });

  report(0, 0);
  const { upload: draft } = await http.post<{ upload: { id: string } }>("/uploads", { artistId, title: first!.title });

  report(0, 1);
  const duration = await readAudioDuration(first!.audio);
  const audioForm = new FormData();
  audioForm.append("audio", first!.audio);
  if (duration > 0) audioForm.append("durationSeconds", String(Math.round(duration)));
  await uploadFile(`/uploads/${draft.id}/audio`, audioForm);

  report(0, 2);
  const coverForm = new FormData();
  coverForm.append("cover", cover);
  const { upload: withCover } = await uploadFile<{ upload: { coverUrl: string | null } }>(`/uploads/${draft.id}/cover`, coverForm);
  if (!withCover.coverUrl) throw new Error("No se pudo subir la portada.");

  const { album } = await http.post<{ album: CreatedAlbum }>("/albums", {
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
      token: getAuthToken(),
      onStep: (step) => report(i + 1, step),
    });
    publishedTracks.push(track);
  }

  return { album, tracks: publishedTracks };
}
