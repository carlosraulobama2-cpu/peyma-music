/**
 * Peyma Music API — Almacenamiento de archivos
 *
 * Dos implementaciones detrás de una misma interfaz, elegidas al arrancar
 * según haya o no credenciales de bucket:
 *
 *  - `LocalDiskStorageService`: escribe en `./uploads` y lo sirve
 *    `express.static`. Es lo cómodo en desarrollo — no hace falta contratar
 *    nada para levantar el backend.
 *  - `ObjectStorageService`: S3 / Cloudflare R2.
 *
 * Por qué importa cuál se use en producción: en Render (y en cualquier
 * plataforma de contenedores) el disco es efímero. Cada despliegue arranca
 * un contenedor nuevo y vacío, así que las canciones y portadas que hubieran
 * subido los artistas desaparecerían — pero sus filas en Postgres seguirían
 * ahí, apuntando a archivos que ya no existen. El catálogo se vería entero y
 * nada sonaría. Por eso en producción hay que configurar el bucket; el
 * arranque avisa si no lo está (ver `describeStorageBackend`).
 */
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import {
  isObjectStorageEnabled,
  putObject,
  getObject,
  deleteByPrefix,
  objectKeyFromPublicUrl,
  publicUrlFor,
  uploadObjectKey,
  uploadPrefix,
} from './objectStorage';

const UPLOADS_ROOT = path.join(process.cwd(), 'uploads');
const PUBLIC_PREFIX = '/uploads';

export interface StoredFile {
  /** URL pública para servir el archivo — se guarda tal cual en `audioUrl`/`coverUrl`. */
  url: string;
  sizeBytes: number;
}

export interface StorageService {
  saveFile(uploadId: string, kind: 'audio' | 'cover', buffer: Buffer, originalName: string): Promise<StoredFile>;

  /**
   * Guarda un archivo derivado de una pista (una variante de calidad).
   *
   * Va aparte de `saveFile` porque no pertenece a una subida en curso sino a
   * una pista ya publicada, y porque lo produce ffmpeg en disco: quien llama
   * pasa una ruta, no un buffer en memoria, que para un FLAC de 90 MB es la
   * diferencia entre copiar el archivo y quedarse sin memoria.
   */
  saveTrackVariant(trackId: string, sourcePath: string, contentType: string): Promise<StoredFile>;

  deleteUploadFiles(uploadId: string): Promise<void>;

  /** Lee de vuelta un archivo que guardó este servicio, venga de disco o del bucket. */
  readFile(url: string): Promise<Buffer>;

  /**
   * Ruta en disco de una URL nuestra, o `null` si el archivo no está en este
   * sistema de archivos (bucket o enlace externo).
   *
   * Devuelve `null` en vez de lanzar porque quien llama tiene una alternativa
   * legítima: ffmpeg sabe leer de una URL https, así que un archivo remoto no
   * es un error, sólo otro camino.
   */
  localPathForUrl(url: string): string | null;
}

function safeExtension(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase();
  // Nunca confiar en la extensión del cliente a ciegas para nombrar el
  // archivo final — sólo se acepta si es alfanumérica corta, si no se
  // descarta (el `mimetype` ya se validó aparte, en el multer `fileFilter`).
  return /^\.[a-z0-9]{1,5}$/.test(ext) ? ext : '';
}

class LocalDiskStorageService implements StorageService {
  async saveFile(uploadId: string, kind: 'audio' | 'cover', buffer: Buffer, originalName: string): Promise<StoredFile> {
    const dir = path.join(UPLOADS_ROOT, uploadId);
    await fs.mkdir(dir, { recursive: true });

    const filename = `${kind}-${randomUUID()}${safeExtension(originalName)}`;
    await fs.writeFile(path.join(dir, filename), buffer);

    return { url: `${PUBLIC_PREFIX}/${uploadId}/${filename}`, sizeBytes: buffer.byteLength };
  }

  async saveTrackVariant(trackId: string, sourcePath: string, _contentType: string): Promise<StoredFile> {
    const dir = path.join(UPLOADS_ROOT, 'variants', trackId);
    await fs.mkdir(dir, { recursive: true });

    const filename = path.basename(sourcePath);
    const destination = path.join(dir, filename);
    // Si ffmpeg ya escribió en el destino final no hay nada que mover.
    if (path.resolve(sourcePath) !== path.resolve(destination)) {
      await fs.copyFile(sourcePath, destination);
    }
    const { size } = await fs.stat(destination);

    return { url: `${PUBLIC_PREFIX}/variants/${trackId}/${filename}`, sizeBytes: size };
  }

  async deleteUploadFiles(uploadId: string): Promise<void> {
    await fs.rm(path.join(UPLOADS_ROOT, uploadId), { recursive: true, force: true });
  }

  async readFile(url: string): Promise<Buffer> {
    const absolutePath = this.localPathForUrl(url);
    if (!absolutePath) throw new Error(`No es un archivo local: ${url}`);
    return fs.readFile(absolutePath);
  }

  localPathForUrl(url: string): string | null {
    if (!url.startsWith(`${PUBLIC_PREFIX}/`)) return null;

    const relative = url.slice(PUBLIC_PREFIX.length + 1);
    const absolutePath = path.join(UPLOADS_ROOT, relative);
    // La URL nunca debería poder escaparse de UPLOADS_ROOT (no viene de
    // input libre del usuario), pero se verifica igual antes de leer del disco.
    if (!absolutePath.startsWith(UPLOADS_ROOT)) {
      throw new Error('Ruta de almacenamiento inválida');
    }
    return absolutePath;
  }
}

class ObjectStorageService implements StorageService {
  async saveFile(uploadId: string, kind: 'audio' | 'cover', buffer: Buffer, originalName: string): Promise<StoredFile> {
    const extension = safeExtension(originalName);
    const key = uploadObjectKey(uploadId, `${kind}-${randomUUID()}${extension}`);
    await putObject(key, buffer, contentTypeFor(extension, kind));
    return { url: publicUrlFor(key), sizeBytes: buffer.byteLength };
  }

  async saveTrackVariant(trackId: string, sourcePath: string, contentType: string): Promise<StoredFile> {
    const buffer = await fs.readFile(sourcePath);
    const key = path.posix.join('variants', trackId, path.basename(sourcePath));
    await putObject(key, buffer, contentType);
    return { url: publicUrlFor(key), sizeBytes: buffer.byteLength };
  }

  async deleteUploadFiles(uploadId: string): Promise<void> {
    await deleteByPrefix(uploadPrefix(uploadId));
  }

  async readFile(url: string): Promise<Buffer> {
    const key = objectKeyFromPublicUrl(url);
    if (!key) throw new Error(`La URL no pertenece a nuestro bucket: ${url}`);
    return getObject(key);
  }

  /** En el bucket no hay rutas de disco; ffmpeg lee estos archivos por https. */
  localPathForUrl(): string | null {
    return null;
  }
}

/**
 * Tipo de contenido a partir de la extensión ya saneada.
 *
 * Importa guardarlo bien: es lo que el navegador recibe al pedir el archivo.
 * Con un tipo genérico, `<audio>` puede negarse a reproducir y una portada se
 * descarga en vez de mostrarse.
 */
function contentTypeFor(extension: string, kind: 'audio' | 'cover'): string {
  const byExtension: Record<string, string> = {
    '.mp3': 'audio/mpeg',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
    '.ogg': 'audio/ogg',
    '.opus': 'audio/opus',
    '.wav': 'audio/wav',
    '.flac': 'audio/flac',
    '.aiff': 'audio/aiff',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
  };
  return byExtension[extension] ?? (kind === 'audio' ? 'application/octet-stream' : 'image/jpeg');
}

const usingObjectStorage = isObjectStorageEnabled();

export const storageService: StorageService = usingObjectStorage
  ? new ObjectStorageService()
  : new LocalDiskStorageService();

/** ¿Los archivos viven en el bucket? Lo consulta `index.ts` para decidir si sirve `/uploads`. */
export const isUsingObjectStorage = usingObjectStorage;

/** Frase para el log de arranque: qué almacenamiento quedó activo y qué implica. */
export function describeStorageBackend(): string {
  return usingObjectStorage
    ? 'Almacenamiento: bucket S3/R2 (los archivos sobreviven a los despliegues)'
    : 'Almacenamiento: disco local ./uploads — SIN bucket configurado. En un servidor con disco efímero (Render, Fly, contenedores) todo lo que suban los artistas se pierde en cada despliegue. Define S3_BUCKET, S3_ACCESS_KEY_ID y S3_SECRET_ACCESS_KEY.';
}

/**
 * ¿Puede el navegador pedir esta URL por su cuenta?
 *
 * Lo consulta la ruta de reproducción para decidir entre redirigir al origen
 * (rápido) o reenviar los bytes a través de Node (lento pero funciona
 * siempre). Medido: ~170 ms hasta el primer byte redirigiendo al CDN de R2
 * frente a ~900 ms proxeando.
 *
 * Sólo vale para objetos de NUESTRO bucket, y sólo si hay dominio público
 * configurado. Dos motivos, uno por condición:
 *
 *  - Sin dominio público, la URL apunta al endpoint privado del bucket, que
 *    exige petición firmada: redirigir ahí le daría un 400 al cliente.
 *  - Los orígenes de terceros se siguen proxeando aunque sean públicos. Se
 *    probó redirigirlos y salió PEOR: Internet Archive (donde vive el
 *    catálogo actual) responde a su vez con otro 302, así que el cliente
 *    encadena dos conexiones nuevas. Medido: ~1,8 s redirigiendo frente a
 *    ~0,9 s proxeando. Además no controlamos si un tercero manda las
 *    cabeceras CORS que Web Audio necesita para no silenciar la salida.
 */
export function isPubliclyReadable(url: string): boolean {
  if (!usingObjectStorage) return false;
  if (!/^https?:\/\//i.test(url)) return false;
  if (objectKeyFromPublicUrl(url) === null) return false;

  return (process.env.S3_PUBLIC_BASE_URL ?? '').trim().length > 0;
}

/**
 * Avisa si el bucket está activo pero sin dominio público de lectura.
 *
 * Sin `S3_PUBLIC_BASE_URL` se cae al endpoint de la API del bucket, que
 * EXIGE peticiones firmadas. Los archivos se guardarían perfectamente y la
 * URL quedaría escrita en `Track.audioUrl`, pero el navegador recibe un 400
 * al pedirla: se descubre cuando alguien le da al play, y para entonces ya
 * hay filas en la base apuntando a una URL que nadie puede abrir.
 *
 * Devuelve `null` si no hay nada que advertir.
 */
export function warnIfNoPublicBaseUrl(): string | null {
  if (!usingObjectStorage) return null;
  if ((process.env.S3_PUBLIC_BASE_URL ?? '').trim().length > 0) return null;

  return 'S3_PUBLIC_BASE_URL no está definida: las URL de audio y portada apuntarán al endpoint privado del bucket y el navegador no podrá leerlas. Activa el acceso público del bucket (o conéctale un dominio) y pon esa base aquí. Compruébalo con `npm run storage:check`.';
}

export const UPLOADS_STATIC_ROOT = UPLOADS_ROOT;
export const UPLOADS_STATIC_PREFIX = PUBLIC_PREFIX;
