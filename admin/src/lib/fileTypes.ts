/**
 * Qué archivos ofrece el explorador, y con qué tipo se suben.
 *
 * Un `<input type="file" accept="audio/mpeg,…">` no filtra por extensión:
 * el navegador traduce cada tipo MIME a extensiones preguntándole al
 * registro de Windows (`HKEY_CLASSES_ROOT\.mp3\Content Type`). Esa clave la
 * pisa cualquier reproductor que se instale, y en muchos equipos no existe.
 * Cuando falta, el filtro no casa con nada y la carpeta llena de canciones
 * se ve VACÍA en el diálogo. Por eso `accept` lleva también las extensiones
 * literales, que el diálogo entiende siempre.
 *
 * El mismo registro ausente deja `file.type` vacío o en
 * `application/octet-stream`, y el servidor rechaza un MP3 válido; de ahí
 * `contentTypeOf`.
 *
 * Es gemelo de `web/src/lib/fileTypes.ts`: son dos aplicaciones distintas
 * sin código compartido, como ya pasa con el propio pipeline de subida.
 */

/** Audio admitido. Debe coincidir con `AUDIO_MIME_TYPES` del backend. */
export const AUDIO_ACCEPT =
  '.mp3,.mpeg,.mpga,.wav,.m4a,.ogg,.flac,audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/ogg,audio/flac';

/** Imágenes admitidas: portadas y fotos de perfil. */
export const IMAGE_ACCEPT = '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp';

const BY_EXTENSION: Record<string, string> = {
  mp3: 'audio/mpeg',
  // .mpeg y .mpga son MP3 con otro nombre. Pasa constantemente: una descarga
  // que el navegador bautiza por el Content-Type acaba en "cancion.mp3.mpeg",
  // y como Windows registra .mpeg como video/mpeg, el archivo desaparecía del
  // diálogo y, si llegaba a elegirse, el servidor lo rechazaba.
  mpeg: 'audio/mpeg',
  mpga: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

const KNOWN_TYPES = new Set([
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/mp4',
  'audio/ogg',
  'audio/flac',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

/** El tipo con el que hay que subir el archivo: el del navegador si sirve, y si no el de la extensión. */
export function contentTypeOf(file: File): string {
  if (KNOWN_TYPES.has(file.type)) return file.type;
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  return BY_EXTENSION[extension] ?? '';
}

/**
 * El mismo archivo con un tipo que el servidor reconoce.
 *
 * En un `FormData` el navegador escribe `file.type` como `Content-Type` de
 * esa parte, y es lo que valida el servidor. Reenvolverlo no copia los
 * datos.
 */
export function withKnownType(file: File): File {
  const type = contentTypeOf(file);
  if (!type || type === file.type) return file;
  return new File([file], file.name, { type, lastModified: file.lastModified });
}

/** El archivo elegido en un `<input type="file">`, ya etiquetado. */
export function pickedFile(files: FileList | null): File | null {
  const file = files?.[0];
  return file ? withKnownType(file) : null;
}

/**
 * Topes de tamaño del servidor (`MAX_AUDIO_BYTES` y `MAX_COVER_BYTES` en
 * `backend/src/routes/uploads.ts`). Repetidos aquí a propósito: el servidor
 * sigue siendo quien manda, esto sólo sirve para avisar antes.
 */
const MAX_AUDIO_BYTES = 40 * 1024 * 1024;
const MAX_COVER_BYTES = 8 * 1024 * 1024;

const AUDIO_TYPES = new Set(['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/ogg', 'audio/flac']);
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function describeRejectionOf(file: File, allowed: Set<string>, maxBytes: number, formatos: string): string | null {
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
 * Se comprueba al elegirlo, no al enviarlo: el servidor corta a los 40 MB y
 * enterarse después de haberlos subido es la peor versión de este flujo.
 */
export function describeAudioRejection(file: File): string | null {
  return describeRejectionOf(file, AUDIO_TYPES, MAX_AUDIO_BYTES, 'MP3, WAV, M4A, OGG o FLAC');
}

/** Por qué no vale esta portada, o null si vale. */
export function describeCoverRejection(file: File): string | null {
  return describeRejectionOf(file, IMAGE_TYPES, MAX_COVER_BYTES, 'JPG, PNG o WebP');
}

/**
 * Comprueba el archivo al elegirlo y lo entrega sólo si vale.
 *
 * Lo que se rechaza aquí es lo mismo que rechazaría el servidor, pero al
 * instante y sin haber subido nada.
 */
export function takeFile(
  files: FileList | null,
  validate: (file: File) => string | null,
  keep: (file: File | null) => void,
  warn: (message: string | null) => void,
) {
  const file = pickedFile(files);
  if (!file) {
    keep(null);
    return;
  }
  const rejection = validate(file);
  if (rejection) {
    warn(rejection);
    keep(null);
    return;
  }
  warn(null);
  keep(file);
}
