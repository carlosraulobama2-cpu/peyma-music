import { Router, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { prisma } from '../prismaClient';
import { authMiddleware, type AuthRequest } from '../middleware/auth';
import { hashPassword, comparePassword, generateToken } from '../utils/auth';
import { ZodError } from 'zod';
import { registerSchema, loginSchema, updateProfileSchema, googleAuthSchema, avatarPresignSchema } from '../schemas/validation';
import { recordSignupFailure } from '../services/signupAttempts';
import { AppError, ConflictError, UnauthorizedError, NotFoundError } from '../utils/errors';
import { verifyGoogleIdToken } from '../services/googleAuth';
import { isObjectStorageEnabled, createPresignedAvatarUpload } from '../services/objectStorage';
import { CURRENT_TERMS_VERSION } from '../legal';

const router = Router();

const PUBLIC_USER_SELECT = {
  id: true,
  email: true,
  displayName: true,
  avatarUrl: true,
  favoriteGenres: true,
  role: true,
  createdAt: true,
} as const;

/**
 * Login/registro son los blancos favoritos de fuerza bruta y de creación
 * masiva de cuentas — límite propio, más estricto que el general de la API.
 */
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espera unos minutos e intenta de nuevo.' },
});

router.post('/register', authRateLimit, async (req, res: Response) => {
  // El parseo va en try/catch en vez de dejar que Express lo propague: hay
  // que dejar constancia de en QUÉ paso falló el alta antes de rechazarla,
  // y una vez que el error sube al middleware ya no se sabe si fue
  // validación, correo duplicado o un fallo nuestro.
  let data: ReturnType<typeof registerSchema.parse>;
  try {
    data = registerSchema.parse(req.body);
  } catch (error) {
    const email = typeof req.body?.email === 'string' ? req.body.email : null;
    const reason = error instanceof ZodError ? Object.keys(error.flatten().fieldErrors).join(', ') : 'formulario inválido';
    await recordSignupFailure(req, 'VALIDATION', reason || 'formulario inválido', email);
    throw error;
  }

  const existingUser = await prisma.user.findUnique({ where: { email: data.email } });
  if (existingUser) {
    await recordSignupFailure(req, 'DUPLICATE_EMAIL', 'Ya existe una cuenta con ese correo', data.email);
    throw new ConflictError('Ese correo ya está registrado');
  }

  const passwordHash = await hashPassword(data.password);
  const user = await prisma.user.create({
    data: {
      email: data.email,
      displayName: data.displayName,
      passwordHash,
      favoriteGenres: data.favoriteGenres ?? [],
      avatarUrl: data.avatarUrl,
      // El `acceptedTerms: true` ya lo exigió el esquema; acá se deja
      // constancia de CUÁNDO y de QUÉ versión, que es lo que convierte la
      // casilla en un registro con valor.
      acceptedTermsVersion: CURRENT_TERMS_VERSION,
      acceptedTermsAt: new Date(),
    },
    select: PUBLIC_USER_SELECT,
  });

  const token = generateToken({ userId: user.id, email: user.email });
  res.status(201).json({ user, token });
});

router.post('/login', authRateLimit, async (req, res: Response) => {
  const data = loginSchema.parse(req.body);

  const user = await prisma.user.findUnique({ where: { email: data.email } });
  // Mismo mensaje para "no existe" y "contraseña incorrecta": no delatar
  // qué correos están registrados a quien intenta adivinar cuentas.
  if (!user) throw new UnauthorizedError('Correo o contraseña incorrectos');
  if (!user.passwordHash) throw new UnauthorizedError('Esta cuenta inicia sesión con Google, no con contraseña');

  const isValid = await comparePassword(data.password, user.passwordHash);
  if (!isValid) throw new UnauthorizedError('Correo o contraseña incorrectos');

  const token = generateToken({ userId: user.id, email: user.email });
  const { passwordHash: _passwordHash, ...userWithoutPassword } = user;
  res.json({ user: userWithoutPassword, token });
});

/**
 * Login/registro con Google — un solo endpoint para los dos casos:
 *  - Cuenta nueva: se crea sin contraseña, ya vinculada a `googleId`.
 *  - Cuenta existente (registrada por email/contraseña) sin `googleId` aún:
 *    se vincula automáticamente en vez de crear un usuario duplicado.
 *  - Cuenta ya vinculada: se usa tal cual, no hay nada que actualizar.
 */
router.post('/google/token', authRateLimit, async (req, res: Response) => {
  const { idToken, acceptedTerms } = googleAuthSchema.parse(req.body);
  const profile = await verifyGoogleIdToken(idToken);

  let user = await prisma.user.findFirst({
    where: { OR: [{ googleId: profile.googleId }, { email: profile.email }] },
  });

  if (!user) {
    /**
     * Entrar con Google en una cuenta que no existe ES un registro, y como
     * tal necesita la aceptación. Se comprueba aquí y no en el esquema
     * porque el mismo endpoint sirve para iniciar sesión: a quien ya tiene
     * cuenta no se le puede exigir que vuelva a aceptar en cada entrada.
     *
     * El código `terms_required` deja que el cliente distinga este caso y
     * muestre el paso de aceptación en vez de un error genérico: el botón
     * de Google puede abrirse desde la pantalla de login, donde todavía no
     * se preguntó nada.
     */
    if (acceptedTerms !== true) {
      throw new AppError('Tenés que aceptar los términos y la política de privacidad para crear la cuenta.', 400, 'terms_required');
    }

    user = await prisma.user.create({
      data: {
        email: profile.email,
        displayName: profile.displayName,
        googleId: profile.googleId,
        avatarUrl: profile.avatarUrl,
        favoriteGenres: [],
        acceptedTermsVersion: CURRENT_TERMS_VERSION,
        acceptedTermsAt: new Date(),
      },
    });
  } else if (!user.googleId) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { googleId: profile.googleId, avatarUrl: user.avatarUrl ?? profile.avatarUrl },
    });
  }

  const token = generateToken({ userId: user.id, email: user.email });
  const { passwordHash: _passwordHash, ...userWithoutPassword } = user;
  res.json({ user: userWithoutPassword, token });
});

/**
 * Con JWT sin estado no hay sesión de servidor que destruir — el cliente es
 * quien descarta el token. Este endpoint sólo valida que el token sea
 * válido (401 si no) y responde, por simetría con el resto de la API.
 */
router.post('/logout', authMiddleware, async (_req: AuthRequest, res: Response) => {
  res.json({ message: 'Sesión cerrada' });
});

router.get('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: {
      ...PUBLIC_USER_SELECT,
      updatedAt: true,
      _count: { select: { playlists: true, favorites: true, following: true } },
    },
  });
  if (!user) throw new NotFoundError('Usuario');
  res.json({ user });
});

router.patch('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  const data = updateProfileSchema.parse(req.body);
  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data,
    select: { ...PUBLIC_USER_SELECT, updatedAt: true },
  });
  res.json({ user });
});

/**
 * URL firmada para subir la foto de perfil.
 *
 * El cliente hace PUT del archivo DIRECTO al bucket y después manda el
 * `publicUrl` en `PATCH /auth/me`. La foto nunca pasa por la API: una selfie
 * de un móvil moderno son varios megas, y hacerlas pasar por aquí gastaría
 * memoria y ancho de banda del servidor para nada.
 *
 * Sustituye al campo de texto donde antes había que pegar una URL a mano —
 * que además sólo funcionaba si la imagen ya estaba publicada en algún sitio.
 */
router.post('/me/avatar/presign', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { contentType } = avatarPresignSchema.parse(req.body);

  if (!isObjectStorageEnabled()) {
    throw new AppError(
      'La subida de fotos no está configurada en este servidor.',
      503,
      'object_storage_disabled',
    );
  }

  const upload = await createPresignedAvatarUpload(req.user!.id, contentType);
  res.json({ upload });
});

export default router;
