import { useState } from 'react';
import { View, Text, TextInput, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useAuthStore, toast } from '../src/store';
import { Button } from '../src/components';
import { useTheme, useThemedStyles, spacing, typography, motion, radius, type Theme } from '../src/theme';

const GENRES = [
  'Pop', 'Rock', 'Electrónica', 'Hip-Hop', 'Jazz', 'Clásica',
  'Reggaetón', 'Salsa', 'Banda', 'Folk', 'Indie', 'Metal',
  'R&B', 'Country', 'Funk', 'Techno', 'Drum & Bass', 'Ambient',
  'Blues', 'World',
];

export default function OnboardingScreen() {
  const [step, setStep] = useState<0 | 1>(0);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const register = useAuthStore((s) => s.register);
  const isSubmitting = useAuthStore((s) => s.isSubmitting);

  const toggleGenre = (genre: string) => {
    Haptics.selectionAsync().catch(() => {});
    setSelectedGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre],
    );
  };

  const finishOnboarding = async () => {
    try {
      await register(email.trim(), password, displayName.trim(), selectedGenres);
      router.replace('/(tabs)');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo continuar.');
    }
  };

  const canContinueFromAccountStep =
    displayName.trim().length >= 2 && /^\S+@\S+\.\S+$/.test(email.trim()) && password.length >= 8;

  const handleContinue = () => {
    if (step === 0) {
      if (!canContinueFromAccountStep) {
        toast.error('Completa tu nombre, correo y una contraseña de al menos 8 caracteres.');
        return;
      }
      setStep(1);
      return;
    }
    finishOnboarding();
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.lg }]}>
      <View style={styles.progressBar}>
        <View style={[styles.progressDot, step === 0 && styles.progressDotActive]} />
        <View style={[styles.progressDot, step === 1 && styles.progressDotActive]} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {step === 0 ? (
          <Animated.View entering={FadeIn.duration(motion.duration.normal)}>
            <Text style={styles.heading}>Bienvenido a Peyma Music</Text>
            <Text style={styles.subheading}>
              Crea tu cuenta para empezar a escuchar, con sonidos curados especialmente para ti.
            </Text>

            <View style={styles.form}>
              <TextInput
                style={styles.input}
                placeholder="Tu nombre"
                placeholderTextColor={colors.text.muted}
                value={displayName}
                onChangeText={setDisplayName}
                autoCapitalize="words"
                returnKeyType="next"
                accessibilityLabel="Nombre"
              />
              <TextInput
                style={styles.input}
                placeholder="tu@email.com"
                placeholderTextColor={colors.text.muted}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                returnKeyType="next"
                accessibilityLabel="Correo electrónico"
              />
              <TextInput
                style={styles.input}
                placeholder="Contraseña (mínimo 8 caracteres)"
                placeholderTextColor={colors.text.muted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                returnKeyType="done"
                onSubmitEditing={handleContinue}
                accessibilityLabel="Contraseña"
              />
            </View>
          </Animated.View>
        ) : (
          <Animated.View entering={FadeIn.duration(motion.duration.normal)}>
            <Text style={styles.heading}>¿Qué te gusta escuchar?</Text>
            <Text style={styles.subheading}>Selecciona algunos géneros para personalizar tu experiencia.</Text>

            <View style={styles.genreGrid}>
              {GENRES.map((genre) => {
                const isSelected = selectedGenres.includes(genre);
                return (
                  <Animated.View key={genre} layout={LinearTransition.springify()}>
                    <Pressable
                      onPress={() => toggleGenre(genre)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: isSelected }}
                      style={[styles.genreChip, isSelected && styles.genreChipSelected]}
                    >
                      <Text style={[styles.genreText, isSelected && styles.genreTextSelected]}>{genre}</Text>
                    </Pressable>
                  </Animated.View>
                );
              })}
            </View>
          </Animated.View>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.xl }]}>
        {step === 1 && (
          <Pressable onPress={finishOnboarding} style={styles.skipButton} accessibilityRole="button">
            <Text style={styles.skipText}>Saltar</Text>
          </Pressable>
        )}
        <Button
          title={step === 0 ? 'Continuar' : 'Terminar'}
          onPress={handleContinue}
          disabled={step === 0 ? !canContinueFromAccountStep : isSubmitting}
          loading={isSubmitting}
          fullWidth={step === 0}
          style={step === 1 ? styles.continueButtonFlex : undefined}
        />
      </View>
    </View>
  );
}

const makeStyles = ({ colors }: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: colors.surface[50],
    paddingHorizontal: spacing.lg,
  },
  progressBar: {
    flexDirection: 'row' as const,
    gap: spacing.sm,
    paddingBottom: spacing.xl,
  },
  progressDot: {
    flex: 1,
    height: 4,
    backgroundColor: colors.surface[400],
    borderRadius: 2,
  },
  progressDotActive: {
    backgroundColor: colors.brand[500],
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center' as const,
  },
  heading: {
    color: colors.text.primary,
    fontFamily: typography.family.bold,
    fontSize: typography.size['3xl'],
    marginBottom: spacing.lg,
    textAlign: 'center' as const,
  },
  subheading: {
    color: colors.text.secondary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.base,
    textAlign: 'center' as const,
    lineHeight: typography.lineHeight.base,
  },
  form: {
    marginTop: spacing['2xl'],
    gap: spacing.md,
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
  genreGrid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: spacing.sm,
    justifyContent: 'center' as const,
    marginTop: spacing['3xl'],
  },
  genreChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.full,
    backgroundColor: colors.surface[300],
  },
  genreChipSelected: {
    backgroundColor: colors.brand[500],
  },
  genreText: {
    color: colors.text.primary,
    fontFamily: typography.family.medium,
    fontSize: typography.size.sm,
  },
  genreTextSelected: {
    color: colors.text.onBrand,
  },
  footer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
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
