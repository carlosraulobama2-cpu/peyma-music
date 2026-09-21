/**
 * Peyma Music — Worker de procesamiento de audio (proceso aparte)
 *
 *   npm run worker
 *
 * Mismo trabajo que el worker que la API arranca dentro de sí misma, pero en
 * su propio proceso. Comparte la cola (que vive en Postgres, no en memoria),
 * así que los dos modos son intercambiables sin migrar nada: sólo cambia
 * quién ejecuta los trabajos.
 *
 * Por qué existe: transcodificar con ffmpeg es una tarea de CPU y memoria
 * sostenidas — un FLAC largo puede tener a un núcleo ocupado un buen rato y
 * reservar cientos de megas. Dentro del proceso web eso compite con las
 * peticiones HTTP, y en una instancia pequeña (el plan básico de Render son
 * 512 MB y CPU compartida) el resultado no es "va más lento": es que el
 * proceso se queda sin memoria y se lo lleva por delante, tirando también la
 * API. Separarlos hace que, como mucho, se caiga el procesamiento.
 *
 * En desarrollo no hace falta: `WORKER_IN_PROCESS` vale `true` por defecto y
 * la API lo arranca ella misma, así que sigue bastando con `npm run dev`.
 */
import 'dotenv/config';
import { prisma } from './prismaClient';
import { logger } from './logger';
import { startWorker, stopWorker } from './services/jobQueue';
import { isFfmpegAvailable } from './services/ffmpeg';
import { describeStorageBackend, isUsingObjectStorage } from './services/storage';
// Importado por su efecto secundario: registra los handlers en la cola.
import './services/processingHandlers';

if (isUsingObjectStorage) {
  logger.info(describeStorageBackend());
} else {
  logger.warn(describeStorageBackend());
}

if (!isFfmpegAvailable()) {
  // Sin ffmpeg este proceso no puede hacer absolutamente nada, así que se
  // sale con error en vez de quedarse vivo fingiendo que trabaja: en Render
  // un worker que no arranca se ve, y uno que gira en vacío no.
  logger.error('ffmpeg no está disponible: el worker no puede procesar nada.');
  process.exit(1);
}

startWorker();
logger.info('Worker de procesamiento de audio iniciado (proceso dedicado)');

function shutdown(signal: string): void {
  logger.info(`${signal} recibido, parando el worker…`);
  // `stopWorker` deja terminar el trabajo en curso; no se corta a media
  // transcodificación, que dejaría una variante a medias en el bucket.
  stopWorker();
  void prisma.$disconnect().then(() => process.exit(0));
  setTimeout(() => process.exit(1), 30_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
