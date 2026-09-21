import { Pressable, type ViewStyle, type StyleProp } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme, motion, radius } from '../theme';

interface IconButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  size?: number;
  color?: string;
  variant?: 'default' | 'filled' | 'ghost';
  disabled?: boolean;
  hitSlop?: number;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
  /** Desactiva la vibración táctil para acciones repetitivas (p. ej. arrastrar en la cola). */
  haptics?: boolean;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Botón de solo ícono con un área táctil mínima de 44×44 (accesibilidad). */
export function IconButton({
  icon,
  onPress,
  size = 24,
  color,
  variant = 'default',
  disabled,
  hitSlop = 12,
  accessibilityLabel,
  style,
  haptics = true,
}: IconButtonProps) {
  const { colors } = useTheme();
  const scale = useSharedValue(1);
  const iconColor = color ?? (variant === 'filled' ? colors.text.onBrand : colors.text.primary);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePress = () => {
    if (disabled) return;
    if (haptics) Haptics.selectionAsync().catch(() => {});
    onPress();
  };

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={() => {
        scale.value = withSpring(0.9, motion.spring.snappy);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, motion.spring.snappy);
      }}
      disabled={disabled}
      hitSlop={hitSlop}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      style={[
        {
          minWidth: 44,
          minHeight: 44,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: radius.full,
          backgroundColor: variant === 'filled' ? colors.brand[500] : 'transparent',
          opacity: disabled ? 0.4 : 1,
        },
        animatedStyle,
        style,
      ]}
    >
      <Ionicons name={icon} size={size} color={iconColor} />
    </AnimatedPressable>
  );
}
