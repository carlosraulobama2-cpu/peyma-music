import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, ScrollView, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInRight, FadeOutLeft, LinearTransition } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useAuthStore, toast } from '../src/store';
import { Button } from '../src/components';
import { http } from '../src/services/httpClient';
import { evaluatePassword, MIN_PASSWORD_LENGTH } from '../src/utils/passwordStrength';
import { TERMS_VERSION } from '../src/legal';
import { useTheme, useThemedStyles, spacing, typography, motion, radius, type Theme } from '../src/theme';

/**
 * Alta de cuenta, en pasos.
 *
 * Lo que había antes eran dos pantallas: los tres campos de golpe y luego
 * los géneros. Se parte en cinco por los mismos motivos que en la web (ver
 * `web/src/app/register/page.tsx`): validar cada cosa en el momento, poder
 * explicar por qué se pide, y sobre todo tener un sitio donde pedir la
 * aceptación de términos y privacidad, que el backend ahora exige.
 *
 * Los géneros salen del catálogo real (`GET /api/genres`, público) en vez
 * de la lista fija que había escrita aquí: aquella ofrecía estilos sin una
 * sola canción y se dejaba fuera los que sí tienen.
 */

type StepId = 'email' | 'password' | 'name' | 'taste' | 'terms';

const STEPS: StepId[] = ['email', 'password', 'name', 'taste', 'terms'];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_GENRES = 20;

interface GenreCard {
  id: string;
  label: string;
  color: string;
  trackCount: number;
}

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const register = useAuthStore((s) => s.register);
  const isSubmitting = useAuthStore((s) => s.isSubmitting);

  const [stepIndex, setStepIndex] = useState(0);
  const step = STEPS[stepIndex]!;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verPassword, setVerPassword] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [genres, setGenres] = useState<GenreCard[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [aceptaTerminos, setAceptaTerminos] = useState(false);

  /**
   * Se piden al llegar al segundo paso, no al montar: así ya están cuando
   * se llega al de gustos y no se ve un hueco cargando, pero tampoco se
   * gasta una petición si alguien abre la pantalla y se vuelve.
   */
  useEffect(() => {
    if (stepIndex < 1 || genres.length > 0) return;
    let cancelado = false;
    http
      .get<{ genres: GenreCard[] }>('/genres')
      .then((res) => {
        if (!cancelado) setGenres(res.genres.slice(0, 24));
      })
      .catch(() => {
        // Sin géneros el paso se salta solo. Que falle el catálogo no puede
        // impedir crear una cuenta.
      });
    return () => {
      cancelado = true;
    };
  }, [stepIndex, genres.length]);

  const strength = useMemo(() => evaluatePassword(password, { email, displayName }), [password, email, displayName]);

  const emailValido = EMAIL_PATTERN.test(email.trim());
  const nombreValido = displayName.trim().length >= 2;
  const passwordValida = password.length >= MIN_PASSWORD_LENGTH;

  const puedeAvanzar =
    (step === 'email' && emailValido) ||
    (step === 'password' && passwordValida) ||
    (step === 'name' && nombreValido) ||
    step === 'taste' ||
    (step === 'terms' && aceptaTerminos);

  const avanzar = () => {
    setStepIndex((i) => {
      let siguiente = i + 1;
      if (STEPS[siguiente] === 'taste' && genres.length === 0) siguiente += 1;
      return Math.min(STEPS.length - 1, siguiente);
    });
  };

  const retroceder = () => {
    setStepIndex((i) => {
      let anterior = i - 1;
      if (STEPS[anterior] === 'taste' && genres.length === 0) anterior -= 1;
      return Math.max(0, anterior);
    });
  };

  const alternarGenero = (label: string) => {
    Haptics.selectionAsync().catch(() => {});
    setSelected((prev) =>
      prev.includes(label) ? prev.filter((g) => g !== label) : prev.length >= MAX_GENRES ? prev : [...prev, label],
    );
  };

  const crearCuenta = async () => {
    try {
      await register({
        email: email.trim(),
        password,
        displayName: displayName.trim(),
        favoriteGenres: selected,
        acceptedTerms: aceptaTerminos,
      });
      router.replace('/(tabs)');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo crear la cuenta.');
    }
  };

  const continuar = () => {
    if (!puedeAvanzar) return;
    if (step === 'terms') {
      crearCuenta();
      return;
    }
    avanzar();
  };

  const colorBarra =
    strength.score >= 3 ? colors.brand[500] : strength.score === 2 ? colors.semantic.warning : colors.semantic.error;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.container, { paddingTop: insets.top + spacing.lg }]}>
        <View style={styles.topBar}>
          {stepIndex > 0 ? (
            <Pressable onPress={retroceder} hitSlop={16} accessibilityRole="button" accessibilityLabel="Atrás" style={styles.backButton}>
              <Ionicons name="chevron-back" size={24} color={colors.text.primary} />
            </Pressable>
          ) : (
            <View style={styles.backButton} />
          )}
          <Text style={styles.stepCounter}>
            Paso {stepIndex + 1} de {STEPS.length}
          </Text>
          <View style={styles.backButton} />
        </View>

        <View style={styles.progressBar}>
          {STEPS.map((s, i) => (
            <View key={s} style={[styles.progressSegment, i <= stepIndex && styles.progressSegmentActive]} />
          ))}
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollContent}
        >
          {step === 'email' && (
            <Animated.View entering={FadeInRight.duration(motion.duration.normal)} exiting={FadeOutLeft.duration(motion.duration.fast)}>
              <Text style={styles.heading}>Empezá con tu correo</Text>
              <Text style={styles.subheading}>Lo usamos para entrar y para avisarte de algo importante. Nada de publicidad.</Text>

              <TextInput
                style={styles.input}
                placeholder="tu@correo.com"
                placeholderTextColor={colors.text.muted}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                autoFocus
                returnKeyType="next"
                onSubmitEditing={continuar}
                accessibilityLabel="Correo electrónico"
              />
              {email.length > 0 && !emailValido && (
                <Text style={styles.warning}>Revisá el correo: falta la arroba o el dominio.</Text>
              )}
            </Animated.View>
          )}

          {step === 'password' && (
            <Animated.View entering={FadeInRight.duration(motion.duration.normal)} exiting={FadeOutLeft.duration(motion.duration.fast)}>
              <Text style={styles.heading}>Elegí una contraseña</Text>
              <Text style={styles.subheading}>
                El único requisito son {MIN_PASSWORD_LENGTH} caracteres. Lo de abajo son consejos, no reglas.
              </Text>

              <View style={styles.passwordRow}>
                <TextInput
                  style={[styles.input, styles.passwordInput]}
                  placeholder="Una frase que recuerdes"
                  placeholderTextColor={colors.text.muted}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!verPassword}
                  autoCapitalize="none"
                  autoFocus
                  returnKeyType="next"
                  onSubmitEditing={continuar}
                  accessibilityLabel="Contraseña"
                />
                <Pressable
                  onPress={() => setVerPassword((v) => !v)}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel={verPassword ? 'Ocultar la contraseña' : 'Mostrar la contraseña'}
                  style={styles.eyeButton}
                >
                  <Ionicons name={verPassword ? 'eye-off' : 'eye'} size={20} color={colors.text.secondary} />
                </Pressable>
              </View>

              {password.length > 0 && (
                <View style={styles.strengthBlock}>
                  <View style={styles.strengthBar}>
                    {[0, 1, 2, 3].map((i) => (
                      <View
                        key={i}
                        style={[
                          styles.strengthSegment,
                          { backgroundColor: i < strength.score ? colorBarra : colors.surface[400] },
                        ]}
                      />
                    ))}
                  </View>
                  <Text style={[styles.strengthLabel, { color: colorBarra }]}>{strength.label}</Text>
                  {strength.hint && <Text style={styles.hint}>{strength.hint}</Text>}
                </View>
              )}

              <View style={styles.requirements}>
                {strength.requirements.map((req) => (
                  <View key={req.id} style={styles.requirementRow}>
                    <Ionicons
                      name={req.met ? 'checkmark-circle' : 'ellipse-outline'}
                      size={16}
                      color={req.met ? colors.brand[500] : colors.text.muted}
                    />
                    <Text style={[styles.requirementText, req.met && styles.requirementTextMet]}>{req.label}</Text>
                  </View>
                ))}
              </View>
            </Animated.View>
          )}

          {step === 'name' && (
            <Animated.View entering={FadeInRight.duration(motion.duration.normal)} exiting={FadeOutLeft.duration(motion.duration.fast)}>
              <Text style={styles.heading}>¿Cómo te llamamos?</Text>
              <Text style={styles.subheading}>
                Es el nombre que verán otras personas en tus playlists públicas. Podés cambiarlo cuando quieras.
              </Text>

              <TextInput
                style={styles.input}
                placeholder="Tu nombre o tu alias"
                placeholderTextColor={colors.text.muted}
                value={displayName}
                onChangeText={setDisplayName}
                autoCapitalize="words"
                maxLength={50}
                autoFocus
                returnKeyType="next"
                onSubmitEditing={continuar}
                accessibilityLabel="Nombre"
              />
              <Text style={styles.counter}>{displayName.trim().length}/50 · mínimo 2 caracteres</Text>
            </Animated.View>
          )}

          {step === 'taste' && (
            <Animated.View entering={FadeInRight.duration(motion.duration.normal)} exiting={FadeOutLeft.duration(motion.duration.fast)}>
              <Text style={styles.heading}>¿Qué te gusta escuchar?</Text>
              <Text style={styles.subheading}>Elegí los que quieras para arrancar con recomendaciones. Podés saltar este paso.</Text>

              <View style={styles.genreGrid}>
                {genres.map((genero) => {
                  const activo = selected.includes(genero.label);
                  return (
                    <Animated.View key={genero.id} layout={LinearTransition.springify()}>
                      <Pressable
                        onPress={() => alternarGenero(genero.label)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: activo }}
                        style={[
                          styles.genreChip,
                          activo && { backgroundColor: `${genero.color}33`, borderColor: genero.color },
                        ]}
                      >
                        <View style={[styles.genreDot, { backgroundColor: genero.color }]} />
                        <Text style={[styles.genreText, activo && { color: genero.color }]}>{genero.label}</Text>
                        {/* El número sale del catálogo: deja elegir con
                            información real en vez de a ciegas. */}
                        <Text style={styles.genreCount}>{genero.trackCount}</Text>
                      </Pressable>
                    </Animated.View>
                  );
                })}
              </View>

              <Text style={styles.counter}>
                {selected.length === 0
                  ? 'Ninguno elegido — no pasa nada, se aprende de lo que escuches.'
                  : `${selected.length} elegido${selected.length === 1 ? '' : 's'}${selected.length >= MAX_GENRES ? ' (máximo)' : ''}`}
              </Text>
            </Animated.View>
          )}

          {step === 'terms' && (
            <Animated.View entering={FadeIn.duration(motion.duration.normal)}>
              <Text style={styles.heading}>Último paso</Text>
              <Text style={styles.subheading}>Un resumen de lo que aceptás. Los textos completos están a un toque.</Text>

              <View style={styles.legalLinks}>
                {[
                  { slug: 'terms', title: 'Términos de servicio', summary: 'Qué podés hacer, qué no, y qué pasa con la música que subís.' },
                  { slug: 'privacy', title: 'Política de privacidad', summary: 'Qué datos guardamos, para qué y cómo los borrás.' },
                ].map((doc) => (
                  <Pressable
                    key={doc.slug}
                    onPress={() => router.push(`/legal/${doc.slug}`)}
                    accessibilityRole="link"
                    style={styles.legalCard}
                  >
                    <View style={styles.legalCardHeader}>
                      <Text style={styles.legalCardTitle}>{doc.title}</Text>
                      <Ionicons name="chevron-forward" size={16} color={colors.text.secondary} />
                    </View>
                    <Text style={styles.legalCardSummary}>{doc.summary}</Text>
                  </Pressable>
                ))}
              </View>

              <Pressable
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setAceptaTerminos((v) => !v);
                }}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: aceptaTerminos }}
                accessibilityLabel="Acepto los términos de servicio y la política de privacidad"
                style={[styles.acceptRow, aceptaTerminos && styles.acceptRowChecked]}
              >
                <Ionicons
                  name={aceptaTerminos ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={aceptaTerminos ? colors.brand[500] : colors.text.secondary}
                />
                <View style={styles.acceptTextBlock}>
                  <Text style={styles.acceptText}>
                    He leído y acepto los términos de servicio y la política de privacidad de Peyma Music.
                  </Text>
                  <Text style={styles.acceptVersion}>versión {TERMS_VERSION}</Text>
                </View>
              </Pressable>

              {/* Se dice qué queda registrado: aceptar algo sin saber que
                  queda constancia es peor experiencia, no mejor. */}
              <Text style={styles.hint}>
                Al crear la cuenta guardamos la fecha y la versión que aceptaste. Si cambiamos los textos te lo pedimos
                otra vez.
              </Text>
            </Animated.View>
          )}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.xl }]}>
          {step === 'taste' && selected.length === 0 && (
            <Pressable onPress={avanzar} style={styles.skipButton} accessibilityRole="button">
              <Text style={styles.skipText}>Saltar</Text>
            </Pressable>
          )}
          <Button
            title={step === 'terms' ? 'Crear mi cuenta' : 'Continuar'}
            onPress={continuar}
            disabled={!puedeAvanzar || isSubmitting}
            loading={isSubmitting}
            fullWidth={!(step === 'taste' && selected.length === 0)}
            style={step === 'taste' && selected.length === 0 ? styles.continueButtonFlex : undefined}
          />
        </View>
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
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  stepCounter: {
    color: colors.text.secondary,
    fontFamily: typography.family.medium,
    fontSize: typography.size.sm,
  },
  progressBar: {
    flexDirection: 'row' as const,
    gap: spacing.xs,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },
  progressSegment: {
    flex: 1,
    height: 4,
    backgroundColor: colors.surface[400],
    borderRadius: 2,
  },
  progressSegmentActive: {
    backgroundColor: colors.brand[500],
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center' as const,
    paddingBottom: spacing.xl,
  },
  heading: {
    color: colors.text.primary,
    fontFamily: typography.family.bold,
    fontSize: typography.size['3xl'],
    marginBottom: spacing.sm,
  },
  subheading: {
    color: colors.text.secondary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.base,
    lineHeight: typography.lineHeight.base,
    marginBottom: spacing['2xl'],
  },
  input: {
    height: 52,
    backgroundColor: colors.surface[200],
    borderRadius: 10,
    paddingHorizontal: spacing.lg,
    color: colors.text.primary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.base,
  },
  passwordRow: {
    position: 'relative' as const,
    justifyContent: 'center' as const,
  },
  passwordInput: {
    paddingRight: 52,
  },
  eyeButton: {
    position: 'absolute' as const,
    right: 0,
    width: 52,
    height: 52,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  warning: {
    color: colors.semantic.warning,
    fontFamily: typography.family.medium,
    fontSize: typography.size.sm,
    marginTop: spacing.sm,
  },
  strengthBlock: {
    marginTop: spacing.lg,
  },
  strengthBar: {
    flexDirection: 'row' as const,
    gap: spacing.xs,
  },
  strengthSegment: {
    flex: 1,
    height: 6,
    borderRadius: 3,
  },
  strengthLabel: {
    fontFamily: typography.family.bold,
    fontSize: typography.size.sm,
    marginTop: spacing.sm,
  },
  hint: {
    color: colors.text.secondary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    marginTop: spacing.sm,
  },
  requirements: {
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
  requirementRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
  },
  requirementText: {
    color: colors.text.muted,
    fontFamily: typography.family.regular,
    fontSize: typography.size.sm,
    flex: 1,
  },
  requirementTextMet: {
    color: colors.text.primary,
  },
  counter: {
    color: colors.text.secondary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.sm,
    marginTop: spacing.md,
  },
  genreGrid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: spacing.sm,
  },
  genreChip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.surface[400],
    backgroundColor: colors.surface[200],
  },
  genreDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  genreText: {
    color: colors.text.primary,
    fontFamily: typography.family.bold,
    fontSize: typography.size.sm,
  },
  genreCount: {
    color: colors.text.muted,
    fontFamily: typography.family.regular,
    fontSize: typography.size.xs,
  },
  legalLinks: {
    gap: spacing.md,
  },
  legalCard: {
    backgroundColor: colors.surface[200],
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  legalCardHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  legalCardTitle: {
    color: colors.text.primary,
    fontFamily: typography.family.bold,
    fontSize: typography.size.base,
  },
  legalCardSummary: {
    color: colors.text.secondary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
  },
  acceptRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: spacing.md,
    marginTop: spacing.xl,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.surface[400],
  },
  acceptRowChecked: {
    borderColor: colors.brand[500],
  },
  acceptTextBlock: {
    flex: 1,
    gap: spacing.xs,
  },
  acceptText: {
    color: colors.text.primary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
  },
  acceptVersion: {
    color: colors.text.muted,
    fontFamily: typography.family.regular,
    fontSize: typography.size.xs,
  },
  footer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.md,
  },
  skipButton: {
    padding: spacing.sm,
  },
  skipText: {
    color: colors.text.secondary,
    fontFamily: typography.family.medium,
    fontSize: typography.size.base,
  },
  continueButtonFlex: {
    flex: 1,
  },
});
