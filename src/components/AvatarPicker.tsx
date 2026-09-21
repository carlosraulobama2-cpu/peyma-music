import { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, ActionSheetIOS, Platform } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Sheet } from './Sheet';
import { toast } from '../store';
import { takePhoto, pickFromLibrary, uploadAvatar, PermissionDeniedError } from '../services/avatarUpload';
import { useTheme, useThemedStyles, spacing, typography, radius, type Theme } from '../theme';

/**
 * Foto de perfil con selector nativo.
 *
 * Al pulsar ofrece dos caminos, cámara o galería, y nada más: antes había
 * que pegar la URL de una imagen ya publicada en internet, que en la
 * práctica significaba que casi nadie ponía foto.
 *
 * En iOS se usa el `ActionSheetIOS` del sistema en vez de un pliego propio.
 * Merece la pena la rama extra: es el gesto que la gente ya conoce de todas
 * las demás apps, y respeta solo el tema y la accesibilidad del teléfono.
 * En Android no existe equivalente nativo, así que ahí sí va nuestro pliego.
 */

interface AvatarPickerProps {
  /** Foto actual, o `null` si todavía no tiene. */
  avatarUrl: string | null;
  /** Iniciales de reserva mientras no hay foto. */
  initials: string;
  size?: number;
  /** Se llama con la URL nueva cuando la subida terminó bien. */
  onUploaded: (url: string) => void;
}

export function AvatarPicker({ avatarUrl, initials, size = 96, onUploaded }: AvatarPickerProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [isSheetOpen, setSheetOpen] = useState(false);
  const [isWorking, setWorking] = useState(false);

  const run = async (source: 'camera' | 'library') => {
    setSheetOpen(false);
    try {
      const picked = source === 'camera' ? await takePhoto() : await pickFromLibrary();
      // `null` = el usuario cerró el selector. No es un error y no se avisa.
      if (!picked) return;

      setWorking(true);
      const url = await uploadAvatar(picked);
      onUploaded(url);
      toast.success('Foto de perfil actualizada');
    } catch (error) {
      if (error instanceof PermissionDeniedError) {
        toast.error(error.message);
      } else {
        toast.error(error instanceof Error ? error.message : 'No se pudo cambiar la foto.');
      }
    } finally {
      setWorking(false);
    }
  };

  const open = () => {
    if (isWorking) return;

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: 'Foto de perfil',
          options: ['Cancelar', 'Tomar una foto', 'Elegir de la galería'],
          cancelButtonIndex: 0,
        },
        (index) => {
          if (index === 1) void run('camera');
          if (index === 2) void run('library');
        },
      );
      return;
    }

    setSheetOpen(true);
  };

  return (
    <>
      <Pressable
        onPress={open}
        disabled={isWorking}
        accessibilityRole="button"
        accessibilityLabel="Cambiar foto de perfil"
        style={[styles.wrapper, { width: size, height: size, borderRadius: size / 2 }]}
      >
        {avatarUrl ? (
          <Image source={avatarUrl} style={styles.image} contentFit="cover" transition={200} />
        ) : (
          <View style={styles.fallback}>
            <Text style={[styles.initials, { fontSize: size / 3 }]}>{initials}</Text>
          </View>
        )}

        {/* Insignia de cámara: sin ella no hay nada que sugiera que la foto se puede tocar. */}
        <View style={styles.badge}>
          <Ionicons name="camera" size={14} color={colors.text.onBrand} />
        </View>

        {isWorking && (
          <View style={[styles.working, { borderRadius: size / 2 }]}>
            <ActivityIndicator color={colors.text.primary} />
          </View>
        )}
      </Pressable>

      <Sheet visible={isSheetOpen} onClose={() => setSheetOpen(false)}>
        <Text style={styles.sheetTitle}>Foto de perfil</Text>

        <Pressable
          onPress={() => void run('camera')}
          style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
          accessibilityRole="button"
        >
          <Ionicons name="camera-outline" size={22} color={colors.text.primary} />
          <Text style={styles.optionLabel}>Tomar una foto</Text>
        </Pressable>

        <Pressable
          onPress={() => void run('library')}
          style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
          accessibilityRole="button"
        >
          <Ionicons name="images-outline" size={22} color={colors.text.primary} />
          <Text style={styles.optionLabel}>Elegir de la galería</Text>
        </Pressable>
      </Sheet>
    </>
  );
}

const makeStyles = ({ colors }: Theme) => ({
  wrapper: {
    overflow: 'hidden' as const,
    backgroundColor: colors.surface[300],
  },
  image: {
    width: '100%' as const,
    height: '100%' as const,
  },
  fallback: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: colors.brand[500],
  },
  initials: {
    color: colors.text.onBrand,
    fontFamily: typography.family.bold,
  },
  badge: {
    position: 'absolute' as const,
    right: 0,
    bottom: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: colors.brand[500],
    borderWidth: 2,
    borderColor: colors.surface[50],
  },
  working: {
    position: 'absolute' as const,
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheetTitle: {
    color: colors.text.primary,
    fontFamily: typography.family.bold,
    fontSize: typography.size.lg,
    marginBottom: spacing.lg,
  },
  option: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  optionPressed: {
    backgroundColor: colors.surface[200],
  },
  optionLabel: {
    color: colors.text.primary,
    fontFamily: typography.family.medium,
    fontSize: typography.size.base,
  },
});
