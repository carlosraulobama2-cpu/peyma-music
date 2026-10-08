import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInRight, FadeOutLeft } from 'react-native-reanimated';
import { useAuthStore, toast } from '../src/store';
import { Button } from '../src/components';
import { getPalette, spacing, typography, motion, radius, type Theme } from '../src/theme';
import { getInitials } from '../src/utils';
import { signInWithGoogle, isGoogleSignInCancelled, isGoogleSignInConfigured } from '../src/services/googleSignIn';
import { useAsyncData } from '../src/hooks';
import { api, type HomeFeed } from '../src/services';

/**
 * Fondo del login: mosaico con portadas y fotos de artistas reales del
 * catálogo — el mismo tratamiento que el landing de la web (mismo motivo:
 * nada de fotos de stock de alguien con auriculares, la prueba de que hay
 * música real es la música real).
 *
 * Es siempre oscuro, sin importar el tema elegido en Ajustes: es un momento
 * de marca (como el login de Spotify o Apple Music), no una pantalla de
 * datos que deba respetar "claro/oscuro". Los colores son literalmente los
 * de la paleta oscura (`src/theme/tokens.ts`), no inventados, para que
 * coincida en todo con el resto de la app en modo oscuro.
 */
interface MosaicImage {
  id: string;
  src: string;
}

function buildMosaicImages(feed: HomeFeed | null): MosaicImage[] {
  if (!feed) return [];
  const deTracks = feed.rows
    .flatMap((row) => row.tracks)
    .map((track) => ({ id: `track-${track.id}`, src: track.coverUrl }));
  const deArtistas = feed.artists.map((artist) => ({ id: `artist-${artist.id}`, src: artist.imageUrl }));

  const mezcla: MosaicImage[] = [];
  let it = 0;
  let ia = 0;
  while (it < deTracks.length || ia < deArtistas.length) {
    if (it < deTracks.length) mezcla.push(deTracks[it++]);
    if (it < deTracks.length) mezcla.push(deTracks[it++]);
    if (ia < deArtistas.length) mezcla.push(deArtistas[ia++]);
  }
  return mezcla;
}

const MOSAIC_COLUMNAS = 5;
const MOSAIC_CELDAS = 40;

function LoginBackdrop({ images }: { images: MosaicImage[] }) {
  if (images.length === 0) {
    // Sin catálogo (API caída o sin conexión) el login no se queda en
    // blanco: cae al fondo oscuro liso de siempre.
    return <View style={[StyleSheet.absoluteFill, loginBackdropStyles.fallback]} />;
  }

  const celdas = Array.from({ length: MOSAIC_CELDAS }, (_, indice) => images[indice % images.length]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={loginBackdropStyles.grid}>
        {celdas.map((imagen, indice) => (
          <Image
            key={`${imagen.id}-${indice}`}
            source={imagen.src}
            style={loginBackdropStyles.cell}
            contentFit="cover"
          />
        ))}
      </View>
      <LinearGradient
        colors={['rgba(10,10,10,0.45)', 'rgba(10,10,10,0.65)', '#0A0A0A']}
        locations={[0, 0.5, 0.92]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

const loginBackdropStyles = StyleSheet.create({
  fallback: {
    backgroundColor: '#0A0A0A',
  },
  grid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: `${100 / MOSAIC_COLUMNAS}%`,
    aspectRatio: 1,
    opacity: 0.6,
  },
});

/**
 * Login en tres pasos, al estilo Spotify/Apple: correo → contraseña →
 * confirmación. Separar el correo de la contraseña dice antes si la cuenta
 * existe y deja espacio para "continuar con Google" sin abarrotar un único
 * formulario.
 */
const STEPS = ['email', 'password', 'confirm'] as const;
type Step = (typeof STEPS)[number];

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Siempre oscuro, sin importar Ajustes → Apariencia: ver el comentario de
  // `LoginBackdrop` más arriba. No se usa `useTheme()`/`useThemedStyles` a
  // propósito, porque esos siguen la preferencia del usuario.
  const theme = useMemo<Theme>(() => ({ mode: 'dark', colors: getPalette('dark'), isDark: true }), []);
  const { colors } = theme;
  const styles = useMemo(() => StyleSheet.create(makeStyles(theme)), [theme]);

  const login = useAuthStore((s) => s.login);
  const loginWithGoogle = useAuthStore((s) => s.loginWithGoogle);
  const isSubmitting = useAuthStore((s) => s.isSubmitting);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const { data: homeFeed } = useAsyncData((signal) => api.getHomeFeed({ signal }), []);
  const mosaicImages = useMemo(() => buildMosaicImages(homeFeed), [homeFeed]);

  const [stepIndex, setStepIndex] = useState(0);
  const step: Step = STEPS[stepIndex] ?? 'email';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const passwordInputRef = useRef<TextInput>(null);

  useEffect(() => {
    // Ya había sesión (p. ej. se volvió a esta pantalla por error): entra
    // directo, sin pasar por los tres pasos de nuevo.
    if (isAuthenticated && stepIndex === 0) router.replace('/(tabs)');
  }, [isAuthenticated, stepIndex, router]);

  useEffect(() => {
    // Login recién hecho: deja ver un instante el paso de confirmación
    // (como el "signing in…" de Spotify/Apple) antes de entrar a la app.
    if (!isAuthenticated || step !== 'confirm') return;
    const timer = setTimeout(() => router.replace('/(tabs)'), 900);
    return () => clearTimeout(timer);
  }, [isAuthenticated, step, router]);

  const goToPassword = () => {
    if (!EMAIL_PATTERN.test(email.trim())) {
      toast.error('Ingresa un correo electrónico válido.');
      return;
    }
    setStepIndex(1);
    // El siguiente frame ya montó el input de contraseña.
    requestAnimationFrame(() => passwordInputRef.current?.focus());
  };

  const goBack = () => setStepIndex((i) => Math.max(0, i - 1));

  const handleLogin = async () => {
    // Sin mínimo de longitud: aquí la cuenta YA existe y el backend acepta
    // cualquier contraseña no vacía al entrar. El 6 que había aquí no era
    // el mínimo de nada — el del registro son 8 — y dejaba fuera a quien
    // tuviera una contraseña más corta de antes. `login` del store ya
    // rechaza la cadena vacía.
    try {
      await login(email.trim(), password);
      setStepIndex(2); // paso de confirmación, antes de entrar a la app
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo iniciar sesión.';
      toast.error(message);
    }
  };

  const handleGoogleLogin = async () => {
    if (!isGoogleSignInConfigured()) {
      toast.error('El inicio de sesión con Google todavía no está configurado en esta build.');
      return;
    }
    setIsGoogleSubmitting(true);
    try {
      const idToken = await signInWithGoogle();
      await loginWithGoogle(idToken);
      setStepIndex(2);
    } catch (error) {
      if (!isGoogleSignInCancelled(error)) {
        const message = error instanceof Error ? error.message : 'No se pudo iniciar sesión con Google.';
        toast.error(message);
      }
    } finally {
      setIsGoogleSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <LoginBackdrop images={mosaicImages} />
      <View style={[styles.container, { paddingTop: insets.top + spacing.xl }]}>
        <View style={styles.topBar}>
          {step !== 'confirm' && stepIndex > 0 ? (
            <Pressable onPress={goBack} hitSlop={16} accessibilityRole="button" accessibilityLabel="Atrás" style={styles.backButton}>
              <Ionicons name="chevron-back" size={24} color={colors.text.primary} />
            </Pressable>
          ) : (
            <View style={styles.backButton} />
          )}

          <View style={styles.stepDots}>
            {STEPS.map((s, i) => (
              <View key={s} style={[styles.stepDot, i <= stepIndex && styles.stepDotActive]} />
            ))}
          </View>

          <View style={styles.backButton} />
        </View>

        {step === 'email' && (
          <Animated.View entering={FadeInRight.duration(motion.duration.normal)} exiting={FadeOutLeft.duration(motion.duration.fast)} style={styles.stepContent}>
            <Ionicons name="musical-notes" size={48} color={colors.brand[500]} style={styles.logo} />
            <Text style={styles.title}>
              Inicia sesión en <Text style={{ color: colors.brand[500] }}>Peyma Music</Text>
            </Text>
            <Text style={styles.subtitle}>Escribe tu correo electrónico para continuar.</Text>

            <TextInput
              style={styles.input}
              placeholder="tu@email.com"
              placeholderTextColor={colors.text.muted}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
              autoFocus
              returnKeyType="next"
              onSubmitEditing={goToPassword}
              accessibilityLabel="Correo electrónico"
            />

            <Button title="Continuar" onPress={goToPassword} disabled={!email.trim()} fullWidth style={styles.actionButton} />

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>o</Text>
              <View style={styles.dividerLine} />
            </View>

            <Pressable
              onPress={handleGoogleLogin}
              disabled={isGoogleSubmitting}
              accessibilityRole="button"
              accessibilityLabel="Continuar con Google"
              style={[styles.googleButton, isGoogleSubmitting && styles.googleButtonDisabled]}
            >
              {isGoogleSubmitting ? (
                <ActivityIndicator size="small" color={colors.text.primary} />
              ) : (
                <>
                  <Ionicons name="logo-google" size={18} color={colors.text.primary} />
                  <Text style={styles.googleButtonText}>Continuar con Google</Text>
                </>
              )}
            </Pressable>

            <Pressable onPress={() => router.push('/onboarding')} style={styles.linkButton}>
              <Text style={styles.linkText}>¿No tienes cuenta? Empieza aquí</Text>
            </Pressable>
          </Animated.View>
        )}

        {step === 'password' && (
          <Animated.View entering={FadeInRight.duration(motion.duration.normal)} exiting={FadeOutLeft.duration(motion.duration.fast)} style={styles.stepContent}>
            <View style={styles.emailChip}>
              <Text style={styles.emailChipText} numberOfLines={1}>{email}</Text>
              <Pressable onPress={goBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Cambiar correo">
                <Text style={styles.emailChipEdit}>Cambiar</Text>
              </Pressable>
            </View>

            <Text style={styles.title}>Ingresa tu contraseña</Text>

            <TextInput
              ref={passwordInputRef}
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor={colors.text.muted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              returnKeyType="go"
              onSubmitEditing={handleLogin}
              accessibilityLabel="Contraseña"
            />

            <Button
              title="Iniciar sesión"
              onPress={handleLogin}
              loading={isSubmitting}
              disabled={isSubmitting || password.length === 0}
              fullWidth
              style={styles.actionButton}
            />
          </Animated.View>
        )}

        {step === 'confirm' && (
          <Animated.View entering={FadeIn.duration(motion.duration.slow)} style={[styles.stepContent, styles.confirmContent]}>
            {isAuthenticated ? (
              <>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{getInitials(email)}</Text>
                </View>
                <Text style={styles.title}>¡Todo listo!</Text>
                <Text style={styles.subtitle}>Entrando a tu música…</Text>
              </>
            ) : (
              <ActivityIndicator size="large" color={colors.brand[500]} />
            )}
          </Animated.View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const makeStyles = ({ colors }: Theme) => ({
  flex: {
    flex: 1,
    backgroundColor: colors.surface[50],
  },
  container: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  topBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: spacing['2xl'],
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  stepDots: {
    flexDirection: 'row' as const,
    gap: spacing.sm,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.surface[400],
  },
  stepDotActive: {
    backgroundColor: colors.brand[500],
  },
  stepContent: {
    flex: 1,
    justifyContent: 'center' as const,
  },
  confirmContent: {
    alignItems: 'center' as const,
  },
  logo: {
    marginBottom: spacing.lg,
    alignSelf: 'center' as const,
  },
  title: {
    color: colors.text.primary,
    fontFamily: typography.family.bold,
    fontSize: typography.size['2xl'],
    marginBottom: spacing.sm,
    textAlign: 'center' as const,
  },
  subtitle: {
    color: colors.text.secondary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.base,
    marginBottom: spacing['2xl'],
    textAlign: 'center' as const,
  },
  input: {
    height: 52,
    backgroundColor: colors.surface[200],
    borderRadius: 10,
    paddingHorizontal: spacing.lg,
    color: colors.text.primary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.base,
    marginBottom: spacing.xl,
  },
  actionButton: {
    marginTop: spacing.sm,
  },
  divider: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.surface[300],
  },
  dividerText: {
    color: colors.text.muted,
    fontFamily: typography.family.regular,
    fontSize: typography.size.xs,
  },
  googleButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: spacing.sm,
    height: 52,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.surface[400],
    marginTop: spacing.xl,
  },
  googleButtonDisabled: {
    opacity: 0.6,
  },
  googleButtonText: {
    color: colors.text.primary,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.base,
  },
  linkButton: {
    alignItems: 'center' as const,
    padding: spacing.sm,
    marginTop: spacing.lg,
  },
  linkText: {
    color: colors.brand[500],
    fontFamily: typography.family.medium,
    fontSize: typography.size.base,
  },
  emailChip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    backgroundColor: colors.surface[200],
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    marginBottom: spacing['2xl'],
  },
  emailChipText: {
    flex: 1,
    color: colors.text.primary,
    fontFamily: typography.family.medium,
    fontSize: typography.size.sm,
    marginRight: spacing.sm,
  },
  emailChipEdit: {
    color: colors.brand[500],
    fontFamily: typography.family.semibold,
    fontSize: typography.size.sm,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: colors.brand[500],
    marginBottom: spacing.xl,
  },
  avatarText: {
    color: colors.text.onBrand,
    fontFamily: typography.family.bold,
    fontSize: typography.size.xl,
  },
});
