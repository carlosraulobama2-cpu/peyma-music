import { useState } from 'react';
import { View, Text, TextInput, ScrollView, Pressable, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useArtistStore, useAuthStore, toast } from '../../src/store';
import { AppBar, Button } from '../../src/components';
import { useTheme, useThemedStyles, spacing, typography, radius, type Theme } from '../../src/theme';

export default function EditArtistProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const profile = useArtistStore((s) => s.profile);
  const updateProfile = useArtistStore((s) => s.updateProfile);
  const stopBeingArtist = useArtistStore((s) => s.stopBeingArtist);
  const updateUser = useAuthStore((s) => s.updateUser);

  const [name, setName] = useState(profile?.name ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [genres, setGenres] = useState<string[]>(profile?.genres ?? []);
  const [genreInput, setGenreInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  if (!profile) {
    router.back();
    return null;
  }

  const addGenre = () => {
    const value = genreInput.trim();
    if (!value) return;
    if (genres.some((g) => g.toLowerCase() === value.toLowerCase())) {
      setGenreInput('');
      return;
    }
    setGenres((prev) => [...prev, value]);
    setGenreInput('');
  };

  const removeGenre = (value: string) => {
    setGenres((prev) => prev.filter((g) => g !== value));
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('El nombre artístico no puede estar vacío.');
      return;
    }
    setIsSaving(true);
    try {
      await updateProfile({ name: name.trim(), bio: bio.trim() || undefined, genres });
      toast.success('Perfil de artista actualizado');
      router.back();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar el perfil.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleStopBeingArtist = () => {
    Alert.alert(
      'Desactivar cuenta de artista',
      'Se ocultará tu panel y tus lanzamientos. Podrás volver a activarla cuando quieras.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Desactivar',
          style: 'destructive',
          onPress: () => {
            stopBeingArtist();
            updateUser({ accountType: 'listener' });
            router.replace('/(tabs)');
          },
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <AppBar title="Editar perfil de artista" leftAction={{ icon: 'chevron-back', onPress: () => router.back() }} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing['4xl'] }]}>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Nombre artístico</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Biografía</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={bio}
            onChangeText={setBio}
            multiline
            numberOfLines={4}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Géneros</Text>
          <Text style={styles.hint}>
            Con qué ritmos te identificás — por ejemplo &ldquo;Cristiana&rdquo;, si es tu caso. Aparecen como
            tarjeta en Explorar en cuanto los agregás.
          </Text>
          <View style={styles.genreRow}>
            <TextInput
              style={[styles.input, styles.genreInput]}
              value={genreInput}
              onChangeText={setGenreInput}
              placeholder="Ej: Cristiana"
              placeholderTextColor={colors.text.muted}
              onSubmitEditing={addGenre}
              returnKeyType="done"
            />
            <Pressable onPress={addGenre} style={styles.addButton} accessibilityRole="button" accessibilityLabel="Agregar género">
              <Ionicons name="add" size={20} color={colors.text.onBrand} />
            </Pressable>
          </View>
          {genres.length > 0 && (
            <View style={styles.chipRow}>
              {genres.map((genre) => (
                <Pressable key={genre} onPress={() => removeGenre(genre)} style={styles.chip} accessibilityRole="button" accessibilityLabel={`Quitar ${genre}`}>
                  <Text style={styles.chipText}>{genre}</Text>
                  <Ionicons name="close" size={14} color={colors.text.secondary} />
                </Pressable>
              ))}
            </View>
          )}
        </View>

        <Button title="Guardar cambios" onPress={handleSave} loading={isSaving} disabled={isSaving} fullWidth style={styles.saveButton} />

        <Pressable onPress={handleStopBeingArtist} style={styles.dangerLink}>
          <Text style={styles.dangerLinkText}>Desactivar cuenta de artista</Text>
        </Pressable>
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
  inputGroup: {
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  label: {
    color: colors.text.secondary,
    fontFamily: typography.family.medium,
    fontSize: typography.size.sm,
  },
  hint: {
    color: colors.text.muted,
    fontFamily: typography.family.regular,
    fontSize: typography.size.xs,
    marginBottom: 2,
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
  textArea: {
    height: 100,
    paddingTop: spacing.md,
    textAlignVertical: 'top' as const,
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
    marginTop: spacing.xs,
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
  saveButton: {
    marginTop: spacing.md,
  },
  dangerLink: {
    alignItems: 'center' as const,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  dangerLinkText: {
    color: colors.semantic.error,
    fontFamily: typography.family.medium,
    fontSize: typography.size.sm,
  },
});
