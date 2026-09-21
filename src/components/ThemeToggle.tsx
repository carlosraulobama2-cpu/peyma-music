import { View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useThemeStore, type ThemePreference } from '../store/themeStore';
import { useTheme, useThemedStyles, radius, spacing, type Theme } from '../theme';

const OPTIONS: { value: ThemePreference; icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { value: 'system', icon: 'phone-portrait-outline', label: 'Automático' },
  { value: 'light', icon: 'sunny', label: 'Claro' },
  { value: 'dark', icon: 'moon', label: 'Oscuro' },
];

/** Selector segmentado: sistema / claro / oscuro, con transición animada del indicador. */
export function ThemeToggle() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const preference = useThemeStore((s) => s.preference);
  const setPreference = useThemeStore((s) => s.setPreference);

  const activeIndex = OPTIONS.findIndex((o) => o.value === preference);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: withTiming(activeIndex * 36, { duration: 220 }) }],
  }));

  return (
    <View style={styles.container} accessibilityRole="tablist">
      <Animated.View style={[styles.indicator, indicatorStyle]} />
      {OPTIONS.map((option) => {
        const isActive = option.value === preference;
        return (
          <Pressable
            key={option.value}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              setPreference(option.value);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={option.label}
            style={styles.option}
          >
            <Ionicons
              name={option.icon}
              size={16}
              color={isActive ? colors.text.onBrand : colors.text.secondary}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = ({ colors }: Theme) => ({
  container: {
    flexDirection: 'row' as const,
    backgroundColor: colors.surface[300],
    borderRadius: radius.full,
    padding: spacing.xs,
    position: 'relative' as const,
  },
  indicator: {
    position: 'absolute' as const,
    top: spacing.xs,
    left: spacing.xs,
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.brand[500],
  },
  option: {
    width: 32,
    height: 32,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
});
