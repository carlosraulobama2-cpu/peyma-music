/**
 * Peyma Music API — Importación de una canción desde una URL
 *
 * Pega una URL de audio en el panel, se extraen sus metadatos y su portada,
 * se normaliza el volumen al estándar de la plataforma y queda todo listo
 * para que un administrador lo revise antes de publicarlo.
 *
 * ALCANCE: sólo URLs que apuntan DIRECTAMENTE a un archivo de audio, o a una
 * página que declara uno en sus metaetiquetas Open Graph. No extrae de
 * YouTube, SoundCloud ni plataformas equivalentes; ver `assertImportableUrl`.
 *
 * El flujo tiene dos pasos a propósito, y no uno:
 *
 *   1. `inspectUrl`  — descarga, procesa, sube a R2 y DEVUELVE lo extraído.
 *                      No toca la tabla `Track`.
 *   2. confirmación  — el administrador corrige título y artista, declara
 *                      que tiene derechos, y ahí nace la pista.
 *
 * Separarlos importa: los metadatos incrustados en un MP3 suelen venir mal
 * (el artista en el título, el álbum vacío, acentos rotos), y publicar
 * directamente llenaría el catálogo de basura que luego hay que limpiar a
 * mano.
 */
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { parseFile } from 'music-metadata';
import * as cheerio from 'cheerio';
import { runFfmpeg, probeDurationSeconds } from './ffmpeg';
import { TARGET_LUFS, TARGET_TRUE_PEAK_DB } from './loudness';
import { putObject, publicUrlFor, isObjectStorageEnabled } from './objectStorage';
import { BadRequestError, AppError } from '../utils/errors';
import { logger } from '../logger';

/** Tope de descarga. Una canción comprimida no pasa de aquí ni de lejos. */
const MAX_AUDIO_BYTES = 60 * 1024 * 1024;
/** Tope para la portada. */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
/** Una canción más larga que esto casi siempre es un podcast o un DJ set entero. */
const MAX_DURATION_SECONDS = 20 * 60;
/** Por debajo de esto no es una canción. */
const MIN_DURATION_SECONDS = 10;

/** Cuánto se espera por la descarga antes de rendirse. */
const FETCH_TIMEOUT_MS = 60_000;

/**
 * Plataformas cuyo audio no se extrae.
 *
 * Sus condiciones de uso prohíben descargar el contenido, y prácticamente
 * todo lo que alojan tiene derechos de terceros. Un importador que acepte
 * estos enlaces no es una herramienta de migración de catálogo: es una de
 * copia masiva, y dejaría a Peyma Music publicando obras ajenas — lo mismo
 * que el propio panel persigue con las retiradas por plagio.
 *
 * Se comprueba el dominio y no el texto de la URL para que no baste con
 * añadir parámetros o usar un acortador conocido.
 */
const BLOCKED_HOSTS = [
  'youtube.com', 'youtu.be', 'music.youtube.com', 'ytimg.com',
  'soundcloud.com', 'snd.sc',
  'spotify.com', 'open.spotify.com',
  'music.apple.com', 'itunes.apple.com',
  'deezer.com', 'tidal.com', 'bandcamp.com',
  'vimeo.com', 'dailymotion.com', 'tiktok.com',
  'instagram.com', 'facebook.com', 'twitter.com', 'x.com',
];

/** Tipos de audio que se aceptan como fuente. */
const AUDIO_CONTENT_TYPES = new Set([
  'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/aac', 'audio/x-m4a',
  'audio/ogg', 'audio/opus', 'audio/wav', 'audio/x-wav', 'audio/flac', 'audio/x-flac',
]);

export interface ExtractedTrack {
  /** Identificador de esta extracción. Aparece en las rutas del bucket. */
  importId: string;
  title: string;
  artistName: string | null;
  albumTitle: string | null;
  durationSeconds: number;
  /** URL pública del audio ya procesado. */
  audioUrl: string;
  /** URL pública de la portada, si se encontró alguna. */
  coverUrl: string | null;
  /** Sonoridad medida ANTES de normalizar, para poder enseñar qué se corrigió. */
  originalLufs: number | null;
  sourceUrl: string;
  /** De dónde salió cada dato, para que el revisor sepa de qué fiarse. */
  metadataSource: 'id3' | 'opengraph' | 'filename';
}

/**
 * Rechaza lo que no se puede importar, antes de gastar una descarga.
 *
 * Además del veto por plataforma, se exige http(s) y se descartan destinos
 * de red interna: sin eso, este endpoint sería una puerta para que un
 * administrador (o quien le robara la sesión) hiciera peticiones desde el
 * servidor a servicios que sólo son visibles desde dentro.
 */
export function assertImportableUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new BadRequestError('Eso no parece una URL válida.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new BadRequestError('Sólo se aceptan enlaces http o https.');
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  if (BLOCKED_HOSTS.some((blocked) => host === blocked || host.endsWith(`.${blocked}`))) {
    throw new AppError(
      `No se importa desde ${host}. Sus condiciones de uso prohíben descargar el contenido y casi todo lo que aloja ` +
        'tiene derechos de terceros. Usa un enlace directo al archivo de audio del que tengas los derechos.',
      422,
      'source_not_allowed',
    );
  }

  // Destinos internos: localhost, enlaces locales y los tres rangos privados.
  if (/^(localhost|127\.|0\.0\.0\.0|169\.254\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) {
    throw new BadRequestError('No se pueden importar direcciones de red interna.');
  }

  return parsed;
}

interface Downloaded {
  filePath: string;
  contentType: string;
  bytes: number;
}

/** Descarga con tope de tamaño y de tiempo, escribiendo a disco por trozos. */
async function download(url: URL, destination: string, maxBytes: number): Promise<Downloaded> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'PeymaMusic/1.0 (+importador de catálogo)' },
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new AppError(`El origen respondió ${response.status}.`, 422, 'source_unreachable');
    }

    // Si el servidor declara el tamaño y ya se pasa, no se empieza siquiera.
    const declared = Number(response.headers.get('content-length') ?? 0);
    if (declared > maxBytes) {
      throw new BadRequestError(`El archivo pesa ${Math.round(declared / 1024 / 1024)} MB y el máximo son ${Math.round(maxBytes / 1024 / 1024)} MB.`);
    }

    if (!response.body) throw new AppError('El origen no devolvió contenido.', 422, 'source_empty');

    const handle = await fs.open(destination, 'w');
    let bytes = 0;
    try {
      // Se cuenta mientras se escribe: un servidor puede mentir en
      // `content-length` o no mandarlo, y sin esto un archivo enorme llenaría
      // el disco del servidor.
      for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
        bytes += chunk.length;
        if (bytes > maxBytes) {
          throw new BadRequestError(`El archivo supera los ${Math.round(maxBytes / 1024 / 1024)} MB.`);
        }
        await handle.write(chunk);
      }
    } finally {
      await handle.close();
    }

    return {
      filePath: destination,
      contentType: (response.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase(),
      bytes,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new AppError('El origen tardó demasiado en responder.', 504, 'source_timeout');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

interface PageMetadata {
  audioUrl: string | null;
  title: string | null;
  artistName: string | null;
  imageUrl: string | null;
}

/**
 * Lee las metaetiquetas Open Graph de una página con reproductor.
 *
 * Las URL relativas se resuelven contra la página, no se descartan: es
 * habitual que `og:audio` venga como `/media/cancion.mp3`.
 */
function readOpenGraph(html: string, pageUrl: URL): PageMetadata {
  const $ = cheerio.load(html);
  const meta = (property: string): string | null =>
    $(`meta[property="${property}"]`).attr('content') ??
    $(`meta[name="${property}"]`).attr('content') ??
    null;

  const absolute = (value: string | null): string | null => {
    if (!value) return null;
    try {
      return new URL(value, pageUrl).toString();
    } catch {
      return null;
    }
  };

  return {
    audioUrl: absolute(meta('og:audio') ?? meta('og:audio:secure_url') ?? meta('twitter:player:stream')),
    title: meta('og:title') ?? ($('title').first().text().trim() || null),
    artistName: meta('music:musician') ?? meta('og:site_name'),
    imageUrl: absolute(meta('og:image') ?? meta('og:image:secure_url') ?? meta('twitter:image')),
  };
}

/**
 * Título y artista a partir del nombre del archivo.
 *
 * Último recurso cuando no hay ni ID3 ni Open Graph. Reconoce el patrón
 * "Artista - Título", que es como viene nombrado casi todo, y limpia los
 * guiones bajos que deja la descarga.
 */
function guessFromFilename(url: URL): { title: string; artistName: string | null } {
  const raw = decodeURIComponent(path.basename(url.pathname))
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[_+]+/g, ' ')
    .trim();

  const dash = raw.match(/^(.{2,60}?)\s+[-–—]\s+(.{2,120})$/);
  if (dash) return { artistName: dash[1]!.trim(), title: dash[2]!.trim() };

  return { title: raw || 'Sin título', artistName: null };
}

/**
 * Convierte a AAC 320 kbps normalizando el volumen a −14 LUFS.
 *
 * `loudnorm` en una sola pasada y no en dos: la de dos pasadas es más
 * precisa, pero exige analizar el archivo entero antes de empezar a
 * codificar, lo que duplica el tiempo. Para una importación que un
 * administrador está esperando en pantalla, la diferencia de precisión (unas
 * décimas de LUFS) no compensa el doble de espera.
 *
 * El límite de pico real evita que la normalización, al subir el volumen de
 * una pista floja, sature en los picos.
 */
async function normalizeToAac(inputPath: string, outputPath: string): Promise<void> {
  await runFfmpeg([
    '-hide_banner',
    '-i', inputPath,
    '-vn',
    '-af', `loudnorm=I=${TARGET_LUFS}:TP=${TARGET_TRUE_PEAK_DB}:LRA=11`,
    '-c:a', 'aac',
    '-b:a', '320k',
    '-ar', '48000',
    '-movflags', '+faststart',
    '-y', outputPath,
  ]);
}

/** Mide la sonoridad original, sólo para informar. Si falla, no se interrumpe. */
async function measureOriginalLufs(inputPath: string): Promise<number | null> {
  try {
    const { stderr } = await runFfmpeg([
      '-hide_banner', '-i', inputPath, '-af', 'ebur128=framelog=quiet', '-f', 'null', '-',
    ]);
    const match = stderr.match(/I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/);
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

/**
 * Extrae una canción de una URL y la deja subida al bucket, sin publicarla.
 *
 * Lo que devuelve es un borrador: nada de esto existe todavía en el catálogo.
 */
export async function inspectUrl(rawUrl: string): Promise<ExtractedTrack> {
  if (!isObjectStorageEnabled()) {
    throw new AppError('La importación necesita el bucket configurado.', 503, 'object_storage_disabled');
  }

  const url = assertImportableUrl(rawUrl);
  const importId = randomUUID();
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), `peyma-import-${importId.slice(0, 8)}-`));

  try {
    // 1. Traer el origen. Puede ser el audio directamente o una página que lo declare.
    let audioSource = url;
    let pageMeta: PageMetadata | null = null;

    const firstPass = await download(url, path.join(workDir, 'source'), MAX_AUDIO_BYTES);

    const looksLikeHtml = firstPass.contentType.startsWith('text/html');
    if (looksLikeHtml) {
      const html = await fs.readFile(firstPass.filePath, 'utf8');
      pageMeta = readOpenGraph(html, url);
      if (!pageMeta.audioUrl) {
        throw new AppError(
          'Esa página no declara ningún archivo de audio (falta la etiqueta og:audio). Pega el enlace directo al archivo.',
          422,
          'no_audio_found',
        );
      }
      audioSource = assertImportableUrl(pageMeta.audioUrl);
      await download(audioSource, path.join(workDir, 'source'), MAX_AUDIO_BYTES);
    } else if (!AUDIO_CONTENT_TYPES.has(firstPass.contentType) && firstPass.contentType !== '') {
      throw new AppError(
        `El enlace devuelve "${firstPass.contentType}", que no es audio.`,
        422,
        'not_audio',
      );
    }

    const sourcePath = path.join(workDir, 'source');

    // 2. Metadatos. Se prefieren las etiquetas internas del archivo: las puso
    //    quien lo produjo, mientras que Open Graph lo pone quien lo publica.
    let title: string | null = null;
    let artistName: string | null = null;
    let albumTitle: string | null = null;
    let embeddedCover: { data: Buffer; format: string } | null = null;
    let metadataSource: ExtractedTrack['metadataSource'] = 'filename';

    try {
      const tags = await parseFile(sourcePath);
      if (tags.common.title) {
        title = tags.common.title;
        artistName = tags.common.artist ?? tags.common.albumartist ?? null;
        albumTitle = tags.common.album ?? null;
        metadataSource = 'id3';
      }
      const picture = tags.common.picture?.[0];
      if (picture) {
        embeddedCover = { data: Buffer.from(picture.data), format: picture.format };
      }
    } catch {
      // Sin etiquetas legibles no pasa nada: se cae a Open Graph o al nombre.
    }

    if (!title && pageMeta?.title) {
      title = pageMeta.title;
      artistName = artistName ?? pageMeta.artistName;
      metadataSource = 'opengraph';
    }
    if (!title) {
      const guess = guessFromFilename(audioSource);
      title = guess.title;
      artistName = artistName ?? guess.artistName;
      metadataSource = 'filename';
    }

    // 3. Duración: descarta lo que claramente no es una canción antes de gastar
    //    tiempo de CPU normalizando.
    const duration = await probeDurationSeconds(sourcePath);
    if (duration === null) {
      throw new AppError('No se pudo leer el audio: puede estar corrupto o no ser un archivo de sonido.', 422, 'unreadable_audio');
    }
    if (duration < MIN_DURATION_SECONDS || duration > MAX_DURATION_SECONDS) {
      throw new BadRequestError(
        `La pista dura ${Math.round(duration)} s y se aceptan entre ${MIN_DURATION_SECONDS} s y ${MAX_DURATION_SECONDS / 60} min.`,
      );
    }

    const originalLufs = await measureOriginalLufs(sourcePath);

    // 4. Normalizar y codificar.
    const outputPath = path.join(workDir, 'normalizado.m4a');
    await normalizeToAac(sourcePath, outputPath);
    const audioBuffer = await fs.readFile(outputPath);
    const audioKey = `tracks/extracted-${importId}.m4a`;
    await putObject(audioKey, audioBuffer, 'audio/mp4');

    // 5. Portada: la incrustada gana a la de la página, por el mismo motivo
    //    que las etiquetas internas.
    let coverUrl: string | null = null;
    const coverCandidate = embeddedCover
      ? { buffer: embeddedCover.data, contentType: embeddedCover.format }
      : await fetchPageCover(pageMeta?.imageUrl ?? null, workDir);

    if (coverCandidate) {
      const extension = coverCandidate.contentType.includes('png') ? 'png' : 'jpg';
      const coverKey = `covers/extracted-${importId}.${extension}`;
      await putObject(coverKey, coverCandidate.buffer, extension === 'png' ? 'image/png' : 'image/jpeg');
      coverUrl = publicUrlFor(coverKey);
    }

    return {
      importId,
      title: title.trim().slice(0, 200),
      artistName: artistName?.trim().slice(0, 200) ?? null,
      albumTitle: albumTitle?.trim().slice(0, 200) ?? null,
      durationSeconds: Math.round(duration),
      audioUrl: publicUrlFor(audioKey),
      coverUrl,
      originalLufs,
      sourceUrl: url.toString(),
      metadataSource,
    };
  } finally {
    // El temporal se borra pase lo que pase: son decenas de megas por
    // importación y se acumularían hasta llenar el disco.
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Baja la portada declarada por la página. Si falla, se sigue sin ella. */
async function fetchPageCover(
  imageUrl: string | null,
  workDir: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  if (!imageUrl) return null;
  try {
    const parsed = assertImportableUrl(imageUrl);
    const file = await download(parsed, path.join(workDir, 'portada'), MAX_IMAGE_BYTES);
    if (!file.contentType.startsWith('image/')) return null;
    return { buffer: await fs.readFile(file.filePath), contentType: file.contentType };
  } catch (error) {
    logger.warn({ err: error, imageUrl }, 'No se pudo traer la portada de la página; se importa sin ella');
    return null;
  }
}
