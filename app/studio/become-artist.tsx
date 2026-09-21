import { useState } from 'react';
import { View, Text, TextInput, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useArtistStore, useAuthStore, toast } from '../../src/store';
import { api } from '../../src/services';
import { AppBar, Button } from '../../src/components';
import { useTheme, useThemedStyles, spacing, typography, radius, type Theme } from '../../src/theme';

const SUGGESTED_GENRES = ['Pop', 'Rock', 'Electrónica', 'Hip-Hop', 'Indie', 'Reggaetón', 'Folk', 'Jazz'];

export default function BecomeArtistScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const user = useAuthStore((s) => s.user);
  const becomeArtist = useArtistStore((s) => s.becomeArtist);
  const updateUser = useAuthStore((s) => s.updateUser);

  const [name, setName] = useState(user?.displayName ?? '');
  const [bio, setBio] = useState('');
  const [genres, setGenres] = useState<string[]>([]);

  const toggleGenre = (genre: string) => {
    setGenres((prev) => (prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]));
  };

  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error('Ponle un nombre artístico a tu perfil.');
      return;
    }

    setSubmitting(true);
    try {
      /**
       * El perfil se crea EN EL SERVIDOR.
       *
       * Antes sólo se guardaba en el store local con un id inventado
       * (`artist-self-<timestamp>`). El perfil no existía para nadie más y,
       * peor, cualquier subida hecha con ese id habría sido rechazada por
       * el backend — el estudio parecía funcionar y no publicaba nada.
       */
      const artist = await api.createArtistProfile({
        name: name.trim(),
        // Sin foto elegida se usa la del usuario; el backend la exige.
        imageUrl: user?.avatarUrl ?? 'https://archive.org/services/img/badpanda006',
        ...(bio.trim() ? { bio: bio.trim() } : {}),
        genres,
      });

      // El store local sigue existiendo para que el Studio pinte sin
      // esperar otra consulta, pero ahora refleja el perfil REAL.
      becomeArtist({
        id: artist.id,
        name: artist.name,
        bio: artist.bio,
        imageUrl: artist.imageUrl,
        genres: artist.genres,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo crear tu perfil de artista.');
      setSubmitting(false);
      return;
    } finally {
      setSubmitting(false);
    }

    updateUser({ accountType: 'artist' });
    toast.success('¡Ya eres artista en Peyma Music! Encuentra tu Studio en la barra inferior.');
    // No se navega directo a /(tabs)/studio: la pestaña estaba oculta hasta
    // este mismo render (depende de accountType) y expo-router puede no
    // reconocerla como destino válido todavía en este mismo tick.
    router.replace('/(tabs)');
  };

  return (
    <View style={styles.container}>
      <AppBar title="Cuenta de artista" leftAction={{ icon: 'chevron-back', onPress: () => router.back() }} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing['4xl'] }]}>
        <Ionicons name="mic" size={40} color={colors.brand[500]} style={styles.icon} />
        <Text style={styles.subtitle}>
          Publica tus canciones y accede a un panel con tus oyentes, seguidores y de dónde te escuchan — como
          Spotify for Artists.
        </Text>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Nombre artístico</Text>
          <TextInput
            style={styles.input}
            placeholder="Tu nombre como artista"
            placeholderTextColor={colors.text.muted}
            value={name}
            onChangeText={setName}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Biografía (opcional)</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Cuéntale al mundo sobre tu música…"
            placeholderTextColor={colors.text.muted}
            value={bio}
            onChangeText={setBio}
            multiline
            numberOfLines={4}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Géneros</Text>
          <View style={styles.genreGrid}>
            {SUGGESTED_GENRES.map((genre) => {
              const selected = genres.includes(genre);
              return (
                <Pressable
                  key={genre}
                  onPress={() => toggleGenre(genre)}
                  style={[styles.genreChip, selected && styles.genreChipSelected]}
                >
                  <Text style={[styles.genreText, selected && styles.genreTextSelected]}>{genre}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Button
          title="Crear perfil de artista"
          onPress={handleSubmit}
          loading={submitting}
          disabled={submitting}
          fullWidth
          style={styles.submitButton}
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
  icon: {
    alignSelf: 'center' as const,
    marginBottom: spacing.md,
  },
  subtitle: {
    color: colors.text.secondary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.base,
    textAlign: 'center' as const,
    lineHeight: typography.lineHeight.base,
    marginBottom: spacing['2xl'],
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
  genreGrid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: spacing.sm,
  },
  genreChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surface[300],
  },
  genreChipSelected: {
    backgroundColor: colors.brand[500],
  },
  genreText: {
    color: colors.text.primary,
    fontFamily: typography.family.medium,
    fontSize: typography.size.sm,
  },
  genreTextSelected: {
    color: colors.text.onBrand,
  },
  submitButton: {
    marginTop: spacing.md,
  },
});
