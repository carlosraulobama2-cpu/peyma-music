import type { ReactNode } from 'react';
import { Text, Pressable, ActivityIndicator, type ViewStyle, type StyleProp, type TextStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useThemedStyles, motion, radius, spacing, typography, type Theme } from '../theme';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: ReactNode;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  fullWidth,
  style,
  textStyle,
}: ButtonProps) {
  const styles = useThemedStyles(makeStyles);
  const scale = useSharedValue(1);
  const isDisabled = disabled || loading;

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePress = () => {
    if (isDisabled) return;
    Haptics.selectionAsync().catch(() => {});
    onPress();
  };

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={() => {
        scale.value = withSpring(0.96, motion.spring.snappy);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, motion.spring.snappy);
      }}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={[
        styles.base,
        styles[variant],
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
        animatedStyle,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' ? styles.primaryText.color : styles.outlineText.color}
        />
      ) : (
        <>
          {icon}
          <Text style={[styles.baseText, styles[`${variant}Text` as const], icon ? styles.textWithIcon : null, textStyle]}>
            {title}
          </Text>
        </>
      )}
    </AnimatedPressable>
  );
}

const makeStyles = ({ colors }: Theme) => ({
  base: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing['2xl'],
    borderRadius: radius.full,
    gap: spacing.sm,
    minHeight: 52,
  },
  fullWidth: {
    alignSelf: 'stretch' as const,
  },
  baseText: {
    fontFamily: typography.family.semibold,
    fontSize: typography.size.base,
  },
  primary: {
    backgroundColor: colors.brand[500],
  },
  primaryText: {
    color: colors.text.onBrand,
  },
  secondary: {
    backgroundColor: colors.surface[300],
  },
  secondaryText: {
    color: colors.text.primary,
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.surface[400],
  },
  outlineText: {
    color: colors.text.primary,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  ghostText: {
    color: colors.brand[500],
  },
  disabled: {
    opacity: 0.5,
  },
  textWithIcon: {
    marginLeft: spacing.xs,
  },
});
