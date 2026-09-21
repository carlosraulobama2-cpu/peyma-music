import { useState } from 'react';
import { View, Text, TextInput, ScrollView, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useArtistStore, useAuthStore, toast } from '../../src/store';
import { AppBar, Button } from '../../src/components';
import { useThemedStyles, spacing, typography, radius, type Theme } from '../../src/theme';

export default function EditArtistProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(makeStyles);

  const profile = useArtistStore((s) => s.profile);
  const updateProfile = useArtistStore((s) => s.updateProfile);
  const stopBeingArtist = useArtistStore((s) => s.stopBeingArtist);
  const updateUser = useAuthStore((s) => s.updateUser);

  const [name, setName] = useState(profile?.name ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');

  if (!profile) {
    router.back();
    return null;
  }

  const handleSave = () => {
    if (!name.trim()) {
      toast.error('El nombre artístico no puede estar vacío.');
      return;
    }
    updateProfile({ name: name.trim(), bio: bio.trim() || undefined });
    toast.success('Perfil de artista actualizado');
    router.back();
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

        <Button title="Guardar cambios" onPress={handleSave} fullWidth style={styles.saveButton} />

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
