import { useState } from 'react';
import { View, Text, TextInput, ScrollView, Pressable, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useArtistStore, useAuthStore, toast } from '../../src/store';
import { api } from '../../src/services';
import { pickFromLibrary, uploadImageToBucket, PermissionDeniedError, type PickedImage } from '../../src/services/avatarUpload';
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
  const [foto, setFoto] = useState<PickedImage | null>(null);

  /**
   * Foto del artista.
   *
   * Es una imagen propia y no el avatar de la cuenta: alguien puede
   * llamarse Ana y su proyecto "Dúo Sombra". Si no eligen ninguna se cae
   * al avatar, que al menos es suyo; lo que ya no se hace es usar una URL
   * de archive.org escrita en el código, que le ponía al artista la foto
   * de un desconocido.
   */
  const elegirFoto = async () => {
    try {
      const elegida = await pickFromLibrary();
      if (elegida) setFoto(elegida);
    } catch (error) {
      if (error instanceof PermissionDeniedError) {
        toast.error('Necesitamos permiso para acceder a tus fotos.');
        return;
      }
      toast.error('No se pudo abrir la galería.');
    }
  };

  const toggleGenre = (genre: string) => {
    setGenres((prev) => (prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]));
  };

  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error('Ponle un nombre artístico a tu perfil.');
      return;
    }

    if (!foto && !user?.avatarUrl) {
      toast.error('Elegí una foto para tu perfil de artista.');
      return;
    }

    setSubmitting(true);
    try {
      // La foto va primero: el backend exige `imageUrl` al crear, así que
      // si la subida falla no llega a crearse un perfil a medias.
      const imageUrl = foto ? await uploadImageToBucket(foto) : user!.avatarUrl!;

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
        imageUrl,
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
          <Text style={styles.label}>Foto del artista</Text>
          <Pressable onPress={elegirFoto} accessibilityRole="button" style={styles.photoRow}>
            {foto || user?.avatarUrl ? (
              <Image source={{ uri: foto?.uri ?? user!.avatarUrl! }} style={styles.photo} />
            ) : (
              <View style={[styles.photo, styles.photoEmpty]}>
                <Ionicons name="camera" size={22} color={colors.text.secondary} />
              </View>
            )}
            <Text style={styles.photoHint}>
              {foto ? 'Cambiar foto' : user?.avatarUrl ? 'Usar otra (ahora se usa la de tu cuenta)' : 'Elegir una foto'}
            </Text>
          </Pressable>
        </View>

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
  photoRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.lg,
  },
  photo: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.surface[300],
  },
  photoEmpty: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 1,
    borderColor: colors.surface[400],
  },
  photoHint: {
    color: colors.brand[500],
    fontFamily: typography.family.medium,
    fontSize: typography.size.sm,
    flex: 1,
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
