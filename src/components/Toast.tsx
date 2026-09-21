/**
 * Peyma Music — Notificaciones efímeras
 *
 * `ToastHost` se monta una vez en la raíz y escucha `toastStore`; cualquier
 * parte de la app dispara un aviso con `toast.error('...')` sin necesidad de
 * pasar props ni contexto. Es la pieza central del manejo de errores no
 * bloqueante que pedía el spec original y que nunca llegó a conectarse.
 */
import { useEffect } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSequence,
  withDelay,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { useToastStore, type ToastVariant } from '../store/toastStore';
import { useTabBarHeight } from '../hooks/useTabBarHeight';

const ICON_BY_VARIANT: Record<ToastVariant, keyof typeof Ionicons.glyphMap> = {
  info: 'information-circle',
  success: 'checkmark-circle',
  error: 'alert-circle',
};

export function ToastHost() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useTabBarHeight();
  const current = useToastStore((s) => s.current);
  const dismissCurrent = useToastStore((s) => s.dismissCurrent);

  const progress = useSharedValue(0);

  useEffect(() => {
    if (!current) return;
    progress.value = 0;
    progress.value = withSequence(
      withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) }),
      withDelay(
        current.durationMs,
        withTiming(0, { duration: 220, easing: Easing.in(Easing.cubic) }, (finished) => {
          if (finished) runOnJS(dismissCurrent)();
        }),
      ),
    );
  }, [current, progress, dismissCurrent]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 24 }, { scale: 0.96 + progress.value * 0.04 }],
  }));

  if (!current) return null;

  const accent =
    current.variant === 'error'
      ? colors.semantic.error
      : current.variant === 'success'
        ? colors.semantic.success
        : colors.brand[500];

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.container,
        { bottom: tabBarHeight + insets.bottom + 76, backgroundColor: colors.surface[100] },
        animatedStyle,
      ]}
    >
      <Ionicons name={ICON_BY_VARIANT[current.variant]} size={20} color={accent} />
      <Text style={[styles.message, { color: colors.text.primary }]} numberOfLines={2}>
        {current.text}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    zIndex: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  message: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
  },
});
