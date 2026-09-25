/**
 * Peyma Music API — Qué formatos se aceptan, en un solo sitio
 *
 * Antes esta información vivía repartida en tres tablas que no se hablaban:
 * el filtro de multer en `routes/uploads.ts` decidía qué entraba, y
 * `contentTypeFor` en `services/storage.ts` decidía con qué `Content-Type`
 * se guardaba en el bucket, cada una con su propia lista de extensiones.
 *
 * Eso rompió una subida real. Al aceptar `.mpeg` en el filtro y olvidar la
 * otra tabla, el archivo entraba, se guardaba como
 * `application/octet-stream` y el navegador se negaba a reproducirlo: la
 * canción estaba entera en el bucket y sonaba a nada. El daño de tener dos
 * listas no es que difieran en abstracto, es que una subida pasa la primera
 * y muere en la segunda.
 *
 * Así que la lista es ésta y sólo ésta. Quien necesite saber si un formato
 * vale, o con qué tipo guardarlo, pregunta aquí.
 */

/** Audio que acepta la plataforma. */
export const AUDIO_MIME_TYPES = new Set([
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/mp4',
  'audio/ogg',
  'audio/flac',
]);

/** Imágenes que acepta la plataforma (portadas y fotos). */
export const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * Extensión → tipo de contenido.
 *
 * `.mpeg` y `.mpga` son MP3 con otro nombre: una descarga que el navegador
 * bautiza por el `Content-Type` acaba en "cancion.mp3.mpeg", y Windows
 * además registra `.mpeg` como `video/mpeg`, así que ni el tipo que declara
 * el navegador ni la extensión "obvia" sirven por sí solos.
 */
const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  '.mp3': 'audio/mpeg',
  '.mpeg': 'audio/mpeg',
  '.mpga': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.mp4': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

/**
 * Tipo de contenido → extensión con la que se guarda.
 *
 * Es la CANÓNICA, no la que traía el archivo: un `audio/mpeg` se guarda
 * siempre como `.mp3` aunque llegara como `.mpeg`. Así el objeto del bucket,
 * su `Content-Type` y lo que ffmpeg deduce del nombre dicen todos lo mismo.
 */
const EXTENSION_BY_MIME: Readonly<Record<string, string>> = {
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'audio/ogg': '.ogg',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'audio/flac': '.flac',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

/** La extensión de un nombre de archivo, en minúsculas y sólo si es plausible. */
export function safeExtension(originalName: string): string {
  const withoutQuery = originalName.split('?')[0] ?? '';
  const dot = withoutQuery.lastIndexOf('.');
  if (dot < 0) return '';
  const extension = withoutQuery.slice(dot).toLowerCase();
  return /^\.[a-z0-9]{1,5}$/.test(extension) ? extension : '';
}

/** Tipo de contenido deducido del nombre, o cadena vacía si no se reconoce. */
export function mimeTypeForFilename(originalName: string): string {
  return MIME_BY_EXTENSION[safeExtension(originalName)] ?? '';
}

/** Extensión canónica de un tipo, o cadena vacía si no es uno de los nuestros. */
export function extensionForMimeType(contentType: string): string {
  return EXTENSION_BY_MIME[contentType] ?? '';
}

/**
 * ¿Se admite este archivo? Devuelve el tipo con el que hay que tratarlo, o
 * cadena vacía si no vale.
 *
 * Se fía del tipo declarado cuando es uno de los aceptados y, si no, mira la
 * extensión: en Windows el navegador saca ese tipo del registro del sistema,
 * que a menudo no tiene entrada para `.mp3` o la tiene equivocada.
 */
export function resolveMediaType(declared: string, originalName: string, allowed: Set<string>): string {
  if (allowed.has(declared)) return declared;
  const guess = mimeTypeForFilename(originalName);
  return guess && allowed.has(guess) ? guess : '';
}
