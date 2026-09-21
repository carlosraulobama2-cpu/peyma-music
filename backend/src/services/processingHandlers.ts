/**
 * Peyma Music API — Handlers de los trabajos de procesamiento
 *
 * Cada handler traduce un `JobKind` en trabajo real sobre el archivo y
 * escribe el resultado en la base. Están todos acá y no repartidos por los
 * servicios para que haya un único lugar donde ver qué escribe qué: los
 * servicios (`waveform`, `loudness`, `transcode`) son puros sobre archivos y
 * no conocen Prisma.
 */
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import type { AudioQuality } from '@prisma/client';
import { prisma } from '../prismaClient';
import { registerHandler, type JobContext } from './jobQueue';
import { extractWaveform, DEFAULT_PEAK_COUNT } from './waveform';
import { measureLoudness } from './loudness';
import { transcodeVariant, profileFor, isLosslessSource } from './transcode';
import { storageService } from './storage';
import { extractDominantColor } from './dominantColor';

/**
 * Resuelve el audio de una pista a algo que ffmpeg pueda abrir.
 *
 * Prefiere el máster: es sin pérdida y es la fuente correcta para medir y
 * transcodificar. Si no hay máster (catálogo viejo, seed), cae al `audioUrl`,
 * porque medir el comprimido es mejor que no medir nada.
 *
 * Devuelve o bien una ruta local, o bien una URL http(s) tal cual: ffmpeg
 * sabe leer de la red, así que una pista alojada fuera (o en S3/R2) se
 * procesa sin descargarla a un temporal primero.
 *
 * El esquema se valida en lista blanca y no por descarte. ffmpeg soporta
 * ~35 protocolos, varios de ellos capaces de leer del disco o de la red
 * local (`file:`, `subfile:`, `concat:`, `sftp:`). Aceptar cualquier cosa
 * que esté en la columna convertiría un INSERT malicioso en lectura
 * arbitraria de archivos del servidor.
 */
async function resolveAudioInput(trackId: string): Promise<string> {
  const track = await prisma.track.findUnique({
    where: { id: trackId },
    select: { masterUrl: true, audioUrl: true },
  });
  if (!track) throw new Error(`La pista ${trackId} ya no existe`);

  const url = track.masterUrl ?? track.audioUrl;
  if (!url) throw new Error(`La pista ${trackId} no tiene archivo de audio`);

  // Archivo servido por nosotros desde disco.
  const localPath = storageService.localPathForUrl(url);
  if (localPath) return localPath;

  if (/^https?:\/\//i.test(url)) return url;

  throw new Error(`Esquema de URL no permitido para procesar audio: ${url}`);
}

/**
 * Carpeta temporal donde ffmpeg escribe una variante antes de guardarla.
 *
 * ffmpeg sólo sabe escribir en un sistema de archivos, no en un bucket, así
 * que la variante pasa siempre por disco aunque el destino final sea S3.
 * Antes se escribía directamente en la carpeta pública y la URL se armaba a
 * mano; ahora la produce quien guarda, que es el único que sabe dónde acabó.
 */
async function makeVariantTempDir(trackId: string): Promise<string> {
  const dir = path.join(os.tmpdir(), 'peyma-variants', trackId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/** Tipo de contenido de una variante, por su formato. */
function variantContentType(format: 'm4a' | 'flac'): string {
  return format === 'flac' ? 'audio/flac' : 'audio/mp4';
}

function requireTrackId(ctx: JobContext): string {
  if (!ctx.trackId) throw new Error('El trabajo no tiene trackId');
  return ctx.trackId;
}

/**
 * Asegura que exista la fila de `AudioAnalysis` antes de actualizarla.
 *
 * Hace falta porque el catálogo del seed tiene pistas sin análisis, y los
 * trabajos de waveform/loudness se pueden lanzar sobre ellas desde el panel.
 * Los campos obligatorios se rellenan en 0 y quedan marcados por
 * `analyzerVersion`, así se distingue una fila esqueleto de una analizada.
 */
async function ensureAnalysisRow(trackId: string): Promise<void> {
  const existing = await prisma.audioAnalysis.findUnique({ where: { trackId }, select: { id: true } });
  if (existing) return;

  await prisma.audioAnalysis.create({
    data: {
      trackId,
      bpm: 0,
      musicalKey: 0,
      mode: 'major',
      energy: 0,
      danceability: 0,
      valence: 0,
      acousticness: 0,
      instrumentalness: 0,
      loudnessDb: 0,
      featureVector: [],
      analyzerVersion: 'pendiente',
    },
  });
}

registerHandler('WAVEFORM', async (ctx) => {
  const trackId = requireTrackId(ctx);
  const inputPath = await resolveAudioInput(trackId);

  const peakCount =
    typeof ctx.payload === 'object' && ctx.payload !== null && 'peakCount' in ctx.payload
      ? Number((ctx.payload as { peakCount: unknown }).peakCount)
      : DEFAULT_PEAK_COUNT;

  const { peaks, durationSeconds } = await extractWaveform(
    inputPath,
    Number.isInteger(peakCount) && peakCount > 0 ? peakCount : DEFAULT_PEAK_COUNT,
  );

  await ensureAnalysisRow(trackId);
  await prisma.audioAnalysis.update({ where: { trackId }, data: { waveformPeaks: peaks } });

  return { peakCount: peaks.length, durationSeconds: Math.round(durationSeconds) };
});

registerHandler('LOUDNESS', async (ctx) => {
  const trackId = requireTrackId(ctx);
  const inputPath = await resolveAudioInput(trackId);

  const { integratedLufs, truePeakDb, loudnessRange, gainDb } = await measureLoudness(inputPath);

  await ensureAnalysisRow(trackId);
  await prisma.audioAnalysis.update({
    where: { trackId },
    data: { integratedLufs, truePeakDb, gainDb },
  });

  return { integratedLufs, truePeakDb, loudnessRange, gainDb };
});

registerHandler('TRANSCODE', async (ctx) => {
  const trackId = requireTrackId(ctx);
  const inputPath = await resolveAudioInput(trackId);

  const quality = (ctx.payload as { quality?: AudioQuality } | null)?.quality;
  if (!quality) throw new Error('El trabajo TRANSCODE necesita `quality` en el payload');
  const profile = profileFor(quality);

  // Un FLAC hecho a partir de un MP3 pesa ~16 veces más y no suena mejor:
  // el daño del códec con pérdida ya está en la señal. Se salta en vez de
  // fallar, porque no es un error del trabajo sino del material de origen.
  if (quality === 'LOSSLESS' && !isLosslessSource(inputPath)) {
    return { skipped: true, reason: 'La fuente no es sin pérdida; no se genera variante Hi-Fi' };
  }

  const tempDir = await makeVariantTempDir(trackId);
  let url: string;
  let sizeBytes: number;
  try {
    const produced = await transcodeVariant(inputPath, tempDir, quality);
    // Guardar decide el destino (disco público o bucket) y devuelve la URL
    // definitiva; aquí ya no se construye ninguna a mano.
    const stored = await storageService.saveTrackVariant(
      trackId,
      produced.outputPath,
      variantContentType(profile.format),
    );
    url = stored.url;
    sizeBytes = stored.sizeBytes;
  } finally {
    // El temporal se borra pase lo que pase: un fallo a mitad dejaría
    // archivos de cientos de megas acumulándose en /tmp hasta llenarlo.
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }

  // `upsert` sobre la clave única (trackId, quality): reprocesar reemplaza la
  // variante en vez de acumular filas duplicadas.
  await prisma.audioVariant.upsert({
    where: { trackId_quality: { trackId, quality } },
    create: {
      trackId,
      quality,
      format: profile.format,
      bitrateKbps: profile.bitrateKbps,
      url,
      sizeBytes,
      requiredTier: profile.requiredTier,
    },
    update: { format: profile.format, bitrateKbps: profile.bitrateKbps, url, sizeBytes, requiredTier: profile.requiredTier },
  });

  return { quality, url, sizeBytes, bitrateKbps: profile.bitrateKbps };
});

registerHandler('COLOR', async (ctx) => {
  const trackId = requireTrackId(ctx);

  const track = await prisma.track.findUnique({
    where: { id: trackId },
    select: { coverUrl: true, albumId: true },
  });
  if (!track?.coverUrl) throw new Error('La pista no tiene portada');

  const color = await extractDominantColor(track.coverUrl);
  if (!color) throw new Error(`No se pudo leer la portada: ${track.coverUrl}`);

  // El álbum recibe el mismo color: comparte portada con la pista, y
  // recalcularlo por separado daría exactamente el mismo resultado.
  await prisma.$transaction([
    prisma.track.update({ where: { id: trackId }, data: { dominantColor: color.hex } }),
    prisma.album.update({ where: { id: track.albumId }, data: { dominantColor: color.hex } }),
  ]);

  return { hex: color.hex, luminance: color.luminance };
});
