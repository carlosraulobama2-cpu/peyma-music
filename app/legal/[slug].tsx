import { ScrollView, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppBar } from '../../src/components';
import { useThemedStyles, spacing, typography, type Theme } from '../../src/theme';

const PAGES: Record<string, { title: string; body: string }> = {
  terms: {
    title: 'Términos de servicio',
    body: `Bienvenido a Peyma Music.

Al usar la app aceptas usarla de forma personal y no comercial, respetar los derechos de autor del contenido que subas o reproduzcas, y que las funciones que dependen de datos simulados (estadísticas, tendencias) son con fines demostrativos.

Peyma Music puede actualizar estos términos conforme la app evolucione. Seguir usando la app implica aceptar los cambios.`,
  },
  privacy: {
    title: 'Privacidad',
    body: `Tu música, tus playlists y tus preferencias se guardan en tu dispositivo.

No compartimos tus datos con terceros. Las estadísticas de artista que ves en el Studio se generan localmente a partir de tu perfil, sin enviar información a servidores externos.

Puedes borrar todos tus datos desinstalando la app o cerrando sesión desde Ajustes.`,
  },
  about: {
    title: 'Acerca de',
    body: `Peyma Music 1.0.0

Una app de streaming de música construida con React Native, Expo y TypeScript — con reproductor en segundo plano, biblioteca personal, cuentas de artista con estadísticas, y más.

Hecho con cuidado por su comunidad de desarrollo.`,
  },
};

export default function LegalScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(makeStyles);

  const page = PAGES[slug ?? ''] ?? { title: 'Información', body: 'Contenido no disponible.' };

  return (
    <>
      <AppBar title={page.title} leftAction={{ icon: 'chevron-back', onPress: () => router.back() }} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing['4xl'] }]}
      >
        <Text style={styles.body}>{page.body}</Text>
      </ScrollView>
    </>
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
  body: {
    color: colors.text.secondary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.base,
    lineHeight: typography.lineHeight.base,
  },
});
