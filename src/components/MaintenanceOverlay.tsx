import { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { onMaintenance } from '../services/httpClient';
import { useTheme, useThemedStyles, spacing, typography, radius, type Theme } from '../theme';

/**
 * Pantalla bloqueante de mantenimiento.
 *
 * Se monta una vez en la raíz y escucha al cliente HTTP: cuando CUALQUIER
 * petición devuelve 503 con `maintenance_mode`, cubre la app entera. Así
 * ninguna pantalla tiene que comprobarlo por su cuenta ni sondear un
 * endpoint "por si acaso".
 *
 * Reintenta sola cada 30 s. Dejar al usuario cerrando y abriendo la app
 * sería cargarle a él la tarea de adivinar cuándo volvimos.
 */

const RETRY_MS = 30_000;
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? '';

export function MaintenanceOverlay() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [message, setMessage] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => onMaintenance(setMessage), []);

  useEffect(() => {
    if (!message) return;

    let cancelled = false;

    const check = async () => {
      setChecking(true);
      try {
        const response = await fetch(`${API_URL}/home`);
        // Cualquier cosa que no sea 503 significa que ya volvimos.
        if (!cancelled && response.status !== 503) setMessage(null);
      } catch {
        // Sigue sin responder; se reintenta en el próximo ciclo.
      } finally {
        if (!cancelled) setChecking(false);
      }
    };

    const timer = setInterval(check, RETRY_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [message]);

  if (!message) return null;

  return (
    <View style={styles.overlay}>
      <View style={styles.iconCircle}>
        <Ionicons name="construct-outline" size={30} color={colors.brand[500]} />
      </View>
      <Text style={styles.title}>Estamos en mantenimiento</Text>
      <Text style={styles.body}>{message}</Text>

      {checking ? (
        <ActivityIndicator color={colors.text.secondary} style={styles.spinner} />
      ) : (
        <Text style={styles.hint}>Volvemos a comprobarlo cada 30 segundos.</Text>
      )}

      <Pressable onPress={() => setMessage(null)} style={styles.button} accessibilityRole="button">
        <Text style={styles.buttonLabel}>Reintentar ahora</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = ({ colors }: Theme) => ({
  overlay: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2000,
    backgroundColor: colors.surface[50],
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: colors.surface[200],
  },
  title: {
    color: colors.text.primary,
    fontFamily: typography.family.bold,
    fontSize: typography.size.xl,
    textAlign: 'center' as const,
  },
  body: {
    color: colors.text.secondary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.base,
    textAlign: 'center' as const,
    lineHeight: 21,
  },
  hint: {
    color: colors.text.secondary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.xs,
  },
  spinner: {
    marginVertical: spacing.xs,
  },
  button: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.full,
    backgroundColor: colors.brand[500],
  },
  buttonLabel: {
    color: colors.text.onBrand,
    fontFamily: typography.family.bold,
    fontSize: typography.size.base,
  },
});
