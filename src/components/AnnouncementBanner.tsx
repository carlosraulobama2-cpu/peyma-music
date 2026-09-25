import { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../services';
import { useTheme, useThemedStyles, spacing, typography, radius, type Theme } from '../theme';

const DISMISSED_KEY = 'peyma-announcement-dismissed';

/**
 * Franja informativa, configurable desde el panel (Ajustes → Anuncio) sin
 * publicar una nueva versión de la app — a diferencia de `MaintenanceOverlay`,
 * NO bloquea nada: es para "hay una función nueva", no para cortar la app.
 *
 * Se recuerda cerrada por MENSAJE, no en general: si el admin cambia el
 * texto, es un aviso distinto y merece mostrarse de nuevo aunque el
 * anterior ya se haya cerrado.
 */
export function AnnouncementBanner() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getAnnouncement()
      .then(async (res) => {
        if (cancelled || !res.enabled) return;
        const dismissed = await AsyncStorage.getItem(DISMISSED_KEY);
        if (!cancelled && dismissed !== res.message) setMessage(res.message);
      })
      .catch(() => {
        // Un anuncio que no cargó no es un error que deba interrumpir nada.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!message) return null;

  const dismiss = () => {
    AsyncStorage.setItem(DISMISSED_KEY, message).catch(() => {});
    setMessage(null);
  };

  return (
    <View style={styles.banner}>
      <Ionicons name="megaphone-outline" size={16} color={colors.brand[500]} />
      <Text style={styles.text} numberOfLines={3}>
        {message}
      </Text>
      <Pressable onPress={dismiss} hitSlop={12} accessibilityRole="button" accessibilityLabel="Cerrar aviso">
        <Ionicons name="close" size={16} color={colors.text.secondary} />
      </Pressable>
    </View>
  );
}

const makeStyles = ({ colors }: Theme) => ({
  banner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    backgroundColor: colors.brand[500] + '26',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  text: {
    flex: 1,
    color: colors.text.primary,
    fontFamily: typography.family.medium,
    fontSize: typography.size.xs,
  },
});
