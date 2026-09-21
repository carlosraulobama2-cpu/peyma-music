/**
 * Peyma Music (app) — Registro de reproducciones
 *
 * Hasta ahora la app NO registraba nada: todas las métricas de oyentes y
 * tendencias venían sólo de la web, así que la mitad del uso real era
 * invisible en el panel. Esto lo arregla.
 *
 * Cómo funciona, igual que en la web:
 *  1. Al empezar una canción se crea el evento (así "escuchando ahora" y
 *     oyentes mensuales no llegan tarde) y se guarda su id.
 *  2. Mientras suena se acumula el tiempo REALMENTE oído, contando sólo el
 *     avance natural: un salto en la barra no es tiempo escuchado.
 *  3. Al cambiar de pista, pararla o cerrar la app, se completa esa misma
 *     fila con los segundos.
 *
 * Es una sola fila que se corrige, no dos eventos: contar dos veces la misma
 * escucha falsearía todos los rankings del panel.
 *
 * Nada de esto puede hacer fallar la reproducción: todo va en try/catch y
 * los errores se tragan. Que no se registre una escucha es un problema de
 * analítica; que la canción no suene es un problema del usuario.
 */
import { http } from './httpClient';
import { getCoarseCoords } from './locationConsent';

/** Por debajo de esto no es una escucha, es alguien saltando mientras busca. */
const MIN_MEANINGFUL_SECONDS = 3;
/** Margen entre actualizaciones de posición; por encima se asume un salto. */
const MAX_NATURAL_DELTA = 2;

interface ActiveStream {
  trackId: string;
  /** Nulo mientras el servidor todavía no respondió con el id. */
  logId: string | null;
  listened: number;
  lastPosition: number;
  /** Si la pista cambió antes de que llegara el id, se completa en cuanto llegue. */
  finished: boolean;
}

let active: ActiveStream | null = null;

async function complete(stream: ActiveStream): Promise<void> {
  if (!stream.logId) return;
  const seconds = Math.floor(stream.listened);
  try {
    await http.patch(`/streams/${stream.logId}`, {
      secondsPlayed: seconds < MIN_MEANINGFUL_SECONDS ? 0 : seconds,
    });
  } catch {
    // Sin conexión o sesión caducada: la fila se queda sin segundos y las
    // métricas la estiman, que es exactamente lo que declaran hacer.
  }
}

/** Empieza a seguir una pista. Cierra la anterior si la hubiera. */
export function startStream(trackId: string): void {
  void finishStream();

  const stream: ActiveStream = { trackId, logId: null, listened: 0, lastPosition: 0, finished: false };
  active = stream;

  void http
    .post<{ id: string }>('/streams/log', {
      trackId,
      // Sólo si el usuario aceptó y hubo señal. El servidor lo vuelve a
      // comprobar de todas formas.
      ...(getCoarseCoords() ?? {}),
    })
    .then((res) => {
      stream.logId = res.id;
      // La pista ya había cambiado antes de que respondiera el servidor: se
      // completa ahora con lo que se llegó a oír.
      if (stream.finished) void complete(stream);
    })
    .catch(() => {
      // Sin sesión o sin red: no hay nada que completar después.
    });
}

/**
 * Actualiza la posición de reproducción.
 *
 * La llama el hook de eventos del reproductor nativo. Sólo suma el avance
 * natural: un salto adelante daría un delta enorme y uno atrás sería
 * negativo.
 */
export function updateStreamPosition(positionSeconds: number): void {
  if (!active) return;

  const delta = positionSeconds - active.lastPosition;
  if (delta > 0 && delta < MAX_NATURAL_DELTA) active.listened += delta;
  active.lastPosition = positionSeconds;
}

/** Cierra la pista actual y reporta los segundos oídos. */
export async function finishStream(): Promise<void> {
  const stream = active;
  if (!stream) return;

  active = null;
  stream.finished = true;
  await complete(stream);
}
