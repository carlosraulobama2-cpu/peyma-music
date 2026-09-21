import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Button } from './Button';
import { useThemedStyles, motion, spacing, typography, type Theme } from '../theme';

interface EmptyStateProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * Estado vacío/error consistente para toda la app. Antes cada pantalla
 * repetía su propia versión (a veces con solo texto, sin ícono ni acción) —
 * el spec pedía "empty states ilustrados, no solo texto".
 */
export function EmptyState({ icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  const styles = useThemedStyles(makeStyles);

  return (
    <Animated.View entering={FadeIn.duration(motion.duration.normal)} style={styles.container}>
      <View style={styles.iconCircle}>
        <Ionicons name={icon} size={40} color={styles.icon.color} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {description && <Text style={styles.description}>{description}</Text>}
      {actionLabel && onAction && (
        <Button title={actionLabel} onPress={onAction} variant="secondary" style={styles.action} />
      )}
    </Animated.View>
  );
}

const makeStyles = ({ colors }: Theme) => ({
  container: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: spacing['3xl'],
    paddingVertical: spacing['4xl'],
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: colors.surface[200],
    marginBottom: spacing.xl,
  },
  icon: {
    color: colors.text.muted,
  },
  title: {
    color: colors.text.primary,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.lg,
    textAlign: 'center' as const,
    marginBottom: spacing.sm,
  },
  description: {
    color: colors.text.secondary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.sm,
    textAlign: 'center' as const,
    lineHeight: typography.lineHeight.sm,
  },
  action: {
    marginTop: spacing.xl,
  },
});
