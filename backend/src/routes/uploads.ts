/**
 * Peyma Music API — Pipeline de subida de canciones
 *
 * Estado de un `TrackUpload`, de punta a punta:
 *
 *   DRAFT ──(POST /:id/audio)──▶ DRAFT (con audioUrl)
 *         ──(POST /:id/analyze)──▶ ANALYZING ──▶ PENDING_REVIEW
 *         ──(PATCH /:id)*──▶ PENDING_REVIEW (el creador corrige metadatos)
 *         ──(POST /:id/publish)──▶ PUBLISHED  (nace el Track real)
 *
 * *El PATCH de metadatos se puede llamar las veces que haga falta mientras
 * no esté publicado. Nada de esto toca el catálogo público (`Track`) hasta
 * el `publish` — así el creador siempre revisa antes de que algo quede
 * visible para el resto de usuarios.
 */
import { Router, type Response } from 'express';
import multer from 'multer';
import { Prisma } from '@prisma/client';
import { prisma } from '../prismaClient';
import { authMiddleware, type AuthRequest } from '../middleware/auth';
import {
  createUploadSchema,
  updateUploadMetadataSchema,
  publishUploadSchema,
  querySchema,
  idParamSchema,
  presignUploadSchema,
} from '../schemas/validation';
import { AppError, BadRequestError, ForbiddenError, NotFoundError } from '../utils/errors';
import { storageService } from '../services/storage';
import {
  isObjectStorageEnabled,
  createPresignedUpload,
  headObject,
  publicUrlFor,
  MASTER_CONTENT_TYPES,
  ARTWORK_CONTENT_TYPES,
} from '../services/objectStorage';
import { audioAnalyzer, type AudioAnalysisResult } from '../services/audioAnalysis';
import { enqueue } from '../services/jobQueue';
import { isFfmpegAvailable } from '../services/ffmpeg';
import { z } from 'zod';

const router = Router();

const AUDIO_MIME_TYPES = new Set(['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/ogg', 'audio/flac']);
const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_AUDIO_BYTES = 40 * 1024 * 1024; // 40MB — de sobra para un track comprimido
const MAX_COVER_BYTES = 8 * 1024 * 1024;

const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AUDIO_BYTES },
  fileFilter: (_req, file, cb) => {
    cb(null, AUDIO_MIME_TYPES.has(file.mimetype));
  },
});

const coverUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_COVER_BYTES },
  fileFilter: (_req, file, cb) => {
    cb(null, IMAGE_MIME_TYPES.has(file.mimetype));
  },
});

const UPLOAD_WITH_DETAILS = {
  include: {
    artist: { select: { id: true, name: true, imageUrl: true, isVerified: true } },
    album: { select: { id: true, title: true, coverUrl: true } },
  },
} as const;

/** Sólo el dueño del draft puede verlo/tocarlo — y sólo mientras no esté ya publicado. */
async function requireEditableUpload(uploadId: string, userId: string) {
  const upload = await prisma.trackUpload.findUnique({ where: { id: uploadId } });
  if (!upload) throw new NotFoundError('Borrador de subida');
  if (upload.uploadedById !== userId) throw new ForbiddenError('No puedes modificar esta subida');
  if (upload.status === 'PUBLISHED' || upload.status === 'CANCELLED') {
    throw new AppError(`Esta subida ya está en estado "${upload.status}" y no se puede editar`, 409, 'upload_locked');
  }
  return upload;
}

router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { page, limit } = querySchema.parse(req.query);
  const skip = (page - 1) * limit;

  const [uploads, total] = await Promise.all([
    prisma.trackUpload.findMany({
      where: { uploadedById: req.user!.id },
      skip,
      take: limit,
      orderBy: { updatedAt: 'desc' },
      ...UPLOAD_WITH_DETAILS,
    }),
    prisma.trackUpload.count({ where: { uploadedById: req.user!.id } }),
  ]);

  res.json({ uploads, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  const upload = await prisma.trackUpload.findUnique({ where: { id }, ...UPLOAD_WITH_DETAILS });
  if (!upload) throw new NotFoundError('Borrador de subida');
  if (upload.uploadedById !== req.user!.id) throw new ForbiddenError('No puedes ver esta subida');
  res.json({ upload });
});

/** Paso 1 del pipeline: crear el borrador. "Reclama" el artista si todavía no tiene dueño. */
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  const data = createUploadSchema.parse(req.body);

  const artist = await prisma.artist.findUnique({ where: { id: data.artistId } });
  if (!artist) throw new NotFoundError('Artista');

  // Un ADMIN sube en nombre de cualquier artista desde el panel de control, y
  // sin apropiárselo: si reclamara la titularidad, el artista real perdería el
  // acceso a su propio perfil. Para todos los demás vale la regla de siempre.
  const isAdmin = req.user!.role === 'ADMIN';
  if (!isAdmin) {
    if (artist.ownerId && artist.ownerId !== req.user!.id) {
      throw new ForbiddenError('Este perfil de artista pertenece a otro usuario');
    }
    if (!artist.ownerId) {
      // Primera subida a un artista de catálogo/sin dueño: lo reclama quien sube.
      await prisma.artist.update({ where: { id: artist.id }, data: { ownerId: req.user!.id } });
    }
  }

  if (data.albumId) {
    const album = await prisma.album.findUnique({ where: { id: data.albumId } });
    if (!album || album.artistId !== data.artistId) {
      throw new BadRequestError('El álbum no existe o no pertenece a este artista');
    }
  }

  const upload = await prisma.trackUpload.create({
    data: {
      uploadedById: req.user!.id,
      artistId: data.artistId,
      albumId: data.albumId,
      title: data.title,
      status: 'DRAFT',
    },
    ...UPLOAD_WITH_DETAILS,
  });

  res.status(201).json({ upload });
});

/**
 * Paso 2 alternativo: URL firmada para subir el máster DIRECTO al bucket.
 *
 * Es la vía para archivos grandes (.wav/.flac de un máster real). El
 * `POST /:id/audio` de abajo sigue existiendo para archivos chicos y para
 * desarrollo sin bucket configurado: manda el archivo por la API y lo guarda
 * en disco. Los dos caminos terminan dejando una URL en el draft, así que el
 * resto del pipeline no distingue de dónde vino.
 */
router.post('/:id/presign', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  const { kind, contentType } = presignUploadSchema.parse(req.body);
  await requireEditableUpload(id, req.user!.id);

  if (!isObjectStorageEnabled()) {
    throw new AppError(
      'La subida directa no está configurada en este servidor. Usa POST /uploads/:id/audio.',
      503,
      'object_storage_disabled',
    );
  }

  const allowed = kind === 'master' ? MASTER_CONTENT_TYPES : ARTWORK_CONTENT_TYPES;
  if (!(contentType in allowed)) {
    throw new BadRequestError(
      `Tipo no permitido para ${kind}: ${contentType}. Aceptados: ${Object.keys(allowed).join(', ')}`,
    );
  }

  const presigned = await createPresignedUpload(id, kind, contentType);

  // La clave se guarda ahora, al firmar, no cuando el cliente avise: si el
  // navegador se cierra a mitad de la subida igual queda registro de qué
  // objeto se esperaba, y el confirm puede verificarlo o limpiarlo.
  if (kind === 'master') {
    await prisma.trackUpload.update({ where: { id }, data: { masterObjectKey: presigned.objectKey } });
  }

  res.json({ upload: presigned });
});

/**
 * Confirma que el máster llegó al bucket.
 *
 * No se confía en el "ya subí" del cliente: se hace un HEAD contra el objeto
 * real. Una subida directa puede fallar a mitad sin que la API se entere, y
 * seguir el pipeline con un máster inexistente hace fallar la
 * transcodificación mucho más tarde y con un error mucho peor.
 */
router.post('/:id/presign/confirm', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  const upload = await requireEditableUpload(id, req.user!.id);

  if (!upload.masterObjectKey) throw new BadRequestError('Esta subida no pidió una URL firmada');

  const info = await headObject(upload.masterObjectKey);
  if (!info) throw new BadRequestError('El archivo todavía no llegó al bucket');

  const updated = await prisma.trackUpload.update({
    where: { id },
    data: { masterUrl: publicUrlFor(upload.masterObjectKey) },
    ...UPLOAD_WITH_DETAILS,
  });

  res.json({ upload: updated, sizeBytes: info.sizeBytes });
});

/** Paso 2a: archivo de audio principal. */
router.post('/:id/audio', authMiddleware, audioUpload.single('audio'), async (req: AuthRequest, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  await requireEditableUpload(id, req.user!.id);

  if (!req.file) throw new BadRequestError('Falta el archivo de audio (campo "audio") o el formato no es válido');

  const durationSeconds = z.coerce.number().positive().max(3600 * 6).optional().parse(req.body?.durationSeconds);

  const stored = await storageService.saveFile(id, 'audio', req.file.buffer, req.file.originalname);
  const upload = await prisma.trackUpload.update({
    where: { id },
    data: { audioUrl: stored.url, durationSeconds: durationSeconds ?? null },
    ...UPLOAD_WITH_DETAILS,
  });

  res.json({ upload });
});

/** Paso 2b: portada. */
router.post('/:id/cover', authMiddleware, coverUpload.single('cover'), async (req: AuthRequest, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  await requireEditableUpload(id, req.user!.id);

  if (!req.file) throw new BadRequestError('Falta la imagen de portada (campo "cover") o el formato no es válido');

  const stored = await storageService.saveFile(id, 'cover', req.file.buffer, req.file.originalname);
  const upload = await prisma.trackUpload.update({ where: { id }, data: { coverUrl: stored.url }, ...UPLOAD_WITH_DETAILS });

  res.json({ upload });
});

/** Paso 2c/3: dispara el análisis de ritmo/audio sobre el archivo ya subido. */
router.post('/:id/analyze', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  const upload = await requireEditableUpload(id, req.user!.id);

  if (!upload.audioUrl) throw new BadRequestError('Sube el audio antes de analizarlo');

  await prisma.trackUpload.update({ where: { id }, data: { status: 'ANALYZING' } });

  try {
    // `readFile` sirve para las dos implementaciones: lee del disco o
    // descarga del bucket. Antes sólo sabía resolver rutas locales.
    const buffer = await storageService.readFile(upload.audioUrl);

    const result = await audioAnalyzer.analyze({
      buffer,
      durationSeconds: upload.durationSeconds ?? 0,
      // El analizador sólo usa esto para mirar la extensión, así que la URL
      // vale igual que una ruta y evita depender de que exista una.
      originalName: upload.audioUrl,
    });

    const updated = await prisma.trackUpload.update({
      where: { id },
      data: {
        status: 'PENDING_REVIEW',
        analysisDraft: result as unknown as object,
        // Sugerencia del análisis como valor por defecto — el creador la
        // puede pisar en el PATCH de revisión antes de publicar.
        genreOverride: upload.genreOverride ?? result.suggestedGenre,
        moodOverride: upload.moodOverride ?? result.suggestedMood,
        errorMessage: null,
      },
      ...UPLOAD_WITH_DETAILS,
    });

    res.json({ upload: updated });
  } catch (error) {
    await prisma.trackUpload.update({
      where: { id },
      data: { status: 'FAILED', errorMessage: 'No pudimos analizar el archivo de audio.' },
    });
    throw error;
  }
});

/** Paso 3: el creador corrige título/álbum/género/mood/letra antes de publicar. */
router.patch('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  const existing = await requireEditableUpload(id, req.user!.id);
  const { albumId, lyricsSyncedDraft, ...rest } = updateUploadMetadataSchema.parse(req.body);

  if (albumId) {
    const album = await prisma.album.findUnique({ where: { id: albumId } });
    if (!album || album.artistId !== existing.artistId) {
      throw new BadRequestError('El álbum no existe o no pertenece a este artista');
    }
  }

  const upload = await prisma.trackUpload.update({
    where: { id },
    data: {
      ...rest,
      // `albumId` va aparte: cuando viene `null` explícito (desvincular
      // álbum, volver a "sencillo") Prisma pide desconectar la relación, no
      // asignar `null` al campo escalar directamente.
      ...(albumId !== undefined ? { album: albumId ? { connect: { id: albumId } } : { disconnect: true } } : {}),
      // Mismo motivo para un campo Json nullable: `null` a secas no tipa,
      // Prisma pide el sentinel `Prisma.JsonNull` para "poné SQL NULL".
      ...(lyricsSyncedDraft !== undefined
        ? { lyricsSyncedDraft: lyricsSyncedDraft ?? Prisma.JsonNull }
        : {}),
    },
    ...UPLOAD_WITH_DETAILS,
  });
  res.json({ upload });
});

/** Paso 4: confirma y materializa el `Track` público — el único paso que toca el catálogo. */
router.post('/:id/publish', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  publishUploadSchema.parse(req.body);
  const upload = await requireEditableUpload(id, req.user!.id);

  if (upload.status !== 'PENDING_REVIEW') {
    throw new BadRequestError('Hace falta analizar el audio antes de publicar');
  }
  if (!upload.audioUrl || !upload.coverUrl || !upload.title) {
    throw new BadRequestError('Faltan datos: título, portada y audio son obligatorios para publicar');
  }

  const analysis = upload.analysisDraft as unknown as AudioAnalysisResult | null;
  if (!analysis) throw new BadRequestError('No hay un análisis de audio para publicar');

  /**
   * El álbum del sencillo se crea FUERA de la transacción.
   *
   * Contra una base serverless como Neon, cada sentencia dentro de una
   * transacción interactiva paga su propia ida y vuelta por red, y con
   * cinco escrituras encadenadas se superaba el límite de 5 s por defecto
   * — la publicación fallaba con "commit on an expired transaction".
   *
   * Sacar esta creación deja la transacción en lo que de verdad tiene que
   * ser atómico: nace el Track y el borrador queda marcado como publicado.
   * El peor caso ahora es un álbum huérfano si algo falla después, que es
   * mucho menos grave que un track publicado sin enlazar a su borrador
   * (el creador vería la subida como pendiente para siempre).
   */
  let albumId = upload.albumId;
  if (!albumId) {
    const single = await prisma.album.create({
      data: {
        title: upload.title!,
        artistId: upload.artistId,
        coverUrl: upload.coverUrl!,
        releaseYear: new Date().getFullYear(),
      },
    });
    albumId = single.id;
  }

  const track = await prisma.$transaction(async (tx) => {
    const createdTrack = await tx.track.create({
      data: {
        title: upload.title!,
        duration: upload.durationSeconds ?? 0,
        coverUrl: upload.coverUrl!,
        audioUrl: upload.audioUrl!,
        genre: upload.genreOverride,
        mood: upload.moodOverride,
        // Todo lo que sale del pipeline de subida entra a la cola de
        // moderación admin — distinto del default `APPROVED` del esquema,
        // pensado para datos de catálogo/seed que no pasaron por acá.
        status: 'PENDING_REVIEW',
        artistId: upload.artistId,
        albumId,
        uploadedById: upload.uploadedById,
        analysis: {
          create: {
            bpm: analysis.bpm,
            musicalKey: analysis.musicalKey,
            mode: analysis.mode,
            energy: analysis.energy,
            danceability: analysis.danceability,
            valence: analysis.valence,
            acousticness: analysis.acousticness,
            instrumentalness: analysis.instrumentalness,
            loudnessDb: analysis.loudnessDb,
            featureVector: analysis.featureVector,
            analyzerVersion: analysis.analyzerVersion,
          },
        },
        ...(upload.lyricsPlainDraft || upload.lyricsSyncedDraft
          ? { lyrics: { create: { plainText: upload.lyricsPlainDraft, synced: upload.lyricsSyncedDraft ?? undefined } } }
          : {}),
      },
      include: { artist: true, album: true, analysis: true, lyrics: true },
    });

    await tx.trackUpload.update({
      where: { id: upload.id },
      data: { status: 'PUBLISHED', publishedTrackId: createdTrack.id },
    });

    return createdTrack;
  },
  {
    // El default de Prisma (5 s) está pensado para una base en la misma
    // red. Con Neon, cada ida y vuelta cuesta decenas de milisegundos y un
    // pico de latencia agotaba el plazo. 15 s da margen sin dejar una
    // transacción colgada indefinidamente si algo se bloquea de verdad.
    timeout: 15_000,
  });

  // La onda y la sonoridad se calculan solas en cuanto la pista existe: sin
  // esto, el moderador vería una barra de progreso lisa en lugar de la forma
  // de onda y tendría que ir a "Procesamiento" a lanzarlo a mano antes de
  // poder revisar. Se encolan (no se esperan) para no alargar la respuesta
  // del publish: ffmpeg tarda segundos y el creador no tiene por qué esperar.
  if (isFfmpegAvailable()) {
    await enqueue('WAVEFORM', { trackId: track.id });
    await enqueue('LOUDNESS', { trackId: track.id });
  }

  res.status(201).json({ track });
});

router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  await requireEditableUpload(id, req.user!.id);

  await prisma.trackUpload.update({ where: { id }, data: { status: 'CANCELLED' } });
  await storageService.deleteUploadFiles(id).catch(() => {});

  res.json({ message: 'Subida cancelada' });
});

export default router;
