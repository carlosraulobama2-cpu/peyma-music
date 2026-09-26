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
  uploadRelease,
  UPLOAD_STEPS,
  CREDIT_ROLE_LABEL,
  describeAudioRejection,
  resolveAudioType,
  type LocalFile,
  type UploadStep,
  type CreditDraft,
  type CreditRole,
} from '../../src/services';
import { AppBar, Button } from '../../src/components';
import { useTheme, useThemedStyles, spacing, typography, radius, type Theme } from '../../src/theme';

type ReleaseType = 'SINGLE' | 'EP' | 'ALBUM';

const RELEASE_TYPE_LABEL: Record<ReleaseType, string> = {
  SINGLE: 'Sencillo',
  EP: 'EP',
  ALBUM: 'Álbum',
};

/** Roles más comunes primero — el resto queda a un toque en el selector. */
const CREDIT_ROLES: CreditRole[] = [
  'FEATURED_ARTIST',
  'PRODUCER',
  'COMPOSER',
  'WRITER',
  'REMIXER',
  'MIX_ENGINEER',
  'MASTERING_ENGINEER',
];

interface TrackSlot {
  key: string;
  title: string;
  audio: LocalFile | null;
}

function newSlot(): TrackSlot {
  return { key: `${Date.now()}-${Math.random()}`, title: '', audio: null };
}

export default function ReleaseTrackScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const profile = useArtistStore((s) => s.profile);

  const [releaseType, setReleaseType] = useState<ReleaseType>('SINGLE');

  // --- Sencillo ---
  const [title, setTitle] = useState('');
  const [audioAsset, setAudioAsset] = useState<LocalFile | null>(null);

  // --- EP / Álbum ---
  const [albumTitle, setAlbumTitle] = useState('');
  const [tracks, setTracks] = useState<TrackSlot[]>([newSlot(), newSlot()]);

  // --- Compartido ---
  const [coverAsset, setCoverAsset] = useState<LocalFile | null>(null);
  const [credits, setCredits] = useState<CreditDraft[]>([]);
  const [creditRole, setCreditRole] = useState<CreditRole>('PRODUCER');
  const [creditName, setCreditName] = useState('');

  const [isPublishing, setIsPublishing] = useState(false);
  /** Paso actual del pipeline; null cuando no hay subida en curso. */
  const [step, setStep] = useState<UploadStep | null>(null);
  /** Sólo relevante en EP/Álbum: "canción 2 de 4". */
  const [trackProgress, setTrackProgress] = useState<{ index: number; total: number } | null>(null);

  const isMultiTrack = releaseType !== 'SINGLE';

  const handlePickAudio = async (onPicked: (file: LocalFile) => void) => {
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

    onPicked({
      uri: asset.uri,
      name: asset.name,
      mimeType: resolveAudioType(asset.name, asset.mimeType),
    });
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

  const addCredit = () => {
    const name = creditName.trim();
    if (!name) return;
    setCredits((prev) => [...prev, { role: creditRole, name }]);
    setCreditName('');
  };

  const removeCredit = (index: number) => {
    setCredits((prev) => prev.filter((_, i) => i !== index));
  };

  const addTrackSlot = () => setTracks((prev) => [...prev, newSlot()]);
  const removeTrackSlot = (key: string) => setTracks((prev) => (prev.length > 1 ? prev.filter((t) => t.key !== key) : prev));
  const updateTrackSlot = (key: string, patch: Partial<TrackSlot>) =>
    setTracks((prev) => prev.map((t) => (t.key === key ? { ...t, ...patch } : t)));

  const handlePublishSingle = async () => {
    if (!title.trim()) return toast.error('Ponle un título a la canción.');
    if (!audioAsset) return toast.error('Selecciona un archivo de audio.');
    if (!coverAsset) return toast.error('Elige una portada para la canción.');

    setIsPublishing(true);
    try {
      await uploadTrack({
        artistId: profile!.id,
        title: title.trim(),
        audio: audioAsset,
        cover: coverAsset,
        credits,
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

  const handlePublishRelease = async () => {
    if (!albumTitle.trim()) return toast.error(`Ponle un título al ${RELEASE_TYPE_LABEL[releaseType].toLowerCase()}.`);
    if (!coverAsset) return toast.error('Elige una portada.');
    const readyTracks = tracks.filter((t) => t.title.trim() && t.audio);
    if (readyTracks.length < 2) return toast.error('Un EP o álbum necesita al menos 2 canciones con título y audio.');

    setIsPublishing(true);
    try {
      await uploadRelease({
        artistId: profile!.id,
        albumTitle: albumTitle.trim(),
        albumType: releaseType as 'EP' | 'ALBUM',
        cover: coverAsset,
        tracks: readyTracks.map((slot) => ({ title: slot.title.trim(), audio: slot.audio! })),
        credits,
        onProgress: ({ trackIndex, totalTracks, step: pipelineStep }) => {
          setTrackProgress({ index: trackIndex + 1, total: totalTracks });
          setStep(pipelineStep);
        },
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast.success(`Tu ${RELEASE_TYPE_LABEL[releaseType].toLowerCase()} se envió a revisión, canción por canción.`);
      router.back();
    } catch (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      toast.error(error instanceof Error ? error.message : 'No se pudo subir el lanzamiento.');
    } finally {
      setIsPublishing(false);
      setStep(null);
      setTrackProgress(null);
    }
  };

  const handlePublish = () => (isMultiTrack ? handlePublishRelease() : handlePublishSingle());

  return (
    <View style={styles.container}>
      <AppBar title="Publicar" leftAction={{ icon: 'chevron-back', onPress: () => router.back() }} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing['4xl'] }]}>
        <Text style={styles.sectionLabel}>Qué vas a publicar</Text>
        <View style={styles.typeRow}>
          {(['SINGLE', 'EP', 'ALBUM'] as ReleaseType[]).map((type) => (
            <Pressable
              key={type}
              onPress={() => setReleaseType(type)}
              style={[styles.typePill, releaseType === type && styles.typePillActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: releaseType === type }}
            >
              <Text style={[styles.typePillText, releaseType === type && styles.typePillTextActive]}>
                {RELEASE_TYPE_LABEL[type]}
              </Text>
            </Pressable>
          ))}
        </View>

        <Pressable onPress={handlePickCover} style={styles.picker} accessibilityRole="button" accessibilityLabel="Elegir portada">
          {coverAsset ? (
            <>
              <Image source={coverAsset.uri} style={styles.coverPreview} contentFit="cover" />
              <Text style={styles.pickerHint}>Toca para cambiar la portada</Text>
            </>
          ) : (
            <>
              <Ionicons name="image-outline" size={32} color={colors.text.secondary} />
              <Text style={styles.pickerHint}>
                Toca para elegir la portada {isMultiTrack ? `del ${RELEASE_TYPE_LABEL[releaseType].toLowerCase()}` : 'de la canción'}
              </Text>
            </>
          )}
        </Pressable>

        {isMultiTrack ? (
          <>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Título del {RELEASE_TYPE_LABEL[releaseType].toLowerCase()}</Text>
              <TextInput
                style={styles.input}
                placeholder={`Nombre del ${RELEASE_TYPE_LABEL[releaseType].toLowerCase()}`}
                placeholderTextColor={colors.text.muted}
                value={albumTitle}
                onChangeText={setAlbumTitle}
              />
            </View>

            <Text style={styles.sectionLabel}>Canciones ({tracks.filter((t) => t.title.trim() && t.audio).length} listas)</Text>
            {tracks.map((slot, index) => (
              <View key={slot.key} style={styles.trackSlot}>
                <Text style={styles.trackSlotIndex}>{index + 1}</Text>
                <View style={styles.trackSlotBody}>
                  <TextInput
                    style={styles.trackTitleInput}
                    placeholder={`Canción ${index + 1}`}
                    placeholderTextColor={colors.text.muted}
                    value={slot.title}
                    onChangeText={(value) => updateTrackSlot(slot.key, { title: value })}
                  />
                  <Pressable
                    onPress={() => handlePickAudio((file) => updateTrackSlot(slot.key, { audio: file }))}
                    style={styles.trackAudioPicker}
                    accessibilityRole="button"
                    accessibilityLabel={`Elegir audio para la canción ${index + 1}`}
                  >
                    <Ionicons name={slot.audio ? 'musical-note' : 'cloud-upload-outline'} size={16} color={slot.audio ? colors.brand[500] : colors.text.secondary} />
                    <Text style={styles.trackAudioText} numberOfLines={1}>
                      {slot.audio ? slot.audio.name : 'Elegir audio'}
                    </Text>
                  </Pressable>
                </View>
                {tracks.length > 1 && (
                  <Pressable onPress={() => removeTrackSlot(slot.key)} accessibilityRole="button" accessibilityLabel="Quitar canción" style={styles.trackRemove}>
                    <Ionicons name="close" size={18} color={colors.text.muted} />
                  </Pressable>
                )}
              </View>
            ))}

            <Pressable onPress={addTrackSlot} style={styles.addTrackButton} accessibilityRole="button">
              <Ionicons name="add" size={16} color={colors.brand[500]} />
              <Text style={styles.addTrackButtonText}>Agregar canción</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Pressable onPress={() => handlePickAudio(setAudioAsset)} style={styles.picker} accessibilityRole="button" accessibilityLabel="Elegir archivo de audio">
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

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Título de la canción</Text>
              <TextInput
                style={styles.input}
                placeholder="Nombre de tu canción"
                placeholderTextColor={colors.text.muted}
                value={title}
                onChangeText={(value) => {
                  setTitle(value);
                  if (!albumTitle.trim()) setAlbumTitle(value);
                }}
              />
            </View>
          </>
        )}

        <View style={styles.previewRow}>
          <Image source={coverAsset?.uri ?? profile?.imageUrl} style={styles.previewCover} contentFit="cover" />
          <View style={styles.previewInfo}>
            <Text style={styles.previewTitle} numberOfLines={1}>
              {(isMultiTrack ? albumTitle : title) || `Título ${isMultiTrack ? `del ${RELEASE_TYPE_LABEL[releaseType].toLowerCase()}` : 'de la canción'}`}
            </Text>
            <Text style={styles.previewArtist} numberOfLines={1}>{profile?.name}</Text>
          </View>
        </View>

        {/* Créditos: compositor, productor, artista invitado… Texto libre a
            propósito — muchas de estas personas no tienen cuenta en Peyma
            Music. Se aplican a todas las canciones de este lanzamiento. */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Créditos {isMultiTrack ? '(para todas las canciones)' : ''} <Text style={styles.optionalTag}>opcional</Text></Text>
          <View style={styles.roleRow}>
            {CREDIT_ROLES.map((role) => (
              <Pressable
                key={role}
                onPress={() => setCreditRole(role)}
                style={[styles.rolePill, creditRole === role && styles.rolePillActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: creditRole === role }}
              >
                <Text style={[styles.rolePillText, creditRole === role && styles.rolePillTextActive]}>
                  {CREDIT_ROLE_LABEL[role]}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.genreRow}>
            <TextInput
              style={[styles.input, styles.genreInput]}
              placeholder="Nombre"
              placeholderTextColor={colors.text.muted}
              value={creditName}
              onChangeText={setCreditName}
              onSubmitEditing={addCredit}
              returnKeyType="done"
            />
            <Pressable onPress={addCredit} style={styles.addButton} accessibilityRole="button" accessibilityLabel="Agregar crédito">
              <Ionicons name="add" size={20} color={colors.text.onBrand} />
            </Pressable>
          </View>
          {credits.length > 0 && (
            <View style={styles.chipRow}>
              {credits.map((credit, index) => (
                <Pressable key={`${credit.role}-${credit.name}-${index}`} onPress={() => removeCredit(index)} style={styles.chip} accessibilityRole="button" accessibilityLabel={`Quitar crédito de ${credit.name}`}>
                  <Text style={styles.chipText}>{CREDIT_ROLE_LABEL[credit.role]}: {credit.name}</Text>
                  <Ionicons name="close" size={14} color={colors.text.secondary} />
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {step !== null && (
          <View style={styles.steps}>
            {trackProgress && (
              <Text style={styles.trackProgressText}>Canción {trackProgress.index} de {trackProgress.total}</Text>
            )}
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
          title={isMultiTrack ? `Publicar ${RELEASE_TYPE_LABEL[releaseType].toLowerCase()}` : 'Enviar a revisión'}
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
  sectionLabel: {
    color: colors.text.secondary,
    fontFamily: typography.family.medium,
    fontSize: typography.size.sm,
    marginBottom: spacing.sm,
  },
  typeRow: {
    flexDirection: 'row' as const,
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  typePill: {
    flex: 1,
    alignItems: 'center' as const,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.full,
    backgroundColor: colors.surface[200],
  },
  typePillActive: {
    backgroundColor: colors.brand[500],
  },
  typePillText: {
    color: colors.text.secondary,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.sm,
  },
  typePillTextActive: {
    color: colors.text.onBrand,
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
  trackProgressText: {
    color: colors.brand[500],
    fontFamily: typography.family.semibold,
    fontSize: typography.size.sm,
    marginBottom: 4,
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
  optionalTag: {
    color: colors.text.muted,
    fontFamily: typography.family.regular,
    fontSize: typography.size.xs,
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
  trackSlot: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  trackSlotIndex: {
    width: 20,
    textAlign: 'center' as const,
    color: colors.text.muted,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.sm,
  },
  trackSlotBody: {
    flex: 1,
    gap: spacing.xs,
  },
  trackTitleInput: {
    height: 44,
    backgroundColor: colors.surface[200],
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    color: colors.text.primary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.sm,
  },
  trackAudioPicker: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.xs,
    height: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed' as const,
    borderColor: colors.surface[500],
  },
  trackAudioText: {
    flex: 1,
    color: colors.text.secondary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.xs,
  },
  trackRemove: {
    padding: spacing.xs,
  },
  addTrackButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.xs,
    alignSelf: 'flex-start' as const,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xl,
  },
  addTrackButtonText: {
    color: colors.brand[500],
    fontFamily: typography.family.semibold,
    fontSize: typography.size.sm,
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
  roleRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  rolePill: {
    paddingVertical: 6,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radius.full,
    backgroundColor: colors.surface[200],
  },
  rolePillActive: {
    backgroundColor: colors.brand[500],
  },
  rolePillText: {
    color: colors.text.secondary,
    fontFamily: typography.family.medium,
    fontSize: typography.size.xs,
  },
  rolePillTextActive: {
    color: colors.text.onBrand,
  },
  genreRow: {
    flexDirection: 'row' as const,
    gap: spacing.sm,
  },
  genreInput: {
    flex: 1,
  },
  addButton: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.brand[500],
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  chipRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  chip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    backgroundColor: colors.surface[200],
    borderRadius: radius.full,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
  },
  chipText: {
    color: colors.text.primary,
    fontFamily: typography.family.medium,
    fontSize: typography.size.xs,
  },
  publishButton: {
    marginTop: spacing.sm,
  },
});
