/**
 * Peyma Music (app) — Qué archivos acepta una subida
 *
 * El selector de documentos se abre con `audio/*`, que en un teléfono
 * incluye cosas que el servidor no admite: .aac, .opus, .wma, .amr, la nota
 * de voz de una app de mensajería. Elegir una de ésas creaba el borrador,
 * empezaba la subida y moría con un "el formato no es válido" que no dice
 * cuáles sí valen.
 *
 * Filtrar el propio selector sería lo ideal, pero pasarle una lista de
 * tipos concretos es justo lo que en iOS deja el diálogo sin archivos
 * cuando alguno no tiene UTI equivalente. Así que se abre ancho y se
 * comprueba aquí, que es donde se puede explicar el porqué.
 *
 * Las reglas son las de `AUDIO_MIME_TYPES` y `MAX_AUDIO_BYTES` del backend
 * (`backend/src/routes/uploads.ts`), y las mismas que aplican la web y el
 * panel.
 */

const MAX_AUDIO_BYTES = 40 * 1024 * 1024;

const AUDIO_TYPES = new Set(['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/ogg', 'audio/flac']);

const AUDIO_BY_EXTENSION: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
};

/**
 * Tipo con el que subir el archivo.
 *
 * Algunos proveedores de documentos no devuelven `mimeType`, y otros
 * devuelven uno que el servidor no conoce (`application/octet-stream` es
 * habitual en los gestores de archivos de Android). La extensión es el dato
 * fiable. Devuelve cadena vacía si tampoco ella dice nada reconocible.
 *
 * Antes se caía a `audio/mpeg` a ciegas, que colaba un .aac como si fuera
 * un MP3: el servidor lo aceptaba y el fallo aparecía más tarde, al
 * analizarlo.
 */
export function resolveAudioType(name: string, mimeType?: string | null): string {
  if (mimeType && AUDIO_TYPES.has(mimeType)) return mimeType;
  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  return AUDIO_BY_EXTENSION[extension] ?? '';
}

/** Por qué no vale este audio, o null si vale. */
export function describeAudioRejection(name: string, mimeType: string | null | undefined, size?: number): string | null {
  if (!resolveAudioType(name, mimeType)) {
    return 'Ese formato no se admite. Usa MP3, WAV, M4A, OGG o FLAC.';
  }
  if (size !== undefined && size > MAX_AUDIO_BYTES) {
    return `El archivo pesa ${(size / 1024 / 1024).toFixed(1)} MB y el máximo son 40 MB.`;
  }
  return null;
}
