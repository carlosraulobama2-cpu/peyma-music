/**
 * Peyma Music API — Medición de sonoridad (EBU R128 / LUFS)
 *
 * Mide el loudness integrado y el pico real de un máster para que todas las
 * pistas de la plataforma suenen al mismo volumen.
 *
 * Decisión importante: acá se MIDE y se calcula la ganancia, pero NO se
 * reescribe el audio. La ganancia se guarda en `AudioAnalysis.gainDb` y la
 * aplica el reproductor. Dos razones:
 *
 *  - El máster queda intacto. Normalizar destructivamente es irreversible, y
 *    si mañana el objetivo de la plataforma cambia de -14 a -16 LUFS habría
 *    que retranscodificar el catálogo entero en vez de actualizar un número.
 *  - Un usuario puede desactivar la normalización, como en Spotify, y eso es
 *    imposible si el volumen ya viene horneado en el archivo.
 *
 * El filtro `ebur128` de ffmpeg implementa la norma; no reimplementamos el
 * algoritmo de gating de R128 a mano.
 */
import { runFfmpeg } from './ffmpeg';

/** Objetivo de la plataforma, el mismo que usan Spotify y Apple Music. */
export const TARGET_LUFS = -14;
/** Techo de pico real: deja margen para el ringing de los códecs con pérdida. */
export const TARGET_TRUE_PEAK_DB = -1;
/**
 * Piso de la escala de R128. ffmpeg reporta exactamente -70 LUFS cuando todo
 * el material quedó por debajo del gate absoluto, o sea silencio. Es un
 * centinela, no una medición.
 */
export const ABSOLUTE_SILENCE_LUFS = -70;

export interface LoudnessResult {
  /** Loudness integrado en LUFS (negativo). */
  integratedLufs: number;
  /** Pico real en dBTP (normalmente negativo). */
  truePeakDb: number;
  /** Rango dinámico en LU — un valor bajo delata sobrecompresión. */
  loudnessRange: number;
  /**
   * Ganancia en dB a aplicar en reproducción para llegar al objetivo.
   * Ya viene limitada para no pasarse del techo de pico real.
   */
  gainDb: number;
}

/** Parsea el resumen que `ebur128` imprime en stderr al terminar. */
function parseSummary(stderr: string): Omit<LoudnessResult, 'gainDb'> | null {
  // El bloque final tiene la forma:
  //   Integrated loudness:
  //     I:         -14.2 LUFS
  //     Threshold: -24.8 LUFS
  //   Loudness range:
  //     LRA:         7.3 LU
  //   True peak:
  //     Peak:       -0.9 dBFS
  const integrated = /I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/.exec(stderr);
  const range = /LRA:\s*(-?\d+(?:\.\d+)?)\s*LU/.exec(stderr);
  const peak = /Peak:\s*(-?\d+(?:\.\d+)?)\s*dBFS/.exec(stderr);

  if (!integrated) return null;

  return {
    integratedLufs: Number(integrated[1]),
    loudnessRange: range ? Number(range[1]) : 0,
    // Sin lectura de pico se asume 0 dBTP, el peor caso: así la ganancia
    // calculada peca de conservadora en vez de provocar recorte.
    truePeakDb: peak ? Number(peak[1]) : 0,
  };
}

/**
 * Calcula la ganancia de reproducción sin pasarse del techo de pico.
 *
 * Ejemplo: una pista a -20 LUFS necesitaría +6 dB para llegar a -14, pero si
 * su pico ya está en -3 dBTP, subir 6 dB la pondría en +3 y recortaría. Se
 * limita a +2 dB, que es lo que cabe hasta el techo de -1 dBTP.
 */
export function computeGainDb(integratedLufs: number, truePeakDb: number): number {
  // -70 LUFS es el centinela de ffmpeg para "todo el material quedó por
  // debajo del gate de R128", es decir silencio o casi. No es una medición:
  // subir 56 dB un archivo así sólo amplificaría ruido de fondo.
  if (integratedLufs <= ABSOLUTE_SILENCE_LUFS) return 0;

  const desired = TARGET_LUFS - integratedLufs;
  const headroom = TARGET_TRUE_PEAK_DB - truePeakDb;
  // Sólo se limita al subir. Bajar el volumen nunca puede causar recorte, así
  // que una pista más fuerte que el objetivo se atenúa lo que haga falta.
  const gain = desired > 0 ? Math.min(desired, headroom) : desired;
  return Math.round(gain * 100) / 100;
}

export async function measureLoudness(inputPath: string): Promise<LoudnessResult> {
  // `-f null -` descarta la salida: sólo interesa lo que el filtro reporta.
  const { stderr } = await runFfmpeg([
    '-hide_banner',
    '-nostats',
    '-i', inputPath,
    '-filter_complex', 'ebur128=peak=true',
    '-f', 'null',
    '-',
  ]);

  const summary = parseSummary(stderr);
  if (!summary) {
    throw new Error('ffmpeg no devolvió un resumen de sonoridad legible');
  }

  return { ...summary, gainDb: computeGainDb(summary.integratedLufs, summary.truePeakDb) };
}
