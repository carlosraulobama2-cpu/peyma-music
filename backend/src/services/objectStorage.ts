/**
 * Peyma Music API — Subida directa a S3 / Cloudflare R2 con URLs firmadas
 *
 * El problema que resuelve: un máster .wav puede pesar 100 MB. Si sube a
 * través de la API, ese archivo ocupa memoria y ancho de banda del servidor
 * mientras dura la transferencia, y diez subidas simultáneas lo tumban. Con
 * una URL firmada el panel sube el archivo DIRECTO al bucket y la API sólo
 * emite un permiso temporal: bytes que nunca la tocan.
 *
 * R2 y S3 comparten la misma API, así que el mismo cliente sirve para los
 * dos; a R2 se apunta con `S3_ENDPOINT` y `forcePathStyle`.
 *
 * Si no hay credenciales configuradas, esto queda deshabilitado y el
 * pipeline sigue usando el disco local (`storage.ts`). No se lanza un error
 * al arrancar: en desarrollo no hace falta un bucket para trabajar, y fallar
 * el arranque por eso obligaría a todo el equipo a tener credenciales de
 * nube para levantar el backend.
 */
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/** Validez de la URL firmada. Suficiente para un máster grande por red lenta. */
const PRESIGN_EXPIRY_SECONDS = 60 * 60;

/** Tipos permitidos para el máster: sólo sin pérdida. */
export const MASTER_CONTENT_TYPES: Readonly<Record<string, string>> = {
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'audio/flac': '.flac',
  'audio/x-flac': '.flac',
  'audio/aiff': '.aiff',
};

export const ARTWORK_CONTENT_TYPES: Readonly<Record<string, string>> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

export interface PresignedUpload {
  /** URL a la que el panel hace PUT con el archivo crudo. */
  uploadUrl: string;
  /** Clave del objeto en el bucket — se guarda para verificar después. */
  objectKey: string;
  /** URL pública de lectura, una vez subido. */
  publicUrl: string;
  expiresInSeconds: number;
}

interface ObjectStorageConfig {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Presente en R2 y en S3-compatibles; ausente en S3 de AWS. */
  endpoint?: string;
  /** Base pública para leer los objetos (CDN o dominio del bucket). */
  publicBaseUrl: string;
}

/**
 * Lee una variable tratando la cadena vacía como ausente.
 *
 * `process.env.X ?? defecto` NO sirve aquí: `??` sólo cae al defecto con
 * `null`/`undefined`, y una variable declarada sin valor (`S3_PUBLIC_BASE_URL=`
 * en un .env, o un campo vacío en el panel de Render) llega como `""`, que
 * pasa de largo. El daño era silencioso y grave: la base pública quedaba
 * vacía, cada `audioUrl` se guardaba en la base de datos como una ruta sin
 * dominio, y sólo se notaba al intentar reproducir.
 */
function clean(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readConfig(): ObjectStorageConfig | null {
  // Acceso estático a `process.env`, no `process.env[nombre]`: así el
  // linter puede comprobar los nombres y una errata no se convierte en un
  // `undefined` silencioso.
  const bucket = clean(process.env.S3_BUCKET);
  const accessKeyId = clean(process.env.S3_ACCESS_KEY_ID);
  const secretAccessKey = clean(process.env.S3_SECRET_ACCESS_KEY);

  // Las tres son imprescindibles; sin alguna, la función queda apagada.
  if (!bucket || !accessKeyId || !secretAccessKey) return null;

  const endpoint = clean(process.env.S3_ENDPOINT);
  const region = clean(process.env.S3_REGION) ?? 'auto';

  return {
    bucket,
    region,
    accessKeyId,
    secretAccessKey,
    ...(endpoint ? { endpoint } : {}),
    publicBaseUrl:
      clean(process.env.S3_PUBLIC_BASE_URL) ??
      (endpoint ? `${endpoint.replace(/\/$/, '')}/${bucket}` : `https://${bucket}.s3.${region}.amazonaws.com`),
  };
}

let cached: { config: ObjectStorageConfig; client: S3Client } | null | undefined;

function getClient(): { config: ObjectStorageConfig; client: S3Client } | null {
  // `undefined` = todavía no se leyó; `null` = se leyó y no está configurado.
  if (cached !== undefined) return cached;

  const config = readConfig();
  if (!config) {
    cached = null;
    return null;
  }

  cached = {
    config,
    client: new S3Client({
      region: config.region,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      ...(config.endpoint ? { endpoint: config.endpoint, forcePathStyle: true } : {}),
    }),
  };
  return cached;
}

/** ¿Hay bucket configurado? Lo consultan las rutas para elegir el modo de subida. */
export function isObjectStorageEnabled(): boolean {
  return getClient() !== null;
}

export class ObjectStorageDisabledError extends Error {
  constructor() {
    super('El almacenamiento de objetos no está configurado (faltan S3_BUCKET / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY)');
    this.name = 'ObjectStorageDisabledError';
  }
}

/**
 * Construye la clave del objeto.
 *
 * Nunca se usa el nombre original del archivo: llega de un cliente y podría
 * traer `../`, caracteres de control o un nombre que colisione con otro. Se
 * conserva sólo la extensión, y derivada del `contentType` declarado, no del
 * nombre. El UUID garantiza que dos subidas nunca se pisen.
 */
function buildObjectKey(uploadId: string, kind: 'master' | 'artwork', contentType: string): string {
  const table = kind === 'master' ? MASTER_CONTENT_TYPES : ARTWORK_CONTENT_TYPES;
  const extension = table[contentType];
  if (!extension) {
    throw new Error(`Tipo de contenido no permitido para ${kind}: ${contentType}`);
  }
  // `path.posix` a propósito: las claves de S3 usan `/` en cualquier sistema.
  return path.posix.join('uploads', uploadId, `${kind}-${randomUUID()}${extension}`);
}

/**
 * Emite una URL firmada de subida.
 *
 * El `contentType` va dentro de la firma: el cliente tiene que mandar
 * exactamente ese encabezado o S3 rechaza el PUT. Así una URL emitida para
 * un .wav no sirve para subir un ejecutable.
 */
export async function createPresignedUpload(
  uploadId: string,
  kind: 'master' | 'artwork',
  contentType: string,
): Promise<PresignedUpload> {
  const ctx = getClient();
  if (!ctx) throw new ObjectStorageDisabledError();

  const objectKey = buildObjectKey(uploadId, kind, contentType);

  const uploadUrl = await getSignedUrl(
    ctx.client,
    new PutObjectCommand({ Bucket: ctx.config.bucket, Key: objectKey, ContentType: contentType }),
    { expiresIn: PRESIGN_EXPIRY_SECONDS },
  );

  return {
    uploadUrl,
    objectKey,
    publicUrl: `${ctx.config.publicBaseUrl.replace(/\/$/, '')}/${objectKey}`,
    expiresInSeconds: PRESIGN_EXPIRY_SECONDS,
  };
}

/**
 * URL firmada para la foto de perfil de un usuario.
 *
 * Va aparte de `createPresignedUpload` porque un avatar no pertenece a una
 * subida de canción: vive en `avatars/<usuario>/` y su ciclo de vida es el
 * de la cuenta, no el de un borrador que se publica o se cancela.
 *
 * El nombre del archivo lo decide el servidor (UUID + extensión derivada del
 * `contentType` declarado, nunca del nombre que mande el cliente). La ruta
 * lleva el id del usuario para que se vea de un vistazo de quién es cada
 * objeto al mirar el bucket.
 */
export async function createPresignedAvatarUpload(
  userId: string,
  contentType: string,
): Promise<PresignedUpload> {
  const ctx = getClient();
  if (!ctx) throw new ObjectStorageDisabledError();

  const extension = ARTWORK_CONTENT_TYPES[contentType];
  if (!extension) {
    throw new Error(`Tipo de imagen no permitido: ${contentType}`);
  }

  const objectKey = path.posix.join('avatars', userId, `${randomUUID()}${extension}`);

  const uploadUrl = await getSignedUrl(
    ctx.client,
    new PutObjectCommand({ Bucket: ctx.config.bucket, Key: objectKey, ContentType: contentType }),
    { expiresIn: PRESIGN_EXPIRY_SECONDS },
  );

  return {
    uploadUrl,
    objectKey,
    publicUrl: `${ctx.config.publicBaseUrl.replace(/\/$/, '')}/${objectKey}`,
    expiresInSeconds: PRESIGN_EXPIRY_SECONDS,
  };
}

/**
 * URL pública de lectura de un objeto ya subido.
 *
 * Existe aparte de `createPresignedUpload` porque al confirmar la subida
 * sólo se tiene la clave guardada en el draft, no el resultado del firmado.
 */
export function publicUrlFor(objectKey: string): string {
  const ctx = getClient();
  if (!ctx) throw new ObjectStorageDisabledError();
  return `${ctx.config.publicBaseUrl.replace(/\/$/, '')}/${objectKey}`;
}

export interface ObjectInfo {
  sizeBytes: number;
  contentType: string | undefined;
}

/**
 * Comprueba que el objeto llegó de verdad.
 *
 * Imprescindible: con subida directa el cliente podría no avisar nunca, o
 * avisar de una subida que falló a mitad. El pipeline no debe seguir con un
 * máster que no existe, así que este HEAD es la confirmación real, no el
 * "listo" que manda el navegador.
 */
export async function headObject(objectKey: string): Promise<ObjectInfo | null> {
  const ctx = getClient();
  if (!ctx) throw new ObjectStorageDisabledError();

  try {
    const result = await ctx.client.send(
      new HeadObjectCommand({ Bucket: ctx.config.bucket, Key: objectKey }),
    );
    return { sizeBytes: result.ContentLength ?? 0, contentType: result.ContentType };
  } catch (error) {
    // 404/NotFound significa "todavía no subió", que es un estado normal y
    // no un fallo: se distingue de un error real de red o de permisos.
    const name = (error as { name?: string }).name;
    if (name === 'NotFound' || name === 'NoSuchKey') return null;
    throw error;
  }
}

export async function deleteObject(objectKey: string): Promise<void> {
  const ctx = getClient();
  if (!ctx) throw new ObjectStorageDisabledError();
  await ctx.client.send(new DeleteObjectCommand({ Bucket: ctx.config.bucket, Key: objectKey }));
}

/**
 * Sube un archivo desde el propio servidor.
 *
 * Coexiste con `createPresignedUpload` y no lo reemplaza: la URL firmada es
 * para másteres grandes que no deben pasar por la API, y esto es para lo que
 * la API ya tiene en memoria o en disco — una portada de 2 MB, o una variante
 * que acaba de producir ffmpeg. Firmar una URL para que el servidor se la
 * mande a sí mismo sería un rodeo sin ganancia.
 */
export async function putObject(objectKey: string, body: Buffer, contentType: string): Promise<void> {
  const ctx = getClient();
  if (!ctx) throw new ObjectStorageDisabledError();
  await ctx.client.send(
    new PutObjectCommand({ Bucket: ctx.config.bucket, Key: objectKey, Body: body, ContentType: contentType }),
  );
}

/** Descarga un objeto completo a memoria. */
export async function getObject(objectKey: string): Promise<Buffer> {
  const ctx = getClient();
  if (!ctx) throw new ObjectStorageDisabledError();

  const result = await ctx.client.send(new GetObjectCommand({ Bucket: ctx.config.bucket, Key: objectKey }));
  if (!result.Body) throw new Error(`El objeto ${objectKey} vino sin contenido`);

  // `transformToByteArray` lo aporta el SDK v3 sobre el stream del runtime,
  // y evita tener que acumular los trozos a mano.
  return Buffer.from(await result.Body.transformToByteArray());
}

/**
 * Borra todos los objetos bajo un prefijo.
 *
 * S3 no tiene carpetas: borrar "la carpeta de una subida" es listar sus
 * claves y borrarlas. Se pagina porque `ListObjectsV2` devuelve como mucho
 * 1000 claves por respuesta, y `DeleteObjects` acepta como mucho 1000 por
 * petición — los dos límites encajan, así que cada página se borra entera.
 */
export async function deleteByPrefix(prefix: string): Promise<number> {
  const ctx = getClient();
  if (!ctx) throw new ObjectStorageDisabledError();

  let deleted = 0;
  let continuationToken: string | undefined;

  do {
    const listed = await ctx.client.send(
      new ListObjectsV2Command({
        Bucket: ctx.config.bucket,
        Prefix: prefix,
        ...(continuationToken ? { ContinuationToken: continuationToken } : {}),
      }),
    );

    const keys = (listed.Contents ?? []).flatMap((item) => (item.Key ? [{ Key: item.Key }] : []));
    if (keys.length > 0) {
      await ctx.client.send(
        new DeleteObjectsCommand({ Bucket: ctx.config.bucket, Delete: { Objects: keys, Quiet: true } }),
      );
      deleted += keys.length;
    }

    continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (continuationToken);

  return deleted;
}

/**
 * De la URL pública de vuelta a la clave del objeto.
 *
 * Hace falta porque lo que se guarda en la base de datos es la URL pública
 * (`Track.audioUrl`), y para releer o borrar ese archivo el SDK necesita la
 * clave. Se exige que la URL cuelgue de nuestra base pública: si no, no es un
 * objeto nuestro y devolver una clave igualmente convertiría cualquier enlace
 * externo en una ruta dentro del bucket.
 */
export function objectKeyFromPublicUrl(url: string): string | null {
  const ctx = getClient();
  if (!ctx) return null;

  const base = `${ctx.config.publicBaseUrl.replace(/\/$/, '')}/`;
  if (!url.startsWith(base)) return null;

  const key = url.slice(base.length);
  // Una clave vacía o con recorrido relativo no es nuestra.
  if (key.length === 0 || key.includes('..')) return null;
  return key;
}

/** Construye la clave de un archivo dentro de la carpeta de una subida. */
export function uploadObjectKey(uploadId: string, filename: string): string {
  return path.posix.join('uploads', uploadId, filename);
}

/** Prefijo (la "carpeta") de una subida, para borrarla entera. */
export function uploadPrefix(uploadId: string): string {
  return path.posix.join('uploads', uploadId) + '/';
}

/** Sólo para pruebas: olvida la configuración cacheada. */
export function resetObjectStorageCache(): void {
  cached = undefined;
}
