"use client";

/**
 * Peyma Audio Engine (web) — grafo de Web Audio API sobre el `<audio>` del
 * PlayerDeck.
 *
 *   <audio> ─► MediaElementSource ─► lowpass ─► gain ─► analyser ─► destino
 *
 * El `analyser` va al final para que lo que mide sea exactamente lo que se
 * escucha (con filtros aplicados), no la señal cruda.
 *
 * Dos restricciones del navegador que condicionan el diseño:
 *  1. `createMediaElementSource` sólo se puede llamar UNA vez por elemento —
 *     por eso el grafo se construye una sola vez y se cachea.
 *  2. Si el audio viene de otro origen SIN cabeceras CORS, el navegador
 *     silencia la salida. Por eso el `<audio>` usa `crossOrigin="anonymous"`
 *     y la URL pasa por nuestro proxy (`/api/tracks/:id/stream`).
 */

const LOFI_CUTOFF_HZ = 3000;
const FFT_SIZE = 256;

interface AudioGraph {
  context: AudioContext;
  lowpass: BiquadFilterNode;
  gain: GainNode;
  analyser: AnalyserNode;
  /** `ArrayBuffer` explícito (no `ArrayBufferLike`): `getByteFrequencyData` no acepta buffers compartidos. */
  frequencyData: Uint8Array<ArrayBuffer>;
}

let graph: AudioGraph | null = null;
let connectedElement: HTMLAudioElement | null = null;

/** Construye el grafo la primera vez; después devuelve el mismo. `null` si el navegador no soporta Web Audio. */
export function initAudioEngine(element: HTMLAudioElement): AudioGraph | null {
  if (graph && connectedElement === element) return graph;
  if (typeof window === "undefined") return null;

  const AudioCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtor) return null;

  try {
    const context = new AudioCtor();
    const source = context.createMediaElementSource(element);

    const lowpass = context.createBiquadFilter();
    lowpass.type = "lowpass";
    // Arranca "abierto" (sin efecto audible) — el modo Lo-Fi lo baja a LOFI_CUTOFF_HZ.
    lowpass.frequency.value = context.sampleRate / 2;

    const gain = context.createGain();
    gain.gain.value = 1;

    const analyser = context.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.smoothingTimeConstant = 0.8;

    source.connect(lowpass);
    lowpass.connect(gain);
    gain.connect(analyser);
    analyser.connect(context.destination);

    graph = { context, lowpass, gain, analyser, frequencyData: new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount)) };
    connectedElement = element;
    return graph;
  } catch {
    // Navegador sin soporte, o el elemento ya tenía un source: se sigue
    // reproduciendo por la ruta normal del `<audio>`, sólo sin efectos.
    return null;
  }
}

/** El contexto arranca suspendido hasta que hay un gesto del usuario. */
export async function resumeAudioContext(): Promise<void> {
  if (graph?.context.state === "suspended") {
    await graph.context.resume().catch(() => {});
  }
}

export function setLofiEnabled(enabled: boolean): void {
  if (!graph) return;
  const target = enabled ? LOFI_CUTOFF_HZ : graph.context.sampleRate / 2;
  // Rampa corta en vez de salto seco: un cambio instantáneo de filtro produce un "click" audible.
  graph.lowpass.frequency.setTargetAtTime(target, graph.context.currentTime, 0.08);
}

/** Copia el espectro actual al array reutilizado (sin asignar memoria en cada frame). */
export function getFrequencyData(): Uint8Array | null {
  if (!graph) return null;
  graph.analyser.getByteFrequencyData(graph.frequencyData);
  return graph.frequencyData;
}

export function isEngineReady(): boolean {
  return graph !== null;
}
