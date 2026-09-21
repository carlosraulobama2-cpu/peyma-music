/**
 * Peyma Music API — Moderación admin
 *
 * Aprueba/rechaza tracks ya publicados antes de que sean públicamente
 * visibles. Distinto del pipeline de `routes/uploads.ts` (esa es la revisión
 * del propio creador ANTES de publicar); esto es un segundo gate, después de
 * publicar, que sólo puede operar un usuario con `role: ADMIN`.
 */
import { Router, type Response } from 'express';
import type { AudioQuality, JobKind, ReportStatus } from '@prisma/client';
import { prisma } from '../prismaClient';
import { authMiddleware, authFromHeaderOrQuery, requireRole, type AuthRequest } from '../middleware/auth';
import {
  reviewTrackSchema,
  blockArtistSchema,
  blockPlaylistSchema,
  importUrlSchema,
  confirmImportSchema,
  bulkTrackActionSchema,
  querySchema,
  idParamSchema,
  processTrackSchema,
  jobFilterSchema,
  verifyArtistSchema,
  editorialSectionSchema,
  editorialItemsSchema,
  userRoleSchema,
  musicGenreSchema,
  updateSettingSchema,
  resolveReportSchema,
  blockTrackSchema,
  reorderPromotionsSchema,
} from '../schemas/validation';
import { NotFoundError, BadRequestError } from '../utils/errors';
import { enqueue, retryJob } from '../services/jobQueue';
import { QUALITY_PROFILES } from '../services/transcode';
import { isFfmpegAvailable } from '../services/ffmpeg';
import { pipeAudio } from './stream';
import { record } from '../services/auditLog';
import { invalidateTrackAccess, invalidateAllTrackAccess } from '../services/trackAccess';
import { notify, notifyTrackOwner } from '../services/notifications';
import { getSectionForPreview } from '../services/editorial';
import {
  getTopListeners,
  getTopArtistsByTime,
  getTrendingTracks,
  getTopSearches,
  ROLLING_WINDOW_DAYS as AUDIENCE_WINDOW_DAYS,
  getPlayCounts,
} from '../services/audienceStats';
import { getArtistStats } from '../services/artistStats';
import { inspectUrl } from '../services/trackImport';
import { listSettings, setSetting, isKnownSetting, validateSettingValue } from '../services/settings';
import { slugify } from '../utils/slug';
import {
  approvePromotion,
  reorderPromotions,
  PRICE_PER_DAY_CENTS,
} from '../services/promotions';

const router = Router();

/**
 * Escuchar una pista de la cola de revisión.
 *
 * Existe porque `/tracks/:id/stream` sólo sirve pistas APPROVED — justo lo
 * contrario de lo que necesita un moderador. Sin esta ruta, darle al play en
 * el panel daría 404 en todas las pistas pendientes, o sea en todas las que
 * importan.
 *
 * Va ANTES del `router.use(authMiddleware)` de abajo y trae su propia
 * autenticación porque acepta el token por query string además de por
 * cabecera. El motivo es concreto: un `<audio src="…">` del navegador no
 * puede mandar cabeceras. La alternativa sería bajar el archivo entero con
 * fetch() a un blob, lo que rompe el `Range` y obligaría a descargar un
 * máster de 100 MB antes de oír el primer segundo.
 *
 * El token sigue siendo el JWT normal y se exige rol ADMIN igual. Lo que
 * cambia es por dónde viaja. Queda registrado en logs de acceso, que es la
 * pega conocida de esta técnica; se acepta porque el alcance es una única
 * ruta de sólo lectura dentro del panel.
 */
router.get('/moderation/:id/preview', authFromHeaderOrQuery, requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  const { id } = idParamSchema.parse(req.params);

  const track = await prisma.track.findUnique({ where: { id }, select: { audioUrl: true } });
  if (!track) throw new NotFoundError('Pista');

  await pipeAudio(track.audioUrl, req, res);
});

router.use(authMiddleware, requireRole('ADMIN'));

const TRACK_WITH_DETAILS = {
  include: {
    artist: { select: { id: true, name: true, imageUrl: true, isVerified: true } },
    album: { select: { id: true, title: true, coverUrl: true } },
    uploadedBy: { select: { id: true, displayName: true, email: true } },
    // La onda y la sonoridad se incluyen para que el revisor vea de un
    // vistazo si la pista está vacía, recortada o con el volumen disparado,
    // antes siquiera de darle al play.
    analysis: { select: { bpm: true, waveformPeaks: true, integratedLufs: true, truePeakDb: true } },
  },
} as const;

/** Cola de moderación — lo más antiguo primero, para no dejar nada esperando indefinidamente. */
router.get('/moderation/pending', async (req: AuthRequest, res: Response) => {
  const { page, limit } = querySchema.parse(req.query);
  const skip = (page - 1) * limit;

  const [tracks, total] = await Promise.all([
    prisma.track.findMany({
      where: { status: 'PENDING_REVIEW' },
      skip,
      take: limit,
      orderBy: { createdAt: 'asc' },
      ...TRACK_WITH_DETAILS,
    }),
    prisma.track.count({ where: { status: 'PENDING_REVIEW' } }),
  ]);

  res.json({ tracks, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

router.patch('/moderation/:id/review', async (req: AuthRequest, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  const decision = reviewTrackSchema.parse(req.body);

  const track = await prisma.track.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!track) throw new NotFoundError('Pista');
  if (track.status !== 'PENDING_REVIEW') {
    throw new BadRequestError(`Esta pista ya está en estado "${track.status}", no hay nada pendiente que revisar`);
  }

  const updated = await prisma.track.update({
    where: { id },
    data: {
      status: decision.decision,
      reviewedById: req.user!.id,
      reviewedAt: new Date(),
      rejectionReason: decision.decision === 'REJECTED' ? decision.reason : null,
    },
    ...TRACK_WITH_DETAILS,
  });

  await notifyTrackOwner(
    id,
    decision.decision === 'APPROVED'
      ? {
          kind: 'TRACK_APPROVED',
          title: 'Tu canción ya está publicada',
          body: `"${updated.title}" pasó la revisión y ya se puede escuchar en Peyma Music.`,
        }
      : {
          kind: 'TRACK_REJECTED',
          title: 'Tu canción no pasó la revisión',
          body: `"${updated.title}": ${decision.reason}`,
        },
  );

  await record(req, {
    action: decision.decision === 'APPROVED' ? 'track.approve' : 'track.reject',
    targetType: 'track',
    targetId: id,
    targetLabel: updated.title,
    ...(decision.decision === 'REJECTED' && { metadata: { motivo: decision.reason } }),
  });

  invalidateTrackAccess(id);
  res.json({ track: updated });
});

// --- Gestión de artistas ---

/**
 * Ficha completa de un artista para el panel.
 *
 * Existe para que decidir sobre un artista no obligue a abrir cuatro
 * pestañas: aquí están su perfil, sus métricas reales, sus denuncias
 * abiertas y TODAS sus canciones — incluidas las pendientes y las
 * bloqueadas, que el catálogo público no devuelve y que son justo las que
 * un moderador necesita ver.
 */
router.get('/artists/:id', async (req: AuthRequest, res: Response) => {
  const { id } = idParamSchema.parse(req.params);

  const artist = await prisma.artist.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, email: true, displayName: true } },
      _count: { select: { albums: true, tracks: true, followers: true } },
    },
  });
  if (!artist) throw new NotFoundError('Artista');

  const [tracks, stats, reports] = await Promise.all([
    prisma.track.findMany({
      where: { artistId: id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        coverUrl: true,
        duration: true,
        genre: true,
        status: true,
        isBlocked: true,
        blockedReason: true,
        createdAt: true,
        album: { select: { id: true, title: true } },
      },
    }),
    getArtistStats(id),
    // "Pendiente" son las que todavía nadie cerró: recién llegadas y en
    // revisión. UPHELD y DISMISSED ya están resueltas.
    prisma.trackReport.count({ where: { track: { artistId: id }, status: { in: ['OPEN', 'REVIEWING'] } } }),
  ]);

  // Las reproducciones van en una consulta agregada aparte y no como
  // `_count` de la relación: `StreamLog` crece sin límite y contarlo por
  // fila dentro del `findMany` haría una subconsulta por pista.
  const plays = await getPlayCounts(tracks.map((t) => t.id));

  res.json({
    artist,
    stats,
    denunciasPendientes: reports,
    tracks: tracks.map((t) => ({ ...t, playCount: plays.get(t.id) ?? 0 })),
  });
});

/**
 * Bloquea o desbloquea varias canciones de golpe.
 *
 * Desde la ficha del artista se marcan las que sobran y se actúa una vez.
 * Hacerlo pista a pista con una llamada por cada una dejaría la pantalla a
 * medias si una fallara, y no habría forma de saber cuáles se aplicaron.
 */
router.post('/artists/:id/tracks/block', async (req: AuthRequest, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  const { trackIds, reason } = bulkTrackActionSchema.parse(req.body);
  const isBlocked = req.body?.isBlocked !== false;

  // Se acotan a este artista: sin esto, un id de otro artista colado en la
  // lista se aplicaría igual desde una pantalla que no es la suya.
  const result = await prisma.track.updateMany({
    where: { id: { in: trackIds }, artistId: id },
    data: {
      isBlocked,
      blockedReason: isBlocked ? (reason ?? null) : null,
      blockedAt: isBlocked ? new Date() : null,
      blockedByName: isBlocked ? (req.user?.email ?? null) : null,
    },
  });

  for (const trackId of trackIds) invalidateTrackAccess(trackId);

  await record(req, {
    action: isBlocked ? 'track.bulk_block' : 'track.bulk_unblock',
    targetType: 'artist',
    targetId: id,
    targetLabel: `${result.count} pista(s)`,
    metadata: { pistas: result.count, motivo: reason ?? null },
  });

  res.json({ updated: result.count });
});

/** Borra varias canciones de un artista. Irreversible, por eso queda en la bitácora. */
router.post('/artists/:id/tracks/delete', async (req: AuthRequest, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  const { trackIds } = bulkTrackActionSchema.parse(req.body);

  const doomed = await prisma.track.findMany({
    where: { id: { in: trackIds }, artistId: id },
    select: { id: true, title: true },
  });

  const result = await prisma.track.deleteMany({ where: { id: { in: doomed.map((t) => t.id) } } });
  for (const t of doomed) invalidateTrackAccess(t.id);

  await record(req, {
    action: 'track.bulk_delete',
    targetType: 'artist',
    targetId: id,
    targetLabel: `${result.count} pista(s)`,
    // Se guardan los títulos: el id de una pista borrada no le dice nada a
    // nadie después, y si alguien reclama hay que poder responder qué se fue.
    metadata: { titulos: doomed.map((t) => t.title) },
  });

  res.json({ deleted: result.count });
});

/** Listado para el panel: incluye los bloqueados (el catálogo público no). */
router.get('/artists', async (req: AuthRequest, res: Response) => {
  const { page, limit, search } = querySchema.parse(req.query);
  const skip = (page - 1) * limit;

  const where = search ? { name: { contains: search, mode: 'insensitive' as const } } : {};

  const [artists, total] = await Promise.all([
    prisma.artist.findMany({
      where,
      skip,
      take: limit,
      orderBy: { name: 'asc' },
      include: { _count: { select: { tracks: true, albums: true, followers: true } } },
    }),
    prisma.artist.count({ where }),
  ]);

  res.json({ artists, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

/**
 * Bloquea o desbloquea. Es reversible a propósito: esconde al artista y sus
 * pistas del catálogo sin destruir nada, que es lo que casi siempre se
 * quiere ante una denuncia todavía sin resolver.
 */
router.patch('/artists/:id/block', async (req: AuthRequest, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  const { isBlocked } = blockArtistSchema.parse(req.body);

  const artist = await prisma.artist.findUnique({ where: { id }, select: { id: true } });
  if (!artist) throw new NotFoundError('Artista');

  const updated = await prisma.artist.update({
    where: { id },
    data: { isBlocked },
    include: { _count: { select: { tracks: true, albums: true, followers: true } } },
  });

  await record(req, {
    action: isBlocked ? 'artist.block' : 'artist.unblock',
    targetType: 'artist',
    targetId: id,
    targetLabel: updated.name,
    metadata: { pistasAfectadas: updated._count.tracks },
  });

  // Afecta a todas las pistas del artista y aquí no tenemos la lista.
  invalidateAllTrackAccess();
  res.json({ artist: updated });
});

/** Borrado definitivo. Arrastra álbumes y pistas por las cascadas del esquema. */
router.delete('/artists/:id', async (req: AuthRequest, res: Response) => {
  const { id } = idParamSchema.parse(req.params);

  const artist = await prisma.artist.findUnique({
    where: { id },
    select: { id: true, name: true, _count: { select: { tracks: true } } },
  });
  if (!artist) throw new NotFoundError('Artista');

  await prisma.artist.delete({ where: { id } });
  await record(req, {
    action: 'artist.delete',
    targetType: 'artist',
    targetId: id,
    targetLabel: artist.name,
    metadata: { pistasBorradas: artist._count.tracks },
  });
  invalidateAllTrackAccess();
  res.json({ message: `Se eliminó "${artist.name}" y sus ${artist._count.tracks} pista(s)` });
});

/** Borrado de una pista suelta, sin tocar al artista. */
router.delete('/tracks/:id', async (req: AuthRequest, res: Response) => {
  const { id } = idParamSchema.parse(req.params);

  const track = await prisma.track.findUnique({ where: { id }, select: { id: true, title: true } });
  if (!track) throw new NotFoundError('Pista');

  await prisma.track.delete({ where: { id } });
  await record(req, { action: 'track.delete', targetType: 'track', targetId: id, targetLabel: track.title });
  invalidateTrackAccess(id);
  res.json({ message: `Se eliminó "${track.title}"` });
});

/* ------------------------------------------------------------------ *
 * Métricas del panel.
 * ------------------------------------------------------------------ */

/** Ventana de referencia de la industria para "oyentes mensuales". */
const ROLLING_WINDOW_DAYS = 28;
/** "Escuchando ahora": reproducciones registradas en los últimos minutos. */
const LIVE_WINDOW_MINUTES = 5;

/**
 * Métricas del tablero.
 *
 * Todo sale de `StreamLog`, la misma tabla de eventos que ya alimenta
 * trending y oyentes mensuales — no hay contadores paralelos que mantener
 * sincronizados. Las consultas van en un solo `Promise.all` porque son
 * independientes entre sí y serializarlas multiplicaría la latencia del
 * tablero por el número de tarjetas.
 */
router.get('/metrics', async (_req: AuthRequest, res: Response) => {
  const now = new Date();
  const windowStart = new Date(now.getTime() - ROLLING_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const liveStart = new Date(now.getTime() - LIVE_WINDOW_MINUTES * 60 * 1000);

  const [
    totalTracks,
    pendingReview,
    totalArtists,
    blockedArtists,
    verifiedArtists,
    totalUsers,
    streams28d,
    listeners28d,
    liveListeners,
    failedJobs,
    queuedJobs,
    dailySeries,
    topGenres,
  ] = await Promise.all([
    prisma.track.count({ where: { status: 'APPROVED' } }),
    prisma.track.count({ where: { status: 'PENDING_REVIEW' } }),
    prisma.artist.count(),
    prisma.artist.count({ where: { isBlocked: true } }),
    prisma.artist.count({ where: { isVerified: true } }),
    prisma.user.count(),
    prisma.streamLog.count({ where: { playedAt: { gte: windowStart } } }),
    // COUNT(DISTINCT userId): un oyente que puso 40 canciones cuenta una vez.
    prisma.streamLog
      .findMany({ where: { playedAt: { gte: windowStart } }, distinct: ['userId'], select: { userId: true } })
      .then((rows) => rows.length),
    prisma.streamLog
      .findMany({ where: { playedAt: { gte: liveStart } }, distinct: ['userId'], select: { userId: true } })
      .then((rows) => rows.length),
    prisma.processingJob.count({ where: { status: 'FAILED' } }),
    prisma.processingJob.count({ where: { status: { in: ['QUEUED', 'RUNNING'] } } }),
    // Serie diaria para el gráfico de 28 días. Se agrupa en SQL y no en JS:
    // traer una fila por reproducción para contarlas acá no escala.
    prisma.$queryRaw<{ day: Date; streams: bigint }[]>`
      SELECT date_trunc('day', "playedAt") AS day, COUNT(*) AS streams
        FROM "StreamLog"
       WHERE "playedAt" >= ${windowStart}
       GROUP BY 1
       ORDER BY 1
    `,
    prisma.$queryRaw<{ genre: string | null; streams: bigint }[]>`
      SELECT t."genre"::text AS genre, COUNT(*) AS streams
        FROM "StreamLog" s
        JOIN "Track" t ON t."id" = s."trackId"
       WHERE s."playedAt" >= ${windowStart}
       GROUP BY 1
       ORDER BY 2 DESC
       LIMIT 8
    `,
  ]);

  // El nº 1 actual, con su ritmo y su artista — lo que el panel destaca
  // arriba del todo. Se pide con ventana de 7 días porque "el número uno"
  // de la plataforma es algo de esta semana, no del último mes.
  const [top1] = await getTrendingTracks(1, 7);

  res.json({
    windowDays: ROLLING_WINDOW_DAYS,
    top1: top1 ?? null,
    catalog: { totalTracks, pendingReview, totalArtists, blockedArtists, totalUsers, verifiedArtists },
    audience: { streams28d, listeners28d, liveListeners },
    jobs: { failed: failedJobs, active: queuedJobs },
    // `COUNT(*)` en Postgres vuelve como BIGINT y `JSON.stringify` no sabe
    // serializar BigInt: lanza. Se convierte acá, no en el cliente.
    dailyStreams: dailySeries.map((row) => ({
      day: row.day.toISOString().slice(0, 10),
      streams: Number(row.streams),
    })),
    topGenres: topGenres.map((row) => ({ genre: row.genre ?? 'sin género', streams: Number(row.streams) })),
  });
});

/* ------------------------------------------------------------------ *
 * Procesamiento de audio: disparo de trabajos y monitor de la cola.
 * ------------------------------------------------------------------ */

/**
 * Encola el procesamiento de una pista.
 *
 * Los trabajos se encolan en el orden en que conviene que corran: primero la
 * medición (barata, y su resultado se ve enseguida en el panel) y después la
 * transcodificación (cara). La cola es FIFO, así que el orden de inserción
 * es el orden de ejecución.
 */
router.post('/tracks/:id/process', async (req: AuthRequest, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  const { jobs: requested } = processTrackSchema.parse(req.body ?? {});

  const track = await prisma.track.findUnique({ where: { id }, select: { id: true, title: true } });
  if (!track) throw new NotFoundError('Pista');

  if (!isFfmpegAvailable()) {
    throw new BadRequestError('ffmpeg no está disponible en este servidor; no se puede procesar audio');
  }

  const created: { id: string; kind: JobKind; quality?: AudioQuality }[] = [];

  if (requested.includes('WAVEFORM')) {
    created.push({ id: await enqueue('WAVEFORM', { trackId: id }), kind: 'WAVEFORM' });
  }
  if (requested.includes('LOUDNESS')) {
    created.push({ id: await enqueue('LOUDNESS', { trackId: id }), kind: 'LOUDNESS' });
  }
  if (requested.includes('COLOR')) {
    created.push({ id: await enqueue('COLOR', { trackId: id }), kind: 'COLOR' });
  }
  if (requested.includes('TRANSCODE')) {
    // Un trabajo por calidad, no uno que las haga todas: así una variante que
    // falle no tira abajo las otras tres y se puede reintentar sola.
    for (const profile of QUALITY_PROFILES) {
      created.push({
        id: await enqueue('TRANSCODE', { trackId: id, payload: { quality: profile.quality } }),
        kind: 'TRANSCODE',
        quality: profile.quality,
      });
    }
  }

  res.status(202).json({ message: `Se encolaron ${created.length} trabajo(s) para "${track.title}"`, jobs: created });
});

/** Estado de la cola — alimenta el centro de trabajos del panel. */
router.get('/jobs', async (req: AuthRequest, res: Response) => {
  const { page, limit } = querySchema.parse(req.query);
  const { status } = jobFilterSchema.parse(req.query);

  const where = status ? { status } : {};

  const [jobs, total, counts] = await Promise.all([
    prisma.processingJob.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { track: { select: { id: true, title: true, artist: { select: { name: true } } } } },
    }),
    prisma.processingJob.count({ where }),
    // Conteo por estado para las tarjetas de arriba del monitor. Un solo
    // groupBy en vez de cuatro COUNT separados.
    prisma.processingJob.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);

  res.json({
    jobs,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    summary: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
  });
});

/** Reintenta un trabajo fallido. */
router.post('/jobs/:id/retry', async (req: AuthRequest, res: Response) => {
  const { id } = idParamSchema.parse(req.params);

  const job = await prisma.processingJob.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!job) throw new NotFoundError('Trabajo');
  if (job.status === 'RUNNING') {
    throw new BadRequestError('Ese trabajo está corriendo ahora mismo; espera a que termine');
  }

  await retryJob(id);
  res.json({ message: 'Trabajo reencolado' });
});

/* ------------------------------------------------------------------ *
 * Verificación de artistas.
 * ------------------------------------------------------------------ */

/** Otorga o retira el check de verificación. */
router.patch('/artists/:id/verify', async (req: AuthRequest, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  const { isVerified } = verifyArtistSchema.parse(req.body);

  const artist = await prisma.artist.findUnique({ where: { id }, select: { id: true, name: true, isVerified: true } });
  if (!artist) throw new NotFoundError('Artista');

  const updated = await prisma.artist.update({
    where: { id },
    data: {
      isVerified,
      // Al retirarlo se limpia el rastro de quién lo dio: si no, un artista
      // sin verificar seguiría diciendo "verificado por X el día Y".
      verifiedAt: isVerified ? new Date() : null,
      verifiedById: isVerified ? req.user!.id : null,
    },
    include: { _count: { select: { tracks: true, albums: true, followers: true } } },
  });

  if (isVerified && updated.ownerId) {
    await notify({
      userId: updated.ownerId,
      kind: 'ARTIST_VERIFIED',
      title: '¡Ya estás verificado!',
      body: `El perfil de ${updated.name} tiene el check de artista verificado.`,
      targetType: 'artist',
      targetId: id,
    });
  }

  await record(req, {
    action: isVerified ? 'artist.verify' : 'artist.unverify',
    targetType: 'artist',
    targetId: id,
    targetLabel: artist.name,
    metadata: { antes: artist.isVerified, despues: isVerified },
  });

  res.json({ artist: updated });
});

/* ------------------------------------------------------------------ *
 * Secciones editoriales de la portada.
 * ------------------------------------------------------------------ */

router.get('/editorial', async (_req: AuthRequest, res: Response) => {
  const sections = await prisma.editorialSection.findMany({
    orderBy: { position: 'asc' },
    include: { _count: { select: { items: true } } },
  });
  res.json({ sections });
});

router.post('/editorial', async (req: AuthRequest, res: Response) => {
  const data = editorialSectionSchema.parse(req.body);

  const section = await prisma.editorialSection.create({
    data,
    include: { _count: { select: { items: true } } },
  });

  await record(req, {
    action: 'editorial.create',
    targetType: 'editorial',
    targetId: section.id,
    targetLabel: section.title,
  });
  res.status(201).json({ section });
});

router.patch('/editorial/:id', async (req: AuthRequest, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  const data = editorialSectionSchema.partial().parse(req.body);

  const existing = await prisma.editorialSection.findUnique({ where: { id }, select: { id: true, title: true } });
  if (!existing) throw new NotFoundError('Sección');

  const section = await prisma.editorialSection.update({
    where: { id },
    data,
    include: { _count: { select: { items: true } } },
  });

  await record(req, {
    action: 'editorial.update',
    targetType: 'editorial',
    targetId: id,
    targetLabel: section.title,
    metadata: data,
  });
  res.json({ section });
});

router.delete('/editorial/:id', async (req: AuthRequest, res: Response) => {
  const { id } = idParamSchema.parse(req.params);

  const section = await prisma.editorialSection.findUnique({ where: { id }, select: { id: true, title: true } });
  if (!section) throw new NotFoundError('Sección');

  await prisma.editorialSection.delete({ where: { id } });
  await record(req, {
    action: 'editorial.delete',
    targetType: 'editorial',
    targetId: id,
    targetLabel: section.title,
  });
  res.json({ message: `Se eliminó la sección "${section.title}"` });
});

/** Vista previa resuelta — muestra exactamente lo que verían la app y la web. */
router.get('/editorial/:id/preview', async (req: AuthRequest, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  const section = await getSectionForPreview(id);
  if (!section) throw new NotFoundError('Sección');
  res.json({ section });
});

/** Reemplaza de una vez las piezas de una sección MANUAL, en el orden recibido. */
router.put('/editorial/:id/items', async (req: AuthRequest, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  const { items } = editorialItemsSchema.parse(req.body);

  const section = await prisma.editorialSection.findUnique({ where: { id }, select: { id: true, kind: true, title: true } });
  if (!section) throw new NotFoundError('Sección');
  if (section.kind !== 'MANUAL') {
    throw new BadRequestError(`La sección "${section.title}" es automática (${section.kind}); su contenido no se elige a mano`);
  }

  // Borrar + insertar dentro de una transacción: reordenar fila por fila
  // chocaría contra el índice de posición y dejaría estados intermedios
  // visibles si otra petición leyera en medio.
  await prisma.$transaction([
    prisma.editorialItem.deleteMany({ where: { sectionId: id } }),
    prisma.editorialItem.createMany({
      data: items.map((item, index) => ({
        sectionId: id,
        position: index,
        trackId: item.trackId ?? null,
        albumId: item.albumId ?? null,
        artistId: item.artistId ?? null,
      })),
    }),
  ]);

  await record(req, {
    action: 'editorial.items',
    targetType: 'editorial',
    targetId: id,
    targetLabel: section.title,
    metadata: { cantidad: items.length },
  });

  const resolved = await getSectionForPreview(id);
  res.json({ section: resolved });
});

/* ------------------------------------------------------------------ *
 * Usuarios y auditoría.
 * ------------------------------------------------------------------ */

router.get('/users', async (req: AuthRequest, res: Response) => {
  const { page, limit, search } = querySchema.parse(req.query);
  const skip = (page - 1) * limit;

  const where = search
    ? {
        OR: [
          { email: { contains: search, mode: 'insensitive' as const } },
          { displayName: { contains: search, mode: 'insensitive' as const } },
        ],
      }
    : {};

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      // `select` explícito y no `include`: así el hash de contraseña no
      // puede acabar en la respuesta por descuido al añadir un campo.
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        avatarUrl: true,
        createdAt: true,
        googleId: true,
        _count: { select: { playlists: true, favorites: true, streamLogs: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  res.json({
    // `googleId` se reduce a un booleano: al panel le basta saber si la
    // cuenta usa Google, no necesita el identificador en sí.
    users: users.map(({ googleId, ...user }) => ({ ...user, usesGoogle: googleId !== null })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

/** Cambia el rol de un usuario (por ejemplo, ascender a ADMIN). */
router.patch('/users/:id/role', async (req: AuthRequest, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  const { role } = userRoleSchema.parse(req.body);

  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true, role: true } });
  if (!target) throw new NotFoundError('Usuario');

  // Un admin no puede quitarse a sí mismo el rol: es la forma más fácil de
  // quedarse sin ningún administrador y sin manera de volver a entrar.
  if (target.id === req.user!.id && role !== 'ADMIN') {
    throw new BadRequestError('No puedes quitarte a ti mismo el rol de administrador');
  }

  const updated = await prisma.user.update({
    where: { id },
    data: { role },
    select: { id: true, email: true, displayName: true, role: true },
  });

  await record(req, {
    action: 'user.role',
    targetType: 'user',
    targetId: id,
    targetLabel: target.email,
    metadata: { antes: target.role, despues: role },
  });

  res.json({ user: updated });
});

/* ------------------------------------------------------------------ *
 * Promociones de primera fila.
 * ------------------------------------------------------------------ */

router.get('/promotions', async (_req: AuthRequest, res: Response) => {
  const now = new Date();

  const [promotions, counts] = await Promise.all([
    prisma.promotion.findMany({
      orderBy: [{ status: 'asc' }, { position: 'asc' }, { createdAt: 'desc' }],
      take: 100,
      include: {
        requestedBy: { select: { id: true, displayName: true, email: true } },
        track: {
          select: {
            id: true,
            title: true,
            coverUrl: true,
            duration: true,
            genre: true,
            artist: { select: { id: true, name: true, isVerified: true } },
          },
        },
      },
    }),
    prisma.promotion.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);

  res.json({
    // `msRemaining` se calcula en el servidor: el reloj del navegador del
    // admin puede estar desviado, y el temporizador de una campaña pagada
    // no debería depender de eso.
    promotions: promotions.map((promotion) => ({
      ...promotion,
      msRemaining: promotion.endsAt ? Math.max(0, promotion.endsAt.getTime() - now.getTime()) : null,
    })),
    summary: Object.fromEntries(counts.map((row) => [row.status, row._count._all])),
    pricePerDayCents: PRICE_PER_DAY_CENTS,
  });
});

router.post('/promotions/:id/approve', async (req: AuthRequest, res: Response) => {
  const { id } = idParamSchema.parse(req.params);

  const promotion = await prisma.promotion.findUnique({
    where: { id },
    select: { id: true, status: true, days: true, track: { select: { title: true } } },
  });
  if (!promotion) throw new NotFoundError('Promoción');
  if (promotion.status !== 'PENDING_APPROVAL') {
    throw new BadRequestError(`Esta solicitud ya está en estado "${promotion.status}"`);
  }

  await approvePromotion(id, req.user!.id);
  await record(req, {
    action: 'promotion.approve',
    targetType: 'promotion',
    targetId: id,
    targetLabel: promotion.track.title,
    metadata: { dias: promotion.days },
  });

  res.json({ message: `"${promotion.track.title}" ya está en la primera fila durante ${promotion.days} día(s)` });
});

router.post('/promotions/:id/reject', async (req: AuthRequest, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.slice(0, 300) : null;

  const promotion = await prisma.promotion.findUnique({
    where: { id },
    select: { id: true, status: true, priceCents: true, paidAt: true, track: { select: { title: true } } },
  });
  if (!promotion) throw new NotFoundError('Promoción');

  await prisma.promotion.update({
    where: { id },
    data: { status: 'REJECTED', rejectionReason: reason, reviewedById: req.user!.id, reviewedAt: new Date() },
  });

  await record(req, {
    action: 'promotion.reject',
    targetType: 'promotion',
    targetId: id,
    targetLabel: promotion.track.title,
    metadata: { motivo: reason },
  });

  res.json({
    message: `Se rechazó la promoción de "${promotion.track.title}"`,
    // No se dice "reembolsado" porque no se cobró nada: no hay pasarela
    // conectada. Afirmar un reembolso que no existe es peor que no decirlo.
    refund: promotion.paidAt ? 'pendiente' : 'no procede (no se llegó a cobrar)',
  });
});

/** Cancela una campaña activa antes de tiempo. */
router.post('/promotions/:id/cancel', async (req: AuthRequest, res: Response) => {
  const { id } = idParamSchema.parse(req.params);

  const promotion = await prisma.promotion.findUnique({
    where: { id },
    select: { id: true, track: { select: { title: true } } },
  });
  if (!promotion) throw new NotFoundError('Promoción');

  await prisma.promotion.update({ where: { id }, data: { status: 'CANCELLED', endsAt: new Date() } });
  await record(req, {
    action: 'promotion.cancel',
    targetType: 'promotion',
    targetId: id,
    targetLabel: promotion.track.title,
  });

  res.json({ message: `Se retiró "${promotion.track.title}" de la primera fila` });
});

/** Reordena la primera fila. Recibe los ids en el orden deseado. */
router.put('/promotions/order', async (req: AuthRequest, res: Response) => {
  const { orderedIds } = reorderPromotionsSchema.parse(req.body);

  await reorderPromotions(orderedIds);
  await record(req, {
    action: 'promotion.reorder',
    targetType: 'promotion',
    targetId: null,
    targetLabel: `${orderedIds.length} campañas`,
  });

  res.json({ message: 'Orden actualizado' });
});

/* ------------------------------------------------------------------ *
 * Denuncias de canciones.
 * ------------------------------------------------------------------ */

router.get('/reports', async (req: AuthRequest, res: Response) => {
  const { page, limit } = querySchema.parse(req.query);
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;

  const where = status && status !== 'ALL' ? { status: status as ReportStatus } : {};

  const [reports, total, byStatus] = await Promise.all([
    prisma.trackReport.findMany({
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
      include: {
        reporter: { select: { id: true, displayName: true, email: true } },
        resolvedBy: { select: { displayName: true } },
        track: {
          select: {
            id: true,
            title: true,
            coverUrl: true,
            duration: true,
            genre: true,
            isBlocked: true,
            status: true,
            artist: { select: { id: true, name: true, isVerified: true } },
          },
        },
      },
    }),
    prisma.trackReport.count({ where }),
    prisma.trackReport.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);

  // Cuántas denuncias acumula cada pista de esta página: veinte personas
  // denunciando lo mismo es una señal muy distinta de una sola.
  const trackIds = [...new Set(reports.map((report) => report.trackId))];
  const counts = trackIds.length
    ? await prisma.trackReport.groupBy({
        by: ['trackId'],
        where: { trackId: { in: trackIds } },
        _count: { _all: true },
      })
    : [];
  const reportsPerTrack = new Map(counts.map((row) => [row.trackId, row._count._all]));

  res.json({
    reports: reports.map((report) => ({ ...report, totalReportsForTrack: reportsPerTrack.get(report.trackId) ?? 1 })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    summary: Object.fromEntries(byStatus.map((row) => [row.status, row._count._all])),
  });
});

/**
 * Resuelve una denuncia y, si procede, actúa sobre la pista.
 *
 * Las dos cosas van juntas en una transacción: cerrar la denuncia como
 * "procede" sin bloquear la canción dejaría el caso marcado como resuelto
 * con el contenido denunciado todavía sonando.
 */
router.patch('/reports/:id', async (req: AuthRequest, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  const { status, note, action } = resolveReportSchema.parse(req.body);

  const report = await prisma.trackReport.findUnique({
    where: { id },
    select: {
      id: true,
      trackId: true,
      reason: true,
      track: { select: { title: true } },
      // El nombre del denunciante va al bloqueo: el artista infractor tiene
      // derecho a saber quién reclamó, y esa es la exigencia del mensaje que
      // se le muestra en lugar del reproductor.
      reporter: { select: { displayName: true } },
    },
  });
  if (!report) throw new NotFoundError('Denuncia');

  if (action !== 'NONE' && status !== 'UPHELD') {
    throw new BadRequestError('Sólo se actúa sobre la pista cuando se le da la razón al denunciante');
  }

  if (action === 'DELETE') {
    // Borrar la pista arrastra la denuncia por cascada, así que no tiene
    // sentido actualizarla antes: se registra y se borra.
    await prisma.track.delete({ where: { id: report.trackId } });
    await record(req, {
      action: 'report.upheld.delete',
      targetType: 'track',
      targetId: report.trackId,
      targetLabel: report.track.title,
      metadata: { motivo: report.reason, nota: note ?? null },
    });
    res.json({ message: `Se eliminó "${report.track.title}" tras la denuncia`, deleted: true });
    return;
  }

  await prisma.$transaction(async (tx) => {
    if (action === 'BLOCK') {
      await tx.track.update({
        where: { id: report.trackId },
        data: {
          isBlocked: true,
          blockedReason: note?.slice(0, 300) ?? `Denuncia: ${report.reason}`,
          blockedAt: new Date(),
          blockedByName: report.reporter?.displayName ?? 'un tercero',
        },
      });
    }

    await tx.trackReport.update({
      where: { id },
      data: {
        status,
        resolutionNote: note ?? null,
        // REVIEWING no es un cierre: no se marca resuelta todavía.
        resolvedById: status === 'REVIEWING' ? null : req.user!.id,
        resolvedAt: status === 'REVIEWING' ? null : new Date(),
      },
    });
  });

  if (action === 'BLOCK') {
    await notifyTrackOwner(report.trackId, {
      kind: 'TRACK_TAKEDOWN',
      title: 'Se retiró una de tus canciones',
      body: `"${report.track.title}" se retiró tras una reclamación de derechos de autor.`,
    });
  }

  await record(req, {
    action: `report.${status.toLowerCase()}`,
    targetType: 'track',
    targetId: report.trackId,
    targetLabel: report.track.title,
    metadata: { motivo: report.reason, accion: action, nota: note ?? null },
  });

  res.json({ message: 'Denuncia actualizada' });
});

/**
 * Bloquea o desbloquea UNA pista.
 *
 * Distinto de bloquear al artista: sólo desaparece esta canción, el resto
 * de su catálogo sigue disponible. Y distinto de borrarla: es reversible.
 */
router.patch('/tracks/:id/block', async (req: AuthRequest, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  const { isBlocked, reason } = blockTrackSchema.parse(req.body);

  const track = await prisma.track.findUnique({ where: { id }, select: { id: true, title: true } });
  if (!track) throw new NotFoundError('Pista');

  const updated = await prisma.track.update({
    where: { id },
    data: {
      isBlocked,
      blockedReason: isBlocked ? (reason?.slice(0, 300) ?? null) : null,
      blockedAt: isBlocked ? new Date() : null,
      // Al desbloquear se limpia también el reclamante: si no, una pista
      // restaurada seguiría diciendo que la reclamó alguien.
      blockedByName: isBlocked ? (req.user!.displayName ?? null) : null,
    },
    select: { id: true, title: true, isBlocked: true, blockedReason: true },
  });

  await record(req, {
    action: isBlocked ? 'track.block' : 'track.unblock',
    targetType: 'track',
    targetId: id,
    targetLabel: track.title,
    ...(reason ? { metadata: { motivo: reason } } : {}),
  });

  // Después de escribir, nunca antes: entre vaciar la caché y actualizar
  // la fila, otra petición de reproducción podría recachear el valor viejo.
  invalidateTrackAccess(id);
  res.json({ track: updated });
});

/* ------------------------------------------------------------------ *
 * Audiencia: quién escucha, cuánto y a quién.
 * ------------------------------------------------------------------ */

/**
 * Tendencias, incluido el número 1 actual.
 *
 * `top1` es simplemente el primer elemento; se devuelve aparte para que el
 * tablero pueda destacarlo sin repetir la consulta.
 */
router.get('/trending', async (req: AuthRequest, res: Response) => {
  const days = Number(req.query.days) > 0 ? Math.min(Number(req.query.days), 90) : 7;
  const tracks = await getTrendingTracks(30, days);
  res.json({ windowDays: days, top1: tracks[0] ?? null, tracks });
});

/** Ranking de oyentes: quién pasa más horas y quién menos. */
router.get('/audience/listeners', async (req: AuthRequest, res: Response) => {
  const order = req.query.order === 'asc' ? 'asc' : 'desc';
  const listeners = await getTopListeners(25, order);
  res.json({ windowDays: AUDIENCE_WINDOW_DAYS, order, listeners });
});

/** Artistas por tiempo total escuchado (no por número de reproducciones). */
router.get('/audience/artists', async (_req: AuthRequest, res: Response) => {
  const artists = await getTopArtistsByTime(15);
  res.json({ windowDays: AUDIENCE_WINDOW_DAYS, artists });
});

/**
 * Mapa de oyentes: dónde se está escuchando ahora mismo.
 *
 * Sólo aparecen usuarios que dieron consentimiento explícito, y las
 * coordenadas ya vienen redondeadas a ~11 km desde que se guardaron. Se
 * agrupan por punto y se devuelve un CONTEO, nunca quién: el mapa muestra
 * densidad, no personas identificables.
 */
router.get('/audience/live-map', async (req: AuthRequest, res: Response) => {
  const minutes = Number(req.query.minutes) > 0 ? Math.min(Number(req.query.minutes), 1440) : 60;
  const since = new Date(Date.now() - minutes * 60 * 1000);

  const points = await prisma.streamLog.groupBy({
    by: ['latitude', 'longitude'],
    where: { playedAt: { gte: since }, latitude: { not: null } },
    _count: { _all: true },
  });

  const [withConsent, total] = await Promise.all([
    prisma.user.count({ where: { locationConsent: 'GRANTED' } }),
    prisma.user.count(),
  ]);

  res.json({
    windowMinutes: minutes,
    points: points.map((point) => ({
      lat: point.latitude,
      lon: point.longitude,
      listeners: point._count._all,
    })),
    // El panel muestra esta cobertura junto al mapa: sin ella, un mapa con
    // tres puntos parecería que la plataforma tiene tres oyentes, cuando lo
    // que pasa es que sólo tres dieron permiso.
    consent: { granted: withConsent, totalUsers: total },
  });
});

/** Qué busca la gente, y qué busca sin encontrar nada. */
router.get('/audience/searches', async (_req: AuthRequest, res: Response) => {
  const searches = await getTopSearches(30);
  res.json({
    windowDays: AUDIENCE_WINDOW_DAYS,
    searches,
    // Demanda insatisfecha: términos buscados que no devuelven nada. Es la
    // lista de catálogo que falta, y por eso se separa en vez de dejarla
    // mezclada con el resto del ranking.
    withoutResults: searches.filter((entry) => entry.avgResults === 0),
  });
});

/** Altas que no llegaron a crear cuenta, agrupadas por dónde fallaron. */
router.get('/audience/signup-failures', async (req: AuthRequest, res: Response) => {
  const { page, limit } = querySchema.parse(req.query);

  const [byStage, recent, total] = await Promise.all([
    prisma.signupAttempt.groupBy({ by: ['stage'], _count: { _all: true } }),
    prisma.signupAttempt.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.signupAttempt.count(),
  ]);

  res.json({
    byStage: Object.fromEntries(byStage.map((row) => [row.stage, row._count._all])),
    attempts: recent,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

/* ------------------------------------------------------------------ *
 * Playlists de los usuarios.
 * ------------------------------------------------------------------ */

router.get('/playlists', async (req: AuthRequest, res: Response) => {
  const { page, limit, search } = querySchema.parse(req.query);

  const where = search ? { title: { contains: search, mode: 'insensitive' as const } } : {};

  const [playlists, total, stats] = await Promise.all([
    prisma.playlist.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { updatedAt: 'desc' },
      include: {
        owner: { select: { id: true, displayName: true, email: true } },
        _count: { select: { tracks: true } },
      },
    }),
    prisma.playlist.count({ where }),
    /**
     * Totales de TODO el catálogo, no de la página ni de la búsqueda.
     *
     * Es a propósito: son la foto general de la plataforma, y si cambiaran
     * al teclear en el buscador dejarían de servir para lo que están — saber
     * cuántas playlists hay y cuántas son públicas.
     *
     * Un `groupBy` en vez de tres `count`: un único viaje a Neon en lugar
     * de tres, que a ~100 ms cada uno se nota al abrir la pestaña.
     */
    prisma.playlist.groupBy({
      by: ['isPublic', 'isBlocked', 'isAutoGenerated'],
      _count: { _all: true },
    }),
  ]);

  const summary = { total: 0, publicas: 0, privadas: 0, bloqueadas: 0, automaticas: 0 };
  for (const row of stats) {
    const n = row._count._all;
    summary.total += n;
    if (row.isBlocked) summary.bloqueadas += n;
    if (row.isAutoGenerated) summary.automaticas += n;
    if (row.isPublic) summary.publicas += n;
    else summary.privadas += n;
  }

  res.json({
    playlists,
    summary,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

/**
 * Bloquea o desbloquea una playlist.
 *
 * Alternativa reversible a borrarla: la playlist desaparece de lo público
 * pero su dueño no pierde el trabajo de haberla armado. Si la reclamación
 * resulta infundada, se restaura con otra llamada.
 */
/**
 * Detalle de una playlist: sus canciones y cuánto se escucha cada una.
 *
 * El total de la playlist es la SUMA de las reproducciones de sus
 * canciones, y conviene tener claro qué significa: cuenta todas las escuchas
 * de cada pista en la plataforma, no sólo las que llegaron por esta lista.
 * `StreamLog` registra qué pista sonó y quién la puso, no desde qué pantalla
 * se lanzó. Medir "reproducciones originadas en esta playlist" exigiría
 * guardar la procedencia en cada escucha, que hoy no se hace.
 *
 * Aun así el número sirve para lo que se mira aquí: el peso del repertorio
 * que alguien reunió. Una lista con canciones muy escuchadas es distinta de
 * una con seis pistas que no oye nadie.
 */
router.get('/playlists/:id', async (req: AuthRequest, res: Response) => {
  const { id } = idParamSchema.parse(req.params);

  const playlist = await prisma.playlist.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, displayName: true, email: true } },
      tracks: {
        orderBy: { position: 'asc' },
        select: {
          position: true,
          addedAt: true,
          track: {
            select: {
              id: true,
              title: true,
              coverUrl: true,
              duration: true,
              genre: true,
              status: true,
              isBlocked: true,
              artist: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  });
  if (!playlist) throw new NotFoundError('Playlist');

  const plays = await getPlayCounts(playlist.tracks.map((row) => row.track.id));

  const tracks = playlist.tracks.map((row) => ({
    position: row.position,
    addedAt: row.addedAt,
    ...row.track,
    playCount: plays.get(row.track.id) ?? 0,
  }));

  res.json({
    playlist: {
      id: playlist.id,
      title: playlist.title,
      description: playlist.description,
      coverUrl: playlist.coverUrl,
      isPublic: playlist.isPublic,
      isBlocked: playlist.isBlocked,
      blockedReason: playlist.blockedReason,
      isAutoGenerated: playlist.isAutoGenerated,
      createdAt: playlist.createdAt,
      updatedAt: playlist.updatedAt,
      owner: playlist.owner,
    },
    totalTracks: tracks.length,
    totalPlays: tracks.reduce((sum, t) => sum + t.playCount, 0),
    /** Duración sumada, para saber si es una lista de 10 minutos o de 4 horas. */
    totalSeconds: tracks.reduce((sum, t) => sum + t.duration, 0),
    tracks,
  });
});

router.patch('/playlists/:id/block', async (req: AuthRequest, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  const { isBlocked, reason } = blockPlaylistSchema.parse(req.body);

  const playlist = await prisma.playlist.findUnique({
    where: { id },
    select: { id: true, title: true, owner: { select: { email: true } } },
  });
  if (!playlist) throw new NotFoundError('Playlist');

  const updated = await prisma.playlist.update({
    where: { id },
    data: {
      isBlocked,
      blockedReason: isBlocked ? (reason ?? null) : null,
      blockedAt: isBlocked ? new Date() : null,
    },
    select: { id: true, title: true, isBlocked: true, blockedReason: true, blockedAt: true },
  });

  await record(req, {
    action: isBlocked ? 'playlist.block' : 'playlist.unblock',
    targetType: 'playlist',
    targetId: id,
    targetLabel: playlist.title,
    metadata: { duenio: playlist.owner.email, motivo: reason ?? null },
  });

  res.json({ playlist: updated });
});

/**
 * Elimina la playlist de un usuario.
 *
 * Es destructivo y sobre contenido ajeno, así que queda en la bitácora con
 * el nombre y el dueño: si alguien reclama, tiene que poder verse quién la
 * borró y cuándo.
 */
router.delete('/playlists/:id', async (req: AuthRequest, res: Response) => {
  const { id } = idParamSchema.parse(req.params);

  const playlist = await prisma.playlist.findUnique({
    where: { id },
    select: { id: true, title: true, owner: { select: { email: true } } },
  });
  if (!playlist) throw new NotFoundError('Playlist');

  await prisma.playlist.delete({ where: { id } });
  await record(req, {
    action: 'playlist.delete',
    targetType: 'playlist',
    targetId: id,
    targetLabel: playlist.title,
    metadata: { duenio: playlist.owner.email },
  });

  res.json({ message: `Se eliminó la playlist "${playlist.title}"` });
});

/* ------------------------------------------------------------------ *
 * Ritmos musicales.
 * ------------------------------------------------------------------ */

router.get('/genres', async (_req: AuthRequest, res: Response) => {
  const genres = await prisma.musicGenre.findMany({ orderBy: [{ position: 'asc' }, { name: 'asc' }] });

  // Cuántos artistas usan cada ritmo — así se ve de un vistazo cuáles están
  // vivos y cuáles se crearon y nadie usó.
  const artists = await prisma.artist.findMany({ select: { genres: true } });
  const usage = new Map<string, number>();
  for (const artist of artists) {
    for (const genre of artist.genres) usage.set(genre, (usage.get(genre) ?? 0) + 1);
  }

  res.json({ genres: genres.map((genre) => ({ ...genre, artistCount: usage.get(genre.name) ?? 0 })) });
});

/**
 * Paso 1 de la importación: extraer y previsualizar.
 *
 * Descarga el audio, lee sus metadatos, normaliza el volumen y lo sube al
 * bucket — pero NO crea la pista. Devuelve el borrador para que el
 * administrador lo revise y lo corrija.
 *
 * Es deliberadamente un paso aparte: las etiquetas incrustadas en un archivo
 * suelen venir mal (el artista dentro del título, el álbum vacío, acentos
 * rotos), y publicar a ciegas llenaría el catálogo de entradas que luego hay
 * que arreglar a mano.
 */
router.post('/import/inspect', async (req: AuthRequest, res: Response) => {
  const { url } = importUrlSchema.parse(req.body);

  const extracted = await inspectUrl(url);

  await record(req, {
    action: 'import.inspect',
    targetType: 'track',
    targetId: extracted.importId,
    targetLabel: extracted.title,
    metadata: { origen: extracted.sourceUrl, metadatos: extracted.metadataSource },
  });

  res.json({ extracted });
});

/**
 * Paso 2: confirmar y publicar.
 *
 * Los archivos ya están en el bucket desde la inspección; aquí sólo nace la
 * fila de `Track` con los datos que el administrador dejó corregidos.
 *
 * Se exige `rightsConfirmed` y queda en la bitácora junto al enlace de
 * origen y a quién lo publicó. Sin ese rastro, una reclamación posterior no
 * tendría contra qué contrastarse — y este panel ya tiene un sistema de
 * retiradas por plagio que sería incoherente sin él.
 */
router.post('/import/confirm', async (req: AuthRequest, res: Response) => {
  const data = confirmImportSchema.parse(req.body);

  const artist = await prisma.artist.findUnique({ where: { id: data.artistId }, select: { id: true, name: true } });
  if (!artist) throw new NotFoundError('Artista');

  if (data.albumId) {
    const album = await prisma.album.findUnique({ where: { id: data.albumId }, select: { artistId: true } });
    if (!album || album.artistId !== data.artistId) {
      throw new BadRequestError('El álbum no existe o no pertenece a ese artista');
    }
  }

  /**
   * `Track` exige álbum. Si no se eligió ninguno se crea un álbum-sencillo
   * con esta pista dentro, igual que hace el publicado normal en
   * `routes/uploads.ts`: así una importación y una subida producen la misma
   * forma de datos, y el catálogo no acaba con dos clases de pista.
   */
  let albumId = data.albumId;
  if (!albumId) {
    const single = await prisma.album.create({
      data: {
        title: data.title,
        artistId: data.artistId,
        coverUrl: data.coverUrl ?? '',
        releaseYear: new Date().getFullYear(),
      },
    });
    albumId = single.id;
  }

  const track = await prisma.track.create({
    data: {
      title: data.title,
      artistId: data.artistId,
      albumId,
      duration: data.durationSeconds,
      audioUrl: data.audioUrl,
      coverUrl: data.coverUrl ?? '',
      // Nace aprobada: la revisó un administrador en la propia pantalla de
      // importación, que es exactamente lo que hace la cola de moderación.
      status: 'APPROVED',
      reviewedById: req.user!.id,
      reviewedAt: new Date(),
      uploadedById: req.user!.id,
      ...(data.genre ? { primaryGenre: data.genre } : {}),
    },
    include: { artist: { select: { id: true, name: true } } },
  });

  await record(req, {
    action: 'import.publish',
    targetType: 'track',
    targetId: track.id,
    targetLabel: track.title,
    metadata: {
      origen: data.sourceUrl,
      importId: data.importId,
      artista: artist.name,
      derechosDeclaradosPor: req.user!.email,
    },
  });

  // Onda y sonoridad, para que la pista importada tenga la misma ficha
  // técnica que una subida por un artista.
  await enqueue('WAVEFORM', { trackId: track.id }).catch(() => {});
  await enqueue('LOUDNESS', { trackId: track.id }).catch(() => {});

  res.status(201).json({ track });
});

router.post('/genres', async (req: AuthRequest, res: Response) => {
  const data = musicGenreSchema.parse(req.body);
  const slug = slugify(data.name);

  const genre = await prisma.musicGenre.create({ data: { ...data, slug } });
  await record(req, { action: 'genre.create', targetType: 'genre', targetId: genre.id, targetLabel: genre.name });
  res.status(201).json({ genre });
});

router.patch('/genres/:id', async (req: AuthRequest, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  const data = musicGenreSchema.partial().parse(req.body);

  const existing = await prisma.musicGenre.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new NotFoundError('Ritmo');

  const genre = await prisma.musicGenre.update({
    where: { id },
    data: { ...data, ...(data.name ? { slug: slugify(data.name) } : {}) },
  });
  await record(req, { action: 'genre.update', targetType: 'genre', targetId: id, targetLabel: genre.name, metadata: data });
  res.json({ genre });
});

router.delete('/genres/:id', async (req: AuthRequest, res: Response) => {
  const { id } = idParamSchema.parse(req.params);

  const genre = await prisma.musicGenre.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!genre) throw new NotFoundError('Ritmo');

  // Se comprueba el uso antes de borrar: si hay artistas etiquetados, borrar
  // el ritmo dejaría en sus perfiles un texto que ya no existe en el
  // vocabulario y que nadie podría volver a seleccionar.
  const inUse = await prisma.artist.count({ where: { genres: { has: genre.name } } });
  if (inUse > 0) {
    throw new BadRequestError(
      `"${genre.name}" lo usan ${inUse} artista(s). Desactivalo en vez de borrarlo: deja de ofrecerse pero no rompe sus perfiles.`,
    );
  }

  await prisma.musicGenre.delete({ where: { id } });
  await record(req, { action: 'genre.delete', targetType: 'genre', targetId: id, targetLabel: genre.name });
  res.json({ message: `Se eliminó el ritmo "${genre.name}"` });
});

/* ------------------------------------------------------------------ *
 * Ajustes.
 * ------------------------------------------------------------------ */

router.get('/settings', async (_req: AuthRequest, res: Response) => {
  res.json({ settings: await listSettings() });
});

router.patch('/settings', async (req: AuthRequest, res: Response) => {
  const { key, value } = updateSettingSchema.parse(req.body);

  if (!isKnownSetting(key)) {
    throw new BadRequestError(`Ajuste desconocido: ${key}. Un ajuste que ningún código lee no haría nada.`);
  }
  const invalid = validateSettingValue(key, value);
  if (invalid) throw new BadRequestError(`${key}: ${invalid}`);

  await setSetting(key, value, req.user!.id);
  await record(req, { action: 'setting.update', targetType: 'setting', targetId: key, targetLabel: key, metadata: { value } });

  res.json({ settings: await listSettings() });
});

/** Bitácora de auditoría — sólo lectura, no hay ruta que escriba ni borre. */
router.get('/audit', async (req: AuthRequest, res: Response) => {
  const { page, limit } = querySchema.parse(req.query);
  const skip = (page - 1) * limit;

  const [entries, total] = await Promise.all([
    prisma.auditLog.findMany({ skip, take: limit, orderBy: { createdAt: 'desc' } }),
    prisma.auditLog.count(),
  ]);

  res.json({ entries, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

export default router;
