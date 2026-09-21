import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, useThemedStyles, spacing, typography, type Theme } from '../theme';

interface AppBarAction {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  /** Para lectores de pantalla; un ícono solo no basta como etiqueta accesible. */
  accessibilityLabel?: string;
}

interface AppBarProps {
  title: string;
  leftAction?: AppBarAction;
  rightActions?: AppBarAction[];
  /** Fondo transparente para cabeceras que flotan sobre una imagen (hero). */
  transparent?: boolean;
}

export function AppBar({ title, leftAction, rightActions, transparent }: AppBarProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top + spacing.sm },
        transparent && styles.transparent,
      ]}
    >
      {leftAction ? (
        <Pressable
          onPress={leftAction.onPress}
          hitSlop={20}
          accessibilityRole="button"
          accessibilityLabel={leftAction.accessibilityLabel ?? 'Volver'}
          style={styles.sideButton}
        >
          <Ionicons name={leftAction.icon} size={26} color={colors.text.primary} />
        </Pressable>
      ) : (
        <View style={styles.sideButton} />
      )}

      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>

      <View style={[styles.sideButton, styles.rightContainer]}>
        {rightActions?.map((action) => (
          <Pressable
            key={action.icon}
            onPress={action.onPress}
            hitSlop={20}
            accessibilityRole="button"
            accessibilityLabel={action.accessibilityLabel ?? action.icon}
            style={styles.rightButton}
          >
            <Ionicons name={action.icon} size={22} color={colors.text.secondary} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const makeStyles = ({ colors }: Theme) => ({
  container: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface[50],
  },
  transparent: {
    backgroundColor: 'transparent',
  },
  title: {
    flex: 1,
    color: colors.text.primary,
    fontFamily: typography.family.bold,
    fontSize: typography.size.md,
    textAlign: 'center' as const,
    marginHorizontal: spacing.sm,
  },
  sideButton: {
    minWidth: 40,
    alignItems: 'flex-start' as const,
  },
  rightContainer: {
    flexDirection: 'row' as const,
    justifyContent: 'flex-end' as const,
    gap: spacing.md,
  },
  rightButton: {
    padding: 2,
  },
});
