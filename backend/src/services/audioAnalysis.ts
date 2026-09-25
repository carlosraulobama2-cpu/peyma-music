/**
 * Peyma Music API — Motor de análisis de audio
 *
 * ⚠️ IMPORTANTE — léase antes de asumir que esto es DSP real:
 * `HeuristicAudioAnalyzer` NO decodifica ni analiza el audio de verdad (no
 * hay FFT, beat tracking ni extracción de croma). Deriva valores
 * plausibles-pero-deterministas a partir de metadatos del archivo (tamaño,
 * duración, nombre) con el mismo generador con semilla que ya se usa para
 * las estadísticas de artista del lado de la app. Sirve para tener el
 * *pipeline* completo (subir → "analizar" → revisar → publicar) andando de
 * punta a punta ahora mismo, sin bloquear el resto del sistema en integrar
 * una librería de DSP.
 *
 * Para reemplazarlo por análisis real más adelante (fuera de este paso):
 * implementar `AudioAnalyzer` con algo como Essentia/aubio detrás de un
 * microservicio, o un servicio externo (AcoustID, Spotify-like APIs), y
 * cambiar `audioAnalyzer` al final de este archivo por esa implementación
 * — nada en `routes/uploads.ts` tendría que cambiar, porque sólo conoce la
 * interfaz `AudioAnalyzer`, no esta clase.
 */
import { createHash } from 'node:crypto';

export const ANALYZER_VERSION = 'heuristic-v1';

const GENRES = ['lofi', 'jazz', 'ambient', 'pop', 'hiphop', 'classical', 'electronic', 'rock'] as const;
export type AnalysisGenre = (typeof GENRES)[number];

const MOODS = ['Relajado', 'Enérgico', 'Melancólico', 'Alegre', 'Intenso', 'Soñador'] as const;
export type AnalysisMood = (typeof MOODS)[number];

export interface AudioAnalysisResult {
  bpm: number;
  musicalKey: number; // 0–11
  mode: 'major' | 'minor';
  energy: number;
  danceability: number;
  valence: number;
  acousticness: number;
  instrumentalness: number;
  loudnessDb: number;
  featureVector: number[];
  /**
   * Siempre `null`: aqui no hay clasificador.
   *
   * Hasta ahora se devolvia `pick(rand, GENRES)`, es decir, uno de los ocho
   * generos AL AZAR, y `publish` lo copiaba al Track. El resultado es que
   * cada cancion salia publicada con un genero sacado de una moneda al aire
   * — un tema de trap podia quedar etiquetado como "lofi" — y nadie podia
   * saber que esa etiqueta no significaba nada.
   *
   * El resto de valores inventados de este archivo alimentan ranking y
   * recomendaciones, donde un numero plausible degrada la calidad sin
   * mentirle a nadie a la cara. El genero no: es una etiqueta que el oyente
   * lee como un hecho sobre la cancion. Mejor vacio que inventado, y que lo
   * elija quien la sube.
   */
  suggestedGenre: AnalysisGenre | null;
  suggestedMood: AnalysisMood | null;
  analyzerVersion: string;
}

export interface AudioAnalyzer {
  analyze(input: { buffer: Buffer; durationSeconds: number; originalName: string }): Promise<AudioAnalysisResult>;
}

/** PRNG determinista (mulberry32) — mismo patrón que `artistStore` del lado de la app. */
function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let state = h >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Construye el vector de similitud: BPM normalizado a 0–1 sobre un rango
 * razonable (60–180) + las 6 características 0–1. Todo en la misma escala
 * para que ninguna dimensión domine la distancia sólo por tener un rango
 * numérico más grande que las demás.
 */
function buildFeatureVector(bpm: number, features: Omit<AudioAnalysisResult, 'bpm' | 'musicalKey' | 'mode' | 'featureVector' | 'suggestedGenre' | 'suggestedMood' | 'analyzerVersion' | 'loudnessDb'>): number[] {
  const bpmNormalized = Math.min(1, Math.max(0, (bpm - 60) / 120));
  return [bpmNormalized, features.energy, features.danceability, features.valence, features.acousticness, features.instrumentalness];
}

class HeuristicAudioAnalyzer implements AudioAnalyzer {
  // `durationSeconds` queda en la interfaz porque un analizador real la
  // necesitaría (más contexto para BPM/estructura) — esta implementación
  // heurística no la usa todavía.
  async analyze({ buffer, originalName }: { buffer: Buffer; durationSeconds: number; originalName: string }): Promise<AudioAnalysisResult> {
    // Semilla determinista: mismo archivo → mismo "análisis" siempre (facilita
    // pruebas), pero distinto archivo → distinto resultado, sin importar el
    // tamaño real del buffer en memoria en este cálculo.
    const seed = createHash('sha256').update(buffer.subarray(0, 65536)).update(originalName).digest('hex');
    const rand = seededRandom(seed);

    const bpm = Math.round((60 + rand() * 120) * 10) / 10;
    const musicalKey = Math.floor(rand() * 12);
    const mode: 'major' | 'minor' = rand() > 0.5 ? 'major' : 'minor';
    const energy = round2(rand());
    const danceability = round2(rand());
    const valence = round2(rand());
    const acousticness = round2(rand());
    const instrumentalness = round2(rand());
    const loudnessDb = Math.round((-20 + rand() * 17) * 10) / 10; // entre -20 y -3 dBFS, rango típico de streaming

    const featureVector = buildFeatureVector(bpm, { energy, danceability, valence, acousticness, instrumentalness });

    return {
      bpm,
      musicalKey,
      mode,
      energy,
      danceability,
      valence,
      acousticness,
      instrumentalness,
      loudnessDb,
      featureVector,
      suggestedGenre: null,
      suggestedMood: null,
      analyzerVersion: ANALYZER_VERSION,
    };
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export const audioAnalyzer: AudioAnalyzer = new HeuristicAudioAnalyzer();
export { GENRES as ANALYSIS_GENRES, MOODS };
