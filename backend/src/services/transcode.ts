/**
 * Peyma Music API — Transcodificación multicalidad
 *
 * Del máster sin pérdida salen las variantes que realmente se sirven. El
 * máster nunca se entrega al reproductor: es el negativo del que se sacan
 * las copias.
 *
 * Los perfiles están fijados en código (`QUALITY_PROFILES`) y no en la base
 * de datos a propósito: cambiar un bitrate obliga a retranscodificar todo el
 * catálogo para que sea coherente, así que es un cambio de despliegue, no
 * una perilla de configuración que alguien pueda mover sin darse cuenta.
 */
import path from 'node:path';
import fs from 'node:fs/promises';
import { runFfmpeg } from './ffmpeg';
import type { AudioQuality, SubscriptionTier } from '@prisma/client';

export interface QualityProfile {
  quality: AudioQuality;
  /** Extensión/contenedor del archivo resultante. */
  format: 'm4a' | 'flac';
  /** Nulo en sin pérdida: el bitrate lo decide el material. */
  bitrateKbps: number | null;
  /** Argumentos de códec para ffmpeg. */
  codecArgs: string[];
  requiredTier: SubscriptionTier;
}

export const QUALITY_PROFILES: readonly QualityProfile[] = [
  {
    quality: 'LOW',
    format: 'm4a',
    bitrateKbps: 96,
    codecArgs: ['-c:a', 'aac', '-b:a', '96k'],
    requiredTier: 'FREE',
  },
  {
    quality: 'MEDIUM',
    format: 'm4a',
    bitrateKbps: 160,
    codecArgs: ['-c:a', 'aac', '-b:a', '160k'],
    requiredTier: 'FREE',
  },
  {
    quality: 'HIGH',
    format: 'm4a',
    bitrateKbps: 320,
    codecArgs: ['-c:a', 'aac', '-b:a', '320k'],
    requiredTier: 'PREMIUM',
  },
  {
    quality: 'LOSSLESS',
    format: 'flac',
    bitrateKbps: null,
    // -compression_level 8: buen equilibrio. 12 tarda muchísimo más para
    // ahorrar ~1% de tamaño.
    codecArgs: ['-c:a', 'flac', '-compression_level', '8'],
    requiredTier: 'PREMIUM',
  },
] as const;

export function profileFor(quality: AudioQuality): QualityProfile {
  const profile = QUALITY_PROFILES.find((p) => p.quality === quality);
  if (!profile) throw new Error(`Calidad desconocida: ${quality}`);
  return profile;
}

/** Extensiones de formatos sin pérdida que sirven como máster. */
const LOSSLESS_EXTENSIONS = new Set(['.wav', '.flac', '.aiff', '.aif', '.alac', '.ape']);

/**
 * ¿La fuente es realmente sin pérdida?
 *
 * Importa porque transcodificar un MP3 a FLAC produce un archivo enorme
 * (medido acá: 6 MB de AAC 96k contra 97 MB de FLAC, 16 veces más) que NO
 * suena mejor que el MP3 del que salió — el daño del códec con pérdida ya
 * está hecho y el FLAC lo guarda fielmente, ruido de cuantización incluido.
 * Ofrecerlo como "Hi-Fi" sería vender calidad que no existe y pagar el ancho
 * de banda por ella.
 */
export function isLosslessSource(inputPath: string): boolean {
  // De una URL se descarta la query antes de mirar la extensión.
  const withoutQuery = inputPath.split('?')[0] ?? inputPath;
  return LOSSLESS_EXTENSIONS.has(path.extname(withoutQuery).toLowerCase());
}

export interface TranscodeResult {
  outputPath: string;
  sizeBytes: number;
  profile: QualityProfile;
}

/**
 * Genera una variante del máster.
 *
 * `outputDir` tiene que existir. El nombre del archivo lo decide esta función
 * (`<base>.<calidad>.<formato>`) para que dos variantes de la misma pista no
 * puedan pisarse entre sí.
 */
export async function transcodeVariant(
  masterPath: string,
  outputDir: string,
  quality: AudioQuality,
): Promise<TranscodeResult> {
  const profile = profileFor(quality);
  const base = path.basename(masterPath, path.extname(masterPath));
  const outputPath = path.join(outputDir, `${base}.${quality.toLowerCase()}.${profile.format}`);

  await runFfmpeg([
    '-hide_banner',
    '-loglevel', 'error',
    '-y', // sobrescribe: reprocesar una pista reemplaza su variante
    '-i', masterPath,
    '-vn', // descarta la portada incrustada; el artwork se maneja aparte
    ...profile.codecArgs,
    outputPath,
  ]);

  const { size } = await fs.stat(outputPath);
  return { outputPath, sizeBytes: size, profile };
}

/**
 * Genera todas las variantes, en serie.
 *
 * En serie y no en paralelo porque ffmpeg ya satura los núcleos por su
 * cuenta: lanzar cuatro procesos a la vez en el mismo archivo compite por
 * CPU y por E/S de disco y termina tardando más, además de multiplicar por
 * cuatro el pico de memoria. El paralelismo útil está entre pistas
 * distintas, y de eso se encarga la cola.
 */
export async function transcodeAll(
  masterPath: string,
  outputDir: string,
  qualities: readonly AudioQuality[] = QUALITY_PROFILES.map((p) => p.quality),
): Promise<TranscodeResult[]> {
  const results: TranscodeResult[] = [];
  for (const quality of qualities) {
    results.push(await transcodeVariant(masterPath, outputDir, quality));
  }
  return results;
}
