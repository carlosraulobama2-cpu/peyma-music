// Debe ser el primer import: prismaClient.ts (y otros módulos) leen
// process.env.DATABASE_URL en el momento en que se cargan, no perezosamente.
import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import cors, { type CorsOptions } from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { rateLimit } from 'express-rate-limit';
import pinoHttp from 'pino-http';
import { ZodError } from 'zod';
import { MulterError } from 'multer';
import { Prisma } from '@prisma/client';
import { prisma } from './prismaClient';
import { logger } from './logger';
import { AppError } from './utils/errors';
import { UPLOADS_STATIC_PREFIX, UPLOADS_STATIC_ROOT, isUsingObjectStorage, describeStorageBackend, warnIfNoPublicBaseUrl } from './services/storage';
import { attachPlayerSocket } from './sockets/playerSocket';
import { maintenanceMiddleware } from './middleware/maintenance';
import { startWorker, stopWorker } from './services/jobQueue';
import { isFfmpegAvailable } from './services/ffmpeg';
// Importado por su efecto secundario: registra los handlers en la cola.
import './services/processingHandlers';
import authRoutes from './routes/auth';
import trackRoutes from './routes/tracks';
import artistRoutes from './routes/artists';
import albumRoutes from './routes/albums';
import playlistRoutes from './routes/playlists';
import userRoutes from './routes/users';
import uploadRoutes from './routes/uploads';
import recommendationRoutes from './routes/recommendations';
import streamRoutes from './routes/streams';
import adminRoutes from './routes/admin';
import audioStreamRoutes from './routes/stream';
import editorialRoutes from './routes/editorial';
import reportRoutes from './routes/reports';
import promotionRoutes from './routes/promotions';
import homeRoutes from './routes/home';
import notificationRoutes from './routes/notifications';
import genreRoutes from './routes/genres';

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';

const allowedOrigins = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

/**
 * Sin lista de orígenes se acepta cualquiera, lo cual está bien en
 * desarrollo (Expo web, el túnel, Vite y Next cambian de puerto) pero es
 * inaceptable en producción: combinado con `credentials: true`, cualquier
 * página de internet podría hacer peticiones autenticadas a esta API con la
 * sesión de quien la visite.
 *
 * Se falla al arrancar en vez de avisar y seguir. Un aviso en un log de
 * Render no lo ve nadie, y el agujero quedaría abierto indefinidamente; un
 * despliegue que no arranca se arregla en cinco minutos.
 */
if (isProd && allowedOrigins.length === 0) {
  logger.error(
    'CORS_ORIGINS está vacía en producción. Define los orígenes reales separados por coma, ' +
      'por ejemplo "https://peyma.app,https://panel.peyma.app". Abortando.',
  );
  process.exit(1);
}

/**
 * ¿Es un origen de la propia máquina de quien desarrolla?
 *
 * Fuera de producción se aceptan todos, además de los que liste
 * `CORS_ORIGINS`. Motivo: en local el origen cambia solo y el fallo que
 * provoca no se parece en nada a su causa.
 *
 *  - `localhost` y `127.0.0.1` son la misma máquina pero DISTINTO origen
 *    para el navegador. Abrir el panel por una y tenerlo permitido por la
 *    otra lo bloquea entero.
 *  - Vite y Next se corren de puerto solos si el suyo está ocupado (5173 →
 *    5174), y entonces el origen ya no está en la lista.
 *
 * En los dos casos el navegador bloquea la respuesta y `fetch` rechaza con
 * un TypeError idéntico al de "no hay red", así que el panel dice "no se
 * pudo conectar con el servidor" mientras el servidor está perfectamente
 * levantado y respondiendo por curl.
 *
 * Esto NO relaja producción: `isProd` corta el atajo, y allí sigue mandando
 * únicamente la lista explícita.
 */
function isLocalDevOrigin(origin: string): boolean {
  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol !== 'http:' && protocol !== 'https:') return false;
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1';
  } catch {
    return false;
  }
}

/**
 * `origin` como función y no como lista: hay que decidir por petición para
 * poder aceptar el comodín de desarrollo. Un `origin` ausente (curl, apps
 * nativas, peticiones servidor a servidor) se acepta — CORS es una
 * protección del navegador y ahí no hay navegador al que proteger.
 */
const corsOrigin: CorsOptions['origin'] = (origin, callback) => {
  if (!origin) return callback(null, true);
  if (allowedOrigins.includes(origin)) return callback(null, true);
  if (!isProd && isLocalDevOrigin(origin)) return callback(null, true);

  // Se registra el origen rechazado: sin esto, diagnosticar un bloqueo de
  // CORS obliga a adivinar, porque el navegador no cuenta el porqué y el
  // servidor no dejaba rastro.
  logger.warn({ origin }, 'CORS: origen no permitido');
  return callback(null, false);
};

app.disable('x-powered-by');
app.set('trust proxy', 1); // detrás de un balanceador/proxy, para que el rate limit vea la IP real

app.use(helmet());
app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
  }),
);
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/health' } }));

// Límite general de la API. Las rutas de auth tienen uno más estricto propio.
app.use(
  '/api',
  rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiadas peticiones, intenta de nuevo en un momento.' },
  }),
);

// Modo mantenimiento: va antes de todas las rutas pero deja pasar /health,
// /api/auth y /api/admin — si no, sería imposible desactivarlo.
app.use(maintenanceMiddleware);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', message: 'Peyma Music API está corriendo' });
});

/** Sonda de disponibilidad real: liveness (arriba) vs readiness (puede atender tráfico). */
app.get('/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ready' });
  } catch (error) {
    logger.error({ err: error }, 'Readiness check falló: sin conexión a la base de datos');
    res.status(503).json({ status: 'not-ready' });
  }
});

// Archivos subidos por los usuarios (audio/portadas). Sólo se sirven desde
// disco cuando NO hay bucket: con S3/R2 los sirve el bucket (o su CDN) y las
// URL guardadas en la base ya son absolutas, así que montar esto además
// dejaría una segunda ruta hacia archivos que aquí no existen.
if (!isUsingObjectStorage) {
  app.use(UPLOADS_STATIC_PREFIX, express.static(UPLOADS_STATIC_ROOT));
}

app.use('/api/auth', authRoutes);
// Va antes que `trackRoutes`: si la ruta no es /:id/stream, Express sigue al siguiente router.
app.use('/api/tracks', audioStreamRoutes);
app.use('/api/tracks', trackRoutes);
app.use('/api/artists', artistRoutes);
app.use('/api/albums', albumRoutes);
app.use('/api/playlists', playlistRoutes);
app.use('/api/users', userRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/recommendations', recommendationRoutes);
app.use('/api/streams', streamRoutes);
app.use('/api/editorial', editorialRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/promotions', promotionRoutes);
app.use('/api/home', homeRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/genres', genreRoutes);
app.use('/api/admin', adminRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// Middleware de errores central: cada ruta puede simplemente `throw`, Express 5
// reenvía el rechazo de la promesa hasta aquí sin necesidad de try/catch propio.
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'Validación fallida', details: err.flatten() });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }

  if (err instanceof MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'El archivo supera el tamaño máximo permitido' : err.message;
    res.status(400).json({ error: message, code: `multer_${err.code}` });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'Recurso no encontrado' });
      return;
    }
    if (err.code === 'P2002') {
      res.status(409).json({ error: 'El recurso ya existe' });
      return;
    }
  }

  req.log?.error({ err }, 'Error no controlado');
  if (!req.log) logger.error({ err }, 'Error no controlado');

  // Nunca exponer el stack/mensaje interno al cliente en producción.
  res.status(500).json({ error: isProd ? 'Error interno del servidor' : String(err) });
});

const server = app.listen(PORT, () => {
  logger.info(`Peyma Music API escuchando en el puerto ${PORT}`);
});

// Peyma Connect: comparte el mismo servidor HTTP que Express, así no hay un
// segundo puerto que abrir ni configurar en el cliente.
const io = attachPlayerSocket(server, allowedOrigins);

// Qué almacenamiento quedó activo. Se registra siempre, y como aviso si no
// hay bucket: es la diferencia entre que las subidas sobrevivan a un
// despliegue o se pierdan en silencio.
if (isUsingObjectStorage) {
  logger.info(describeStorageBackend());
} else {
  logger.warn(describeStorageBackend());
}

const avisoUrlPublica = warnIfNoPublicBaseUrl();
if (avisoUrlPublica) logger.warn(avisoUrlPublica);

/**
 * Worker de procesamiento de audio dentro del proceso de la API.
 *
 * Es lo cómodo en desarrollo: un solo `npm run dev` y todo funciona. En
 * producción conviene apagarlo (`WORKER_IN_PROCESS=false`) y levantar
 * `npm run worker` como servicio aparte, porque ffmpeg compite por CPU y
 * memoria con las peticiones HTTP y en una instancia pequeña se lleva por
 * delante a la API entera.
 *
 * Tenerlo encendido en los dos sitios no rompe nada — la cola usa
 * `FOR UPDATE SKIP LOCKED`, así que dos workers nunca cogen el mismo
 * trabajo — pero desperdicia la separación que se buscaba.
 */
const workerInProcess = (process.env.WORKER_IN_PROCESS ?? 'true').trim().toLowerCase() !== 'false';

if (!workerInProcess) {
  logger.info('Worker en proceso desactivado (WORKER_IN_PROCESS=false): lo atiende el servicio dedicado');
} else if (isFfmpegAvailable()) {
  startWorker();
  logger.info('Worker de procesamiento de audio iniciado (dentro de la API)');
} else {
  logger.warn('ffmpeg no disponible: el worker de procesamiento de audio queda apagado');
}

/** Apagado ordenado: deja de aceptar conexiones nuevas y cierra el pool de Postgres. */
function shutdown(signal: string) {
  logger.info(`${signal} recibido, cerrando el servidor…`);
  io.close();
  stopWorker();
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  // Si algo se cuelga cerrando, no dejar el proceso zombie para siempre.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
