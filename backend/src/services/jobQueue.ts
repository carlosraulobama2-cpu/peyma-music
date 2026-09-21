/**
 * Peyma Music API — Cola de trabajos de procesamiento
 *
 * Por qué NO es BullMQ: BullMQ necesita un servidor Redis, y este despliegue
 * (Render + Neon) no tiene uno. Levantar Redis sólo para esto sería un
 * servicio más que mantener, pagar y monitorear antes de que haya volumen
 * que lo justifique.
 *
 * Qué se hizo en su lugar: la cola vive en Postgres (`ProcessingJob`) y la
 * consume un worker en proceso. Eso da lo que realmente importa acá —
 * durabilidad (un reinicio no pierde trabajos), visibilidad (el panel lee el
 * estado con un SELECT) y reintentos.
 *
 * Qué NO da, y conviene saberlo antes de crecer: no hay varios workers
 * coordinados entre procesos. `claimNextJob` usa `FOR UPDATE SKIP LOCKED`,
 * así que si mañana corren varias instancias no se pisan; pero el planificado
 * por prioridad, los backoffs exponenciales y los eventos en vivo de BullMQ
 * no están. El día que haga falta, la interfaz (`enqueue` / `registerHandler`)
 * es la misma y se cambia el motor de abajo sin tocar quien la usa.
 */
import type { JobKind, JobStatus, Prisma } from '@prisma/client';
import { prisma } from '../prismaClient';

/** Reintentos antes de marcar FAILED definitivamente. */
const MAX_ATTEMPTS = 3;
/** Pausa entre sondeos cuando no hay nada que hacer. */
const IDLE_POLL_MS = 2000;

export interface JobContext {
  jobId: string;
  trackId: string | null;
  uploadId: string | null;
  payload: Prisma.JsonValue | null;
}

/** Devuelve lo que se guarda en `ProcessingJob.result`. */
export type JobHandler = (ctx: JobContext) => Promise<Prisma.InputJsonValue | void>;

const handlers = new Map<JobKind, JobHandler>();

export function registerHandler(kind: JobKind, handler: JobHandler): void {
  handlers.set(kind, handler);
}

export interface EnqueueOptions {
  trackId?: string | null;
  uploadId?: string | null;
  payload?: Prisma.InputJsonValue;
}

export async function enqueue(kind: JobKind, options: EnqueueOptions = {}): Promise<string> {
  const job = await prisma.processingJob.create({
    data: {
      kind,
      status: 'QUEUED',
      trackId: options.trackId ?? null,
      uploadId: options.uploadId ?? null,
      ...(options.payload !== undefined && { payload: options.payload }),
    },
    select: { id: true },
  });
  // Despertar al worker en vez de esperar al próximo sondeo: para una subida
  // desde el panel, dos segundos de latencia extra por trabajo se notan.
  wake();
  return job.id;
}

/**
 * Toma el siguiente trabajo pendiente y lo marca RUNNING atómicamente.
 *
 * `FOR UPDATE SKIP LOCKED` es la parte importante: dos workers que consulten
 * a la vez se llevan filas distintas en lugar de pelearse por la misma. Sin
 * eso, dos instancias transcodificarían la misma pista dos veces.
 */
async function claimNextJob(): Promise<JobContext | null> {
  const rows = await prisma.$queryRaw<
    { id: string; kind: JobKind; trackId: string | null; uploadId: string | null; payload: Prisma.JsonValue | null }[]
  >`
    UPDATE "ProcessingJob"
       SET "status" = 'RUNNING',
           "startedAt" = NOW(),
           "attempts" = "attempts" + 1,
           "updatedAt" = NOW()
     WHERE "id" = (
       SELECT "id" FROM "ProcessingJob"
        WHERE "status" = 'QUEUED'
        ORDER BY "createdAt"
        FOR UPDATE SKIP LOCKED
        LIMIT 1
     )
     RETURNING "id", "kind", "trackId", "uploadId", "payload"
  `;

  const row = rows[0];
  if (!row) return null;

  const handler = handlers.get(row.kind);
  if (!handler) {
    // Un trabajo sin handler registrado no se puede reintentar: falla rápido
    // y queda visible en el panel en vez de dar vueltas en la cola.
    await finishJob(row.id, 'FAILED', null, `No hay handler registrado para ${row.kind}`);
    return null;
  }

  return { jobId: row.id, trackId: row.trackId, uploadId: row.uploadId, payload: row.payload };
}

async function finishJob(
  jobId: string,
  status: JobStatus,
  result: Prisma.InputJsonValue | null,
  errorMessage: string | null,
): Promise<void> {
  await prisma.processingJob.update({
    where: { id: jobId },
    data: {
      status,
      ...(result !== null && { result }),
      errorMessage,
      finishedAt: new Date(),
    },
  });
}

async function runOne(): Promise<boolean> {
  const ctx = await claimNextJob();
  if (!ctx) return false;

  const job = await prisma.processingJob.findUnique({
    where: { id: ctx.jobId },
    select: { kind: true, attempts: true },
  });
  if (!job) return true;

  const handler = handlers.get(job.kind)!;

  try {
    const result = await handler(ctx);
    await finishJob(ctx.jobId, 'COMPLETED', result ?? null, null);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // ffmpeg adjunta el final de stderr, que es donde está la causa real.
    const detail = (error as { stderrTail?: string }).stderrTail;
    const fullMessage = detail ? `${message}\n${detail.slice(-1500)}` : message;

    if (job.attempts >= MAX_ATTEMPTS) {
      await finishJob(ctx.jobId, 'FAILED', null, fullMessage);
    } else {
      // Vuelve a la cola para el próximo intento. El contador ya se
      // incrementó al reclamarlo, así que no puede girar infinitamente.
      await prisma.processingJob.update({
        where: { id: ctx.jobId },
        data: { status: 'QUEUED', errorMessage: fullMessage },
      });
    }
  }
  return true;
}

let running = false;
let stopping = false;
let wakeUp: (() => void) | null = null;

function wake(): void {
  wakeUp?.();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      wakeUp = null;
      resolve();
    }, ms);
    wakeUp = () => {
      clearTimeout(timer);
      wakeUp = null;
      resolve();
    };
  });
}

/** Arranca el worker. Idempotente: llamarlo dos veces no duplica el bucle. */
export function startWorker(): void {
  if (running) return;
  running = true;
  stopping = false;

  void (async () => {
    while (!stopping) {
      let didWork = false;
      try {
        didWork = await runOne();
      } catch (error) {
        // Un fallo acá es de la base, no del trabajo. No se puede dejar que
        // mate el bucle o la cola se detiene en silencio para siempre.
        console.error('[jobQueue] error en el bucle del worker:', error);
      }
      // Sólo se duerme cuando la cola quedó vacía; si había trabajo, se
      // encadena con el siguiente de inmediato.
      if (!didWork) await sleep(IDLE_POLL_MS);
    }
    running = false;
  })();
}

export function stopWorker(): void {
  stopping = true;
  wake();
}

/** Corre la cola hasta vaciarla y vuelve. Para pruebas y scripts. */
export async function drainQueue(maxJobs = 100): Promise<number> {
  let done = 0;
  while (done < maxJobs && (await runOne())) done++;
  return done;
}

/** Reencola un trabajo fallido — lo usa el botón de reintentar del panel. */
export async function retryJob(jobId: string): Promise<void> {
  await prisma.processingJob.update({
    where: { id: jobId },
    data: { status: 'QUEUED', errorMessage: null, attempts: 0, finishedAt: null },
  });
  wake();
}
