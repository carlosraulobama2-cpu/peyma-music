import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme, useThemedStyles, spacing, typography, motion, radius, type Theme } from '../../theme';
import { getGreeting, getGreetingIcon } from '../../utils';

const GREETING_TINT: Record<ReturnType<typeof getGreetingIcon>, string> = {
  moon: '#8B93FF',
  'partly-sunny': '#FFB84D',
  sunny: '#FFD24D',
};

interface HomeHeaderProps {
  onPressProfile: () => void;
  onPressNotifications: () => void;
  hasUnreadNotifications: boolean;
}

/** Saludo dinámico según la hora local + accesos a perfil y notificaciones. */
export function HomeHeader({ onPressProfile, onPressNotifications, hasUnreadNotifications }: HomeHeaderProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const greetingIcon = getGreetingIcon();

  return (
    <Animated.View entering={FadeInDown.duration(motion.duration.normal)} style={styles.row}>
      <View style={styles.greetingRow}>
        <View style={[styles.greetingIconBadge, { backgroundColor: `${GREETING_TINT[greetingIcon]}26` }]}>
          <Ionicons name={greetingIcon} size={16} color={GREETING_TINT[greetingIcon]} />
        </View>
        <Text style={styles.greeting}>{getGreeting()}</Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={onPressNotifications}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Notificaciones"
          style={styles.iconButton}
        >
          <Ionicons name="notifications-outline" size={22} color={colors.text.primary} />
          {hasUnreadNotifications && <View style={styles.badge} />}
        </Pressable>

        <Pressable
          onPress={onPressProfile}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Perfil y ajustes"
          style={styles.iconButton}
        >
          <Ionicons name="person-circle-outline" size={24} color={colors.text.primary} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

const makeStyles = ({ colors }: Theme) => ({
  row: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  greetingRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    flexShrink: 1,
  },
  greetingIconBadge: {
    width: 30,
    height: 30,
    borderRadius: radius.full,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  greeting: {
    color: colors.text.primary,
    fontSize: typography.size['2xl'],
    fontFamily: typography.family.bold,
    flexShrink: 1,
  },
  actions: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.md,
  },
  iconButton: {
    position: 'relative' as const,
    width: 36,
    height: 36,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  badge: {
    position: 'absolute' as const,
    top: 4,
    right: 4,
    width: 9,
    height: 9,
    borderRadius: radius.full,
    backgroundColor: colors.semantic.error,
    borderWidth: 1.5,
    borderColor: colors.surface[50],
  },
});
