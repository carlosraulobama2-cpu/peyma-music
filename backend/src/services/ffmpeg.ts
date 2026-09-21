/**
 * Peyma Music API — Envoltorio de ffmpeg
 *
 * Todo el procesamiento de audio pesado (waveform, loudness, transcodificación)
 * pasa por acá. Dos decisiones que conviene entender antes de tocar esto:
 *
 * 1. El binario viene de `ffmpeg-static`, no del sistema. Instalar ffmpeg a
 *    mano en cada máquina de desarrollo y en el contenedor de producción es
 *    una fuente de "en mi máquina funciona"; el paquete trae el ejecutable y
 *    la versión queda fijada en el package-lock como cualquier dependencia.
 *
 * 2. Se usa `execFile`/`spawn` con un ARRAY de argumentos, nunca `exec` con
 *    una cadena. Los nombres de archivo vienen de subidas de usuarios: una
 *    cadena pasada por el shell convertiría un nombre con comillas o `;` en
 *    ejecución de comandos.
 */
import { spawn } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';

/** Tope de seguridad: un máster de 10 minutos no debería tardar más que esto. */
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

export class FfmpegError extends Error {
  readonly exitCode: number | null;
  /** Últimas líneas de stderr — ffmpeg escribe ahí todos sus diagnósticos. */
  readonly stderrTail: string;

  constructor(message: string, exitCode: number | null, stderrTail: string) {
    super(message);
    this.name = 'FfmpegError';
    this.exitCode = exitCode;
    this.stderrTail = stderrTail;
  }
}

function resolveBinary(): string {
  // `ffmpeg-static` exporta `null` si no hay build para la plataforma actual.
  if (!ffmpegPath) {
    throw new FfmpegError('ffmpeg-static no tiene binario para esta plataforma', null, '');
  }
  return ffmpegPath;
}

/** ¿Está disponible ffmpeg? Lo consultan las rutas para degradar sin romper. */
export function isFfmpegAvailable(): boolean {
  return Boolean(ffmpegPath);
}

interface RunOptions {
  /** Si es true, stdout se acumula en un Buffer; si no, se descarta. */
  captureStdout?: boolean;
  timeoutMs?: number;
}

interface RunResult {
  stdout: Buffer;
  stderr: string;
}

/**
 * Corre ffmpeg y espera a que termine.
 *
 * stdout se acumula en memoria sólo cuando se pide (`captureStdout`), porque
 * para el waveform el PCM decodificado puede ser de decenas de MB y no tiene
 * sentido retenerlo cuando la salida ya va a un archivo.
 */
export function runFfmpeg(args: string[], options: RunOptions = {}): Promise<RunResult> {
  const { captureStdout = false, timeoutMs = DEFAULT_TIMEOUT_MS } = options;

  return new Promise((resolve, reject) => {
    const child = spawn(resolveBinary(), args, { windowsHide: true });

    const stdoutChunks: Buffer[] = [];
    // stderr se recorta: ffmpeg es muy verboso y sólo interesa el final,
    // que es donde aparece el error real si algo falla.
    let stderr = '';

    if (captureStdout) {
      child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
    } else {
      child.stdout.resume();
    }

    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-8000);
    });

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new FfmpegError(`ffmpeg superó el límite de ${timeoutMs} ms`, null, stderr));
    }, timeoutMs);

    child.on('error', (error) => {
      clearTimeout(timer);
      reject(new FfmpegError(`No se pudo ejecutar ffmpeg: ${error.message}`, null, stderr));
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new FfmpegError(`ffmpeg terminó con código ${code}`, code, stderr));
        return;
      }
      resolve({ stdout: Buffer.concat(stdoutChunks), stderr });
    });
  });
}

/**
 * Duración en segundos del archivo.
 *
 * Se obtiene de ffmpeg y no de ffprobe a propósito: `ffmpeg-static` no
 * incluye ffprobe, y añadir `ffprobe-static` sería un segundo binario de
 * ~80 MB para leer un número que ffmpeg ya imprime en stderr.
 */
export async function probeDurationSeconds(inputPath: string): Promise<number | null> {
  try {
    // `-f null -` decodifica sin escribir nada; el resumen final trae `time=`.
    const { stderr } = await runFfmpeg(['-hide_banner', '-i', inputPath, '-f', 'null', '-']);
    const matches = [...stderr.matchAll(/time=(\d+):(\d{2}):(\d{2})\.(\d{2})/g)];
    const last = matches.at(-1);
    if (!last) return null;
    const [, h, m, s, cs] = last;
    return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(cs) / 100;
  } catch {
    return null;
  }
}
