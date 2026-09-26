import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { setLocationConsent } from '../services';
import { useAuthStore, useToastStore } from '../store';
import { useTheme, useThemedStyles, spacing, typography, radius, type Theme } from '../theme';

/**
 * Pide permiso para compartir la zona aproximada.
 *
 * Sólo se muestra a quien todavía no ha decidido. A quien dijo que no no se
 * le vuelve a preguntar: insistir es lo que convierte una petición de
 * permiso en acoso, y en iOS un rechazo del sistema no se puede volver a
 * pedir desde la app.
 *
 * Dice qué se guarda, para qué y que es revocable, antes de disparar el
 * diálogo nativo. Ese orden importa.
 */
export function LocationConsentCard() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const user = useAuthStore((s) => s.user);
  const showToast = useToastStore((s) => s.show);

  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);

  const shouldAsk = user?.locationConsent === 'NOT_ASKED';

  if (!shouldAsk || dismissed) return null;

  const decide = async (value: 'GRANTED' | 'DENIED') => {
    setBusy(true);
    try {
      const { gotCoords } = await setLocationConsent(value);
      if (value === 'GRANTED') {
        showToast(
          gotCoords ? 'Gracias, ya apareces en el mapa de oyentes.' : 'Guardamos tu permiso, pero el sistema no dio la ubicación.',
          'success',
        );
      }
    } catch {
      showToast('No se pudo guardar tu elección. Probá más tarde.', 'error');
    } finally {
      setBusy(false);
      setDismissed(true);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="location-outline" size={18} color={colors.text.primary} />
        <Text style={styles.title}>¿Nos dejás ver desde dónde escuchás?</Text>
      </View>
      <Text style={styles.body}>
        Guardaríamos sólo la zona aproximada (unos 11 km a la redonda), nunca tu dirección ni tu recorrido. Sirve para
        el mapa de oyentes que ven los artistas. Podés cambiar de opinión cuando quieras, y al hacerlo borramos lo
        guardado.
      </Text>
      <View style={styles.actions}>
        <Pressable onPress={() => decide('DENIED')} disabled={busy} style={styles.secondary} accessibilityRole="button">
          <Text style={styles.secondaryLabel}>No, gracias</Text>
        </Pressable>
        <Pressable onPress={() => decide('GRANTED')} disabled={busy} style={styles.primary} accessibilityRole="button">
          <Text style={styles.primaryLabel}>Sí, compartir mi zona</Text>
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = ({ colors }: Theme) => ({
  card: {
    backgroundColor: colors.surface[200],
    borderRadius: radius.md,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.lg,
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  title: {
    color: colors.text.primary,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.base,
    flex: 1,
  },
  body: {
    color: colors.text.secondary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.sm,
    lineHeight: 19,
  },
  actions: {
    flexDirection: 'row' as const,
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  secondary: {
    flex: 1,
    alignItems: 'center' as const,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.surface[300],
  },
  secondaryLabel: {
    color: colors.text.primary,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.sm,
  },
  primary: {
    flex: 1,
    alignItems: 'center' as const,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.brand[500],
  },
  primaryLabel: {
    color: colors.text.onBrand,
    fontFamily: typography.family.bold,
    fontSize: typography.size.sm,
  },
});
