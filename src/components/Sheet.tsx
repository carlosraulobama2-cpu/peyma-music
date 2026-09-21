import { useEffect, type ReactNode } from 'react';
import { Modal, Pressable, View, type ViewStyle, type StyleProp } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSpring,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemedStyles, radius, spacing, motion, type Theme } from '../theme';

interface SheetProps {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

const DISMISS_DRAG_THRESHOLD = 100;

/**
 * Bottom sheet reutilizable: fondo con fundido, tarjeta que entra deslizando
 * desde abajo y se puede cerrar arrastrándola hacia abajo o tocando el fondo.
 * Es la base de `TrackOptionsSheet` y `AddToPlaylistSheet`.
 */
export function Sheet({ visible, onClose, children, style }: SheetProps) {
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const progress = useSharedValue(0);
  const dragY = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(visible ? 1 : 0, {
      duration: motion.duration.normal,
      easing: Easing.out(Easing.cubic),
    });
    if (visible) dragY.value = 0;
  }, [visible, progress, dragY]);

  const pan = Gesture.Pan()
    .onUpdate((event) => {
      dragY.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      if (event.translationY > DISMISS_DRAG_THRESHOLD || event.velocityY > 800) {
        runOnJS(onClose)();
      } else {
        dragY.value = withSpring(0, motion.spring.smooth);
      }
    });

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value * 0.6 }));
  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: (1 - progress.value) * 400 + dragY.value },
    ],
  }));

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.flex} onPress={onClose} accessibilityLabel="Cerrar">
        <Animated.View style={[styles.backdrop, backdropStyle]} />
      </Pressable>
      <GestureDetector gesture={pan}>
        <Animated.View
          style={[
            styles.card,
            { paddingBottom: insets.bottom + spacing.lg },
            cardStyle,
            style,
          ]}
        >
          <View style={styles.handle} />
          {children}
        </Animated.View>
      </GestureDetector>
    </Modal>
  );
}

const makeStyles = ({ colors }: Theme) => ({
  flex: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  backdrop: {
    flex: 1,
    backgroundColor: '#000',
  },
  card: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface[100],
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  handle: {
    alignSelf: 'center' as const,
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surface[500],
    marginBottom: spacing.md,
  },
});
