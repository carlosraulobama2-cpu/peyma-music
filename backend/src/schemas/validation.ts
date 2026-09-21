import { z } from 'zod';

// Mismo universo cerrado que el enum `Genre` de Prisma y que
// `src/types/index.ts` del lado de la app — un solo lugar por stack.
export const GENRE_VALUES = ['lofi', 'jazz', 'ambient', 'pop', 'hiphop', 'classical', 'electronic', 'rock'] as const;
export const genreEnum = z.enum(GENRE_VALUES);

// Moods como lista curada (no enum de DB — ver comentario en schema.prisma).
export const MOOD_VALUES = ['Relajado', 'Enérgico', 'Melancólico', 'Alegre', 'Intenso', 'Soñador'] as const;
export const moodEnum = z.enum(MOOD_VALUES);

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email('Correo electrónico inválido'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(72),
  displayName: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(50),
  favoriteGenres: z.array(z.string().trim().min(1)).max(20).optional(),
  avatarUrl: z.string().url().optional(),
  /**
   * Aceptación de los términos y la política de privacidad.
   *
   * Se exige en el servidor y no sólo con una casilla en el formulario: la
   * casilla la ve quien use la web o la app, pero la API es pública y
   * cualquiera puede llamar a `/auth/register` directamente. Si el requisito
   * viviera únicamente en el cliente, el registro no probaría nada.
   *
   * `literal(true)`: `false` y la ausencia del campo se rechazan igual, no
   * hay un "por defecto acepta".
   *
   * QUÉ versión aceptó no se pide aquí: lo estampa el servidor desde
   * `src/legal.ts`. Ver el porqué en ese archivo.
   */
  acceptedTerms: z.literal(true, {
    errorMap: () => ({ message: 'Tenés que aceptar los términos y la política de privacidad.' }),
  }),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Correo electrónico inválido'),
  password: z.string().min(1, 'La contraseña es requerida').max(72),
});

// El id_token lo emite el SDK nativo de Google Sign-In en el cliente
// (RN/Expo) — acá sólo se verifica su firma/audiencia, nunca se genera.
export const googleAuthSchema = z.object({
  idToken: z.string().min(10, 'Token de Google inválido'),
  /**
   * Opcional porque este endpoint sirve para iniciar sesión Y para
   * registrarse: a quien ya tiene cuenta no se le vuelve a pedir que
   * acepte. La ruta sólo lo exige cuando la petición acabaría creando una
   * cuenta nueva (ver routes/auth.ts).
   */
  acceptedTerms: z.literal(true).optional(),
});

export const updateProfileSchema = z
  .object({
    displayName: z.string().trim().min(2).max(50).optional(),
    avatarUrl: z.string().url().optional(),
    favoriteGenres: z.array(z.string().trim().min(1)).max(20).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Nada para actualizar' });

export const createTrackSchema = z.object({
  title: z.string().trim().min(1).max(200),
  artistId: z.string().cuid(),
  albumId: z.string().cuid(),
  duration: z.number().int().positive().max(3600 * 6), // hasta 6 horas
  coverUrl: z.string().url(),
  audioUrl: z.string().url(),
  genre: genreEnum.optional(),
  mood: moodEnum.optional(),
});

export const updateTrackSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    artistId: z.string().cuid().optional(),
    albumId: z.string().cuid().optional(),
    duration: z.number().int().positive().max(3600 * 6).optional(),
    coverUrl: z.string().url().optional(),
    audioUrl: z.string().url().optional(),
    genre: genreEnum.optional(),
    mood: moodEnum.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Nada para actualizar' });

export const createArtistSchema = z.object({
  name: z.string().trim().min(1).max(200),
  imageUrl: z.string().url(),
  genres: z.array(z.string().trim().min(1)).max(20).optional(),
  bio: z.string().trim().max(2000).optional(),
});

export const createAlbumSchema = z.object({
  title: z.string().trim().min(1).max(200),
  artistId: z.string().cuid(),
  coverUrl: z.string().url(),
  releaseYear: z.number().int().min(1900).max(new Date().getFullYear() + 1),
});

export const createPlaylistSchema = z.object({
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
  coverUrl: z.string().url().optional(),
  isPublic: z.boolean().optional(),
});

export const updatePlaylistSchema = z
  .object({
    title: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(500).optional(),
    coverUrl: z.string().url().optional(),
    isPublic: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Nada para actualizar' });

export const addTrackToPlaylistSchema = z.object({
  trackId: z.string().cuid(),
  position: z.number().int().nonnegative().optional(),
});

export const reorderTrackSchema = z.object({
  position: z.number().int().nonnegative(),
});

export const querySchema = z.object({
  page: z.coerce.number().int().positive().max(10_000).default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(200).optional(),
  /** Etiqueta libre del artista (`Artist.genres`) — no confundir con `primaryGenre`, el universo cerrado de `Track.genre`. */
  genre: z.string().trim().max(100).optional(),
  /** Universo cerrado de `Track.genre` — para los carruseles de género de Inicio (ver `GenreCarousel`/`isValidGenreForSection` en el frontend). */
  primaryGenre: genreEnum.optional(),
  /** Ánimo curado (`Track.mood`) — alimenta las tarjetas de ánimo de Buscar. */
  mood: z.string().trim().max(50).optional(),
  artistId: z.string().cuid().optional(),
  albumId: z.string().cuid().optional(),
  userId: z.string().cuid().optional(),
});

export const idParamSchema = z.object({
  id: z.string().cuid(),
});

export const trackParamSchema = z.object({
  id: z.string().cuid(),
  trackId: z.string().cuid(),
});

// --- Pipeline de subida (ver routes/uploads.ts) ---

export const createUploadSchema = z.object({
  artistId: z.string().cuid(),
  albumId: z.string().cuid().optional(), // sin álbum -> se publica como sencillo
  title: z.string().trim().min(1).max(200).optional(),
});

export const updateUploadMetadataSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    albumId: z.string().cuid().nullable().optional(),
    genreOverride: genreEnum.nullable().optional(),
    moodOverride: moodEnum.nullable().optional(),
    lyricsPlainDraft: z.string().trim().max(20_000).nullable().optional(),
    // LRC-like: [{ timeMs, text }, …], ordenado y con timeMs no negativo.
    lyricsSyncedDraft: z
      .array(z.object({ timeMs: z.number().int().nonnegative(), text: z.string().max(500) }))
      .max(2000)
      .nullable()
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Nada para actualizar' });

export const publishUploadSchema = z.object({
  // Confirmación explícita: publicar no debe ser un efecto secundario de otra
  // llamada — el creador tiene que pedirlo a propósito, con el body vacío
  // permitido (usa lo que ya quedó guardado en el borrador).
  confirm: z.literal(true),
});

export const generatePlaylistSchema = z.object({
  type: z.enum(['RHYTHM_MATCH', 'DAILY_MIX', 'GENRE_MIX']),
  seedTrackId: z.string().cuid().optional(),
  genre: genreEnum.optional(),
});

// --- Reproducciones (ver services/streamLog.ts, routes/streams.ts) ---

export const logStreamSchema = z.object({
  trackId: z.string().cuid(),
  /**
   * Segundos realmente escuchados. Opcional para no romper a los clientes
   * que ya llaman sin él; cuando falta, las métricas de horas estiman con la
   * duración completa y lo declaran como estimación.
   */
  secondsPlayed: z.number().int().min(0).max(3600 * 6).optional(),
  /**
   * Ubicación aproximada. Opcional siempre: el servidor la descarta si el
   * usuario no dio consentimiento, así que mandarla nunca es suficiente.
   */
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

export const locationConsentSchema = z.object({
  consent: z.enum(['GRANTED', 'DENIED']),
});

/**
 * Denuncia de una canción.
 *
 * En plagio y copyright el detalle es OBLIGATORIO: sin decir de qué obra se
 * trata la denuncia no es accionable, y un moderador no puede resolver
 * "esto es plagio" sin más.
 */
export const createReportSchema = z
  .object({
    trackId: z.string().cuid(),
    reason: z.enum([
      'PLAGIARISM',
      'COPYRIGHT',
      'EXPLICIT_CONTENT',
      'HATE_SPEECH',
      'MISLEADING_METADATA',
      'LOW_QUALITY',
      'OTHER',
    ]),
    details: z.string().trim().max(1500).optional(),
  })
  .refine(
    (data) => !['PLAGIARISM', 'COPYRIGHT', 'OTHER'].includes(data.reason) || (data.details?.length ?? 0) >= 10,
    { path: ['details'], message: 'Explicá el motivo con al menos 10 caracteres para que se pueda revisar' },
  );

/** Solicitud de promoción en la primera fila. */
export const createPromotionSchema = z.object({
  trackId: z.string().cuid(),
  days: z.number().int().min(1).max(30),
});

/** Reordenado de la primera fila desde el panel. */
export const reorderPromotionsSchema = z.object({
  orderedIds: z.array(z.string().cuid()).max(50),
});

export type CreatePromotionInput = z.infer<typeof createPromotionSchema>;

/** Resolución de una denuncia desde el panel. */
export const resolveReportSchema = z.object({
  status: z.enum(['REVIEWING', 'UPHELD', 'DISMISSED']),
  note: z.string().trim().max(1000).optional(),
  /** Qué hacer con la pista al dar la razón al denunciante. */
  action: z.enum(['NONE', 'BLOCK', 'DELETE']).default('NONE'),
});

/** Bloqueo/desbloqueo de una pista concreta. */
export const blockTrackSchema = z.object({
  isBlocked: z.boolean(),
  reason: z.string().trim().max(300).optional(),
});

export type CreateReportInput = z.infer<typeof createReportSchema>;
export type ResolveReportInput = z.infer<typeof resolveReportSchema>;
export type BlockTrackInput = z.infer<typeof blockTrackSchema>;

export const completeStreamSchema = z.object({
  secondsPlayed: z.number().int().min(0).max(3600 * 6),
});

/** Términos de búsqueda a registrar (ver services/audienceStats.ts). */
export const logSearchSchema = z.object({
  query: z.string().trim().min(1).max(200),
  resultCount: z.number().int().min(0),
});

/** Ritmo musical editable desde el panel. */
export const musicGenreSchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Color en formato #RRGGBB')
    .default('#1f6feb'),
  isActive: z.boolean().default(true),
  position: z.number().int().min(0).max(999).default(0),
});

export const updateSettingSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.string().max(500),
});

export type LogSearchInput = z.infer<typeof logSearchSchema>;
export type MusicGenreInput = z.infer<typeof musicGenreSchema>;
export type UpdateSettingInput = z.infer<typeof updateSettingSchema>;

// --- Moderación admin (ver routes/admin.ts) ---

export const reviewTrackSchema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('APPROVED') }),
  z.object({ decision: z.literal('REJECTED'), reason: z.string().trim().min(1).max(500) }),
]);

/** Explícito y no un toggle ciego: el cliente dice a qué estado quiere llegar, así dos pestañas abiertas no se pisan. */
export const blockArtistSchema = z.object({
  isBlocked: z.boolean(),
});

/* --- Verificación, secciones editoriales y usuarios (panel admin) --- */

export const verifyArtistSchema = z.object({ isVerified: z.boolean() });

export const userRoleSchema = z.object({ role: z.enum(['USER', 'ARTIST', 'ADMIN']) });

/**
 * Sección de la portada.
 *
 * El `slug` se restringe a minúsculas, números y guiones porque va en una
 * URL pública (`/seccion/lo-nuevo`): permitir acentos o espacios obligaría a
 * codificarlo en cada cliente y produciría rutas distintas para la misma
 * sección según quién la construya.
 */
export const editorialSectionSchema = z.object({
  title: z.string().trim().min(1).max(60),
  subtitle: z.string().trim().max(140).nullish(),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Sólo minúsculas, números y guiones (ej. "lo-nuevo")'),
  kind: z.enum(['MANUAL', 'NEW_RELEASES', 'TOP_TRACKS', 'TOP_ALBUMS', 'TOP_ARTISTS']).default('MANUAL'),
  layout: z.enum(['CAROUSEL', 'GRID', 'HERO']).default('CAROUSEL'),
  position: z.number().int().min(0).max(999).default(0),
  isPublished: z.boolean().default(false),
  maxItems: z.number().int().min(1).max(50).default(10),
});

/**
 * Piezas de una sección manual.
 *
 * Cada pieza referencia exactamente UNA cosa. El `refine` lo comprueba
 * porque el esquema de base permite las tres columnas nulas, y una fila con
 * las tres vacías (o con dos llenas) sería un elemento que la portada no
 * sabría dibujar.
 */
export const editorialItemsSchema = z.object({
  items: z
    .array(
      z
        .object({
          trackId: z.string().cuid().optional(),
          albumId: z.string().cuid().optional(),
          artistId: z.string().cuid().optional(),
        })
        .refine(
          (item) => [item.trackId, item.albumId, item.artistId].filter(Boolean).length === 1,
          'Cada pieza tiene que referenciar exactamente una pista, un álbum o un artista',
        ),
    )
    .max(50),
});

export type VerifyArtistInput = z.infer<typeof verifyArtistSchema>;
export type UserRoleInput = z.infer<typeof userRoleSchema>;
export type EditorialSectionInput = z.infer<typeof editorialSectionSchema>;
export type EditorialItemsInput = z.infer<typeof editorialItemsSchema>;

/* --- Procesamiento de audio (panel admin) --- */

/**
 * Qué trabajos encolar para una pista. El default los pide todos, que es lo
 * que quiere el botón "Procesar" del panel; poder elegir sirve para
 * reprocesar sólo la parte que falló sin repetir la transcodificación, que
 * es la cara.
 */
export const processTrackSchema = z.object({
  jobs: z
    .array(z.enum(['WAVEFORM', 'LOUDNESS', 'TRANSCODE', 'COLOR']))
    .nonempty()
    .default(['WAVEFORM', 'LOUDNESS', 'COLOR', 'TRANSCODE']),
});

export const jobFilterSchema = z.object({
  status: z.enum(['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED']).optional(),
});

/** Tipo de contenido para pedir una URL firmada de subida directa. */
export const presignUploadSchema = z.object({
  kind: z.enum(['master', 'artwork']),
  contentType: z.string().min(1).max(100),
});

export type ProcessTrackInput = z.infer<typeof processTrackSchema>;
export type JobFilterInput = z.infer<typeof jobFilterSchema>;
export type PresignUploadInput = z.infer<typeof presignUploadSchema>;

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type GoogleAuthInput = z.infer<typeof googleAuthSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type CreateTrackInput = z.infer<typeof createTrackSchema>;
export type UpdateTrackInput = z.infer<typeof updateTrackSchema>;
export type CreateArtistInput = z.infer<typeof createArtistSchema>;
export type CreateAlbumInput = z.infer<typeof createAlbumSchema>;
export type CreatePlaylistInput = z.infer<typeof createPlaylistSchema>;
export type UpdatePlaylistInput = z.infer<typeof updatePlaylistSchema>;
export type AddTrackToPlaylistInput = z.infer<typeof addTrackToPlaylistSchema>;
export type ReorderTrackInput = z.infer<typeof reorderTrackSchema>;
export type QueryInput = z.infer<typeof querySchema>;
export type IdParam = z.infer<typeof idParamSchema>;
export type TrackParam = z.infer<typeof trackParamSchema>;
export type CreateUploadInput = z.infer<typeof createUploadSchema>;
export type UpdateUploadMetadataInput = z.infer<typeof updateUploadMetadataSchema>;
export type GeneratePlaylistInput = z.infer<typeof generatePlaylistSchema>;
export type ReviewTrackInput = z.infer<typeof reviewTrackSchema>;
export type LogStreamInput = z.infer<typeof logStreamSchema>;

/**
 * Tipo de imagen declarado al pedir la URL firmada del avatar.
 *
 * Se valida contra la misma lista que usa el bucket para derivar la
 * extensión del objeto. Va dentro de la firma, así que una URL emitida para
 * un JPEG no sirve para subir otra cosa.
 */
export const avatarPresignSchema = z.object({
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
});

export const blockPlaylistSchema = z.object({
  isBlocked: z.boolean(),
  reason: z.string().trim().min(1).max(500).optional(),
});

/**
 * Borrado o bloqueo de varias canciones a la vez desde el perfil del artista.
 *
 * El tope de 100 no es arbitrario: es una acción destructiva sobre contenido
 * ajeno y conviene que el moderador la haga por tandas revisables, no de
 * golpe sobre una discografía entera por un clic mal dado en "seleccionar
 * todo".
 */
export const bulkTrackActionSchema = z.object({
  trackIds: z.array(z.string().min(1)).min(1).max(100),
  reason: z.string().trim().min(1).max(500).optional(),
});

export const importUrlSchema = z.object({
  url: z.string().trim().min(1).max(2000),
});

/**
 * Confirmación de una importación.
 *
 * `rightsConfirmed` es obligatorio y tiene que ser `true`: quien publica
 * declara que tiene derechos sobre la grabación. Queda en la bitácora con su
 * nombre, que es lo que convierte una importación en una decisión con
 * responsable si después llega una reclamación.
 */
export const confirmImportSchema = z.object({
  importId: z.string().uuid(),
  audioUrl: z.string().url(),
  coverUrl: z.string().url().optional(),
  title: z.string().trim().min(1).max(200),
  artistId: z.string().min(1),
  albumId: z.string().min(1).optional(),
  durationSeconds: z.number().int().positive().max(3600),
  sourceUrl: z.string().url(),
  genre: z.string().trim().min(1).max(60).optional(),
  rightsConfirmed: z.literal(true, {
    errorMap: () => ({ message: 'Hay que declarar que se tienen los derechos sobre la grabación.' }),
  }),
});
