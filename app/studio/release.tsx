import { useState } from 'react';
import { View, Text, TextInput, ScrollView, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useArtistStore, toast } from '../../src/store';
import {
  uploadTrack,
  UPLOAD_STEPS,
  describeAudioRejection,
  resolveAudioType,
  type LocalFile,
  type UploadStep,
} from '../../src/services';
import { AppBar, Button } from '../../src/components';
import { useTheme, useThemedStyles, spacing, typography, radius, type Theme } from '../../src/theme';

export default function ReleaseTrackScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const profile = useArtistStore((s) => s.profile);

  const [title, setTitle] = useState('');
  const [audioAsset, setAudioAsset] = useState<LocalFile | null>(null);
  const [coverAsset, setCoverAsset] = useState<LocalFile | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  /** Paso actual del pipeline; null cuando no hay subida en curso. */
  const [step, setStep] = useState<UploadStep | null>(null);

  const handlePickAudio = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;

    // El selector enseña todo lo que el teléfono considera audio, que es más
    // de lo que acepta el servidor. Se dice aquí, al elegirlo, y no después
    // de haber empezado a subir un archivo que iba a ser rechazado.
    const rechazo = describeAudioRejection(asset.name, asset.mimeType, asset.size);
    if (rechazo) {
      toast.error(rechazo);
      return;
    }

    setAudioAsset({
      uri: asset.uri,
      name: asset.name,
      mimeType: resolveAudioType(asset.name, asset.mimeType),
    });
    if (!title.trim()) setTitle(asset.name.replace(/\.[^/.]+$/, ''));
    Haptics.selectionAsync().catch(() => {});
  };

  const handlePickCover = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      // Cuadrada: es como se muestra en todas las tarjetas, y recortarla
      // aquí evita que el usuario vea su portada deformada después.
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;

    setCoverAsset({
      uri: asset.uri,
      name: asset.fileName ?? 'portada.jpg',
      mimeType: asset.mimeType ?? 'image/jpeg',
    });
    Haptics.selectionAsync().catch(() => {});
  };

  const handlePublish = async () => {
    if (!profile) return;
    if (!title.trim()) {
      toast.error('Ponle un título a la canción.');
      return;
    }
    if (!audioAsset) {
      toast.error('Selecciona un archivo de audio.');
      return;
    }

    if (!coverAsset) {
      toast.error('Elige una portada para la canción.');
      return;
    }

    setIsPublishing(true);
    try {
      // Sube DE VERDAD, por el mismo pipeline que el panel. Antes esto
      // escribía en un store local y la canción nunca salía del teléfono.
      await uploadTrack({
        artistId: profile.id,
        title: title.trim(),
        audio: audioAsset,
        cover: coverAsset,
        onStep: setStep,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast.success('Tu canción se envió a revisión. Te avisamos cuando se apruebe.');
      router.back();
    } catch (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      toast.error(error instanceof Error ? error.message : 'No se pudo subir la canción.');
    } finally {
      setIsPublishing(false);
      setStep(null);
    }
  };

  return (
    <View style={styles.container}>
      <AppBar title="Publicar canción" leftAction={{ icon: 'chevron-back', onPress: () => router.back() }} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing['4xl'] }]}>
        <Pressable onPress={handlePickAudio} style={styles.picker} accessibilityRole="button" accessibilityLabel="Elegir archivo de audio">
          {audioAsset ? (
            <>
              <Ionicons name="musical-note" size={28} color={colors.brand[500]} />
              <Text style={styles.pickerFileName} numberOfLines={1}>{audioAsset.name}</Text>
              <Text style={styles.pickerHint}>Toca para cambiar el archivo</Text>
            </>
          ) : (
            <>
              <Ionicons name="cloud-upload-outline" size={32} color={colors.text.secondary} />
              <Text style={styles.pickerHint}>Toca para elegir un audio de tu dispositivo</Text>
            </>
          )}
        </Pressable>

        <Pressable onPress={handlePickCover} style={styles.picker} accessibilityRole="button" accessibilityLabel="Elegir portada">
          {coverAsset ? (
            <>
              <Image source={coverAsset.uri} style={styles.coverPreview} contentFit="cover" />
              <Text style={styles.pickerHint}>Toca para cambiar la portada</Text>
            </>
          ) : (
            <>
              <Ionicons name="image-outline" size={32} color={colors.text.secondary} />
              <Text style={styles.pickerHint}>Toca para elegir la portada</Text>
            </>
          )}
        </Pressable>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Título de la canción</Text>
          <TextInput
            style={styles.input}
            placeholder="Nombre de tu canción"
            placeholderTextColor={colors.text.muted}
            value={title}
            onChangeText={setTitle}
          />
        </View>

        <View style={styles.previewRow}>
          <Image source={profile?.imageUrl} style={styles.previewCover} contentFit="cover" />
          <View style={styles.previewInfo}>
            <Text style={styles.previewTitle} numberOfLines={1}>{title || 'Título de la canción'}</Text>
            <Text style={styles.previewArtist} numberOfLines={1}>{profile?.name}</Text>
          </View>
        </View>

        {step !== null && (
          <View style={styles.steps}>
            {UPLOAD_STEPS.map((label, index) => (
              <Text
                key={label}
                style={[
                  styles.stepLabel,
                  index < step && styles.stepDone,
                  index === step && styles.stepCurrent,
                ]}
              >
                {index < step ? '✓' : index === step ? '→' : '·'} {label}
              </Text>
            ))}
          </View>
        )}

        <Button
          title="Enviar a revisión"
          onPress={handlePublish}
          loading={isPublishing}
          disabled={isPublishing}
          fullWidth
          style={styles.publishButton}
        />
      </ScrollView>
    </View>
  );
}

const makeStyles = ({ colors }: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: colors.surface[50],
  },
  content: {
    paddingHorizontal: spacing.lg,
  },
  picker: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: spacing.sm,
    paddingVertical: spacing['2xl'],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed' as const,
    borderColor: colors.surface[500],
    marginBottom: spacing.xl,
  },
  coverPreview: {
    width: 96,
    height: 96,
    borderRadius: radius.md,
  },
  steps: {
    gap: 4,
    marginBottom: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface[200],
  },
  stepLabel: {
    color: colors.text.muted,
    fontFamily: typography.family.regular,
    fontSize: typography.size.sm,
  },
  stepDone: {
    color: colors.brand[500],
  },
  stepCurrent: {
    color: colors.text.primary,
    fontFamily: typography.family.semibold,
  },
  pickerFileName: {
    color: colors.text.primary,
    fontFamily: typography.family.medium,
    fontSize: typography.size.sm,
    maxWidth: '80%' as const,
  },
  pickerHint: {
    color: colors.text.secondary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.xs,
    textAlign: 'center' as const,
  },
  inputGroup: {
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  label: {
    color: colors.text.secondary,
    fontFamily: typography.family.medium,
    fontSize: typography.size.sm,
  },
  input: {
    height: 52,
    backgroundColor: colors.surface[200],
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    color: colors.text.primary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.base,
  },
  previewRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.md,
    marginBottom: spacing['2xl'],
  },
  previewCover: {
    width: 52,
    height: 52,
    borderRadius: radius.sm,
    backgroundColor: colors.surface[300],
  },
  previewInfo: {
    flex: 1,
  },
  previewTitle: {
    color: colors.text.primary,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.base,
  },
  previewArtist: {
    color: colors.text.secondary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.sm,
  },
  publishButton: {
    marginTop: spacing.sm,
  },
});
