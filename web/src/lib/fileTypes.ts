/**
 * Qué archivos ofrece el explorador, y con qué tipo se suben.
 *
 * Los dos problemas que resuelve este módulo son en realidad el mismo, y
 * sólo se ven en Windows.
 *
 * Un `<input type="file" accept="audio/mpeg,…">` no filtra por extensión:
 * el navegador traduce cada tipo MIME a extensiones preguntándole al
 * registro de Windows (`HKEY_CLASSES_ROOT\.mp3\Content Type`). Esa clave la
 * pisa cualquier reproductor que se instale, y en muchos equipos
 * directamente no existe. Cuando falta, la traducción no da ninguna
 * extensión, el filtro no casa con nada y el usuario abre la carpeta donde
 * tiene sus canciones y la ve VACÍA. Por eso `accept` lleva también las
 * extensiones literales: son las que el diálogo entiende siempre.
 *
 * El mismo registro ausente hace que `file.type` venga vacío o como
 * `application/octet-stream`, y entonces el servidor rechaza un MP3
 * perfectamente válido. `contentTypeOf` lo deduce de la extensión cuando el
 * navegador no sabe decirlo.
 */

/** Audio admitido. Debe coincidir con `AUDIO_MIME_TYPES` del backend. */
export const AUDIO_ACCEPT = ".mp3,.wav,.m4a,.ogg,.flac,audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/ogg,audio/flac";

/** Imágenes admitidas: portadas y fotos de perfil. */
export const IMAGE_ACCEPT = ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";

const BY_EXTENSION: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
  flac: "audio/flac",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/** Tipos que el servidor acepta tal cual, sin mirar la extensión. */
const KNOWN_TYPES = new Set([
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/mp4",
  "audio/ogg",
  "audio/flac",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

/**
 * El tipo con el que hay que subir el archivo.
 *
 * Se fía del navegador cuando dice algo que el servidor entiende, y si no
 * cae en la extensión. Devuelve cadena vacía si tampoco la reconoce: quien
 * llame decide si eso es un rechazo.
 */
export function contentTypeOf(file: File): string {
  if (KNOWN_TYPES.has(file.type)) return file.type;
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return BY_EXTENSION[extension] ?? "";
}

/**
 * El mismo archivo, pero etiquetado con un tipo que el servidor reconoce.
 *
 * Al mandarlo en un `FormData`, el navegador escribe `file.type` como
 * `Content-Type` de esa parte, y es lo que valida el servidor. Reenvolverlo
 * no copia los datos: el `File` nuevo apunta al mismo contenido.
 */
export function withKnownType(file: File): File {
  const type = contentTypeOf(file);
  if (!type || type === file.type) return file;
  return new File([file], file.name, { type, lastModified: file.lastModified });
}

/**
 * Topes de tamaño del servidor (`MAX_AUDIO_BYTES` y `MAX_COVER_BYTES` en
 * `backend/src/routes/uploads.ts`). Repetidos aquí a propósito: el servidor
 * sigue siendo quien manda, esto sólo sirve para avisar antes.
 */
const MAX_AUDIO_BYTES = 40 * 1024 * 1024;
const MAX_COVER_BYTES = 8 * 1024 * 1024;

const AUDIO_TYPES = new Set(["audio/mpeg", "audio/wav", "audio/x-wav", "audio/mp4", "audio/ogg", "audio/flac"]);
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function describeRejectionOf(
  file: File,
  allowed: Set<string>,
  maxBytes: number,
  formatos: string,
): string | null {
  if (!allowed.has(contentTypeOf(file))) return `Formato no admitido. Usa ${formatos}.`;
  if (file.size > maxBytes) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return `El archivo pesa ${mb} MB y el máximo son ${Math.round(maxBytes / 1024 / 1024)} MB.`;
  }
  return null;
}

/**
 * Por qué no vale este audio, o null si vale.
 *
 * Se comprueba al elegirlo, no al enviarlo. El servidor corta a los 40 MB,
 * y enterarse de eso después de haber subido 40 MB por una conexión
 * doméstica es la peor versión de este flujo — es el mismo motivo por el
 * que la foto de perfil ya se validaba antes de subir, y al audio le
 * faltaba.
 */
export function describeAudioRejection(file: File): string | null {
  return describeRejectionOf(file, AUDIO_TYPES, MAX_AUDIO_BYTES, "MP3, WAV, M4A, OGG o FLAC");
}

/** Por qué no vale esta portada, o null si vale. */
export function describeCoverRejection(file: File): string | null {
  return describeRejectionOf(file, IMAGE_TYPES, MAX_COVER_BYTES, "JPG, PNG o WebP");
}
