/**
 * Peyma Music API — Extracción de picos de onda
 *
 * Genera el array de amplitudes que el reproductor dibuja como barra de onda.
 *
 * Cómo funciona: ffmpeg decodifica el archivo a PCM crudo mono de 16 bits a
 * 8 kHz y lo escribe a stdout. Acá se parte esa señal en N tramos iguales y
 * de cada tramo se guarda el pico absoluto, normalizado a 0–1.
 *
 * Por qué 8 kHz y mono: la barra de onda son ~200 barritas en pantalla, así
 * que la resolución temporal que hace falta es ridículamente baja. Decodificar
 * a 44.1 kHz estéreo multiplicaría por 11 la memoria y el tiempo para producir
 * exactamente el mismo dibujo.
 *
 * Por qué el PICO y no el RMS: el RMS aplana los transitorios y todas las
 * canciones terminan pareciendo el mismo rectángulo. El pico conserva el
 * golpe de la batería, que es lo que hace que la onda se vea como la canción.
 */
import { runFfmpeg } from './ffmpeg';

/** Cantidad de barras por defecto. El spec pide 100–200; 200 es el tope útil. */
export const DEFAULT_PEAK_COUNT = 200;

const SAMPLE_RATE = 8000;
/** PCM s16le: 2 bytes por muestra. */
const BYTES_PER_SAMPLE = 2;
const MAX_INT16 = 32768;

export interface WaveformResult {
  /** Amplitudes 0–1, tantas como `peakCount`. */
  peaks: number[];
  /** Muestras totales decodificadas — permite deducir la duración real. */
  sampleCount: number;
  durationSeconds: number;
}

/**
 * Decodifica el archivo y devuelve `peakCount` picos normalizados.
 *
 * Lanza `FfmpegError` si el archivo no es audio decodificable — eso lo
 * atrapa el trabajo de la cola y lo marca como FAILED con el stderr.
 */
export async function extractWaveform(
  inputPath: string,
  peakCount: number = DEFAULT_PEAK_COUNT,
): Promise<WaveformResult> {
  if (!Number.isInteger(peakCount) || peakCount < 1 || peakCount > 2000) {
    throw new RangeError(`peakCount fuera de rango: ${peakCount}`);
  }

  const { stdout } = await runFfmpeg(
    [
      '-hide_banner',
      '-loglevel', 'error',
      '-i', inputPath,
      '-ac', '1', // mono
      '-ar', String(SAMPLE_RATE),
      '-f', 's16le', // PCM crudo con signo, little-endian
      '-', // a stdout
    ],
    { captureStdout: true },
  );

  const sampleCount = Math.floor(stdout.length / BYTES_PER_SAMPLE);
  if (sampleCount === 0) {
    // Un archivo válido pero sin audio (p. ej. sólo metadatos) no es un error
    // de ffmpeg, pero tampoco tiene onda: se devuelve plana en vez de fallar.
    return { peaks: new Array<number>(peakCount).fill(0), sampleCount: 0, durationSeconds: 0 };
  }

  const peaks = new Array<number>(peakCount).fill(0);
  // Tamaño fraccionario a propósito: con `Math.floor` los últimos segundos
  // de la canción se quedarían fuera del último tramo.
  const samplesPerBucket = sampleCount / peakCount;

  for (let i = 0; i < sampleCount; i++) {
    const bucket = Math.min(peakCount - 1, Math.floor(i / samplesPerBucket));
    const sample = stdout.readInt16LE(i * BYTES_PER_SAMPLE);
    // -32768 no tiene positivo representable en int16; el abs se hace en
    // número normal, no en entero de 16 bits, así que no desborda.
    const amplitude = Math.abs(sample) / MAX_INT16;
    if (amplitude > peaks[bucket]!) peaks[bucket] = amplitude;
  }

  // Normalización al pico global: una canción masterizada bajo se vería como
  // una línea casi plana si se dibujara en escala absoluta. Se escala para
  // que la barra más alta llegue a 1 y la FORMA quede legible. El volumen
  // real no se pierde: vive en `AudioAnalysis.integratedLufs`.
  const loudest = Math.max(...peaks);
  if (loudest > 0) {
    for (let i = 0; i < peaks.length; i++) {
      // 3 decimales: más precisión no se ve en pantalla y engorda la fila.
      peaks[i] = Math.round((peaks[i]! / loudest) * 1000) / 1000;
    }
  }

  return { peaks, sampleCount, durationSeconds: sampleCount / SAMPLE_RATE };
}
