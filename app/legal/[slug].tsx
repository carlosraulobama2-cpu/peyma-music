import { ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppBar } from '../../src/components';
import { useThemedStyles, spacing, typography, type Theme } from '../../src/theme';
import { LEGAL_DOCUMENTS, TERMS_UPDATED_LABEL, TERMS_VERSION, type LegalDocument } from '../../src/legal';

/**
 * Términos, privacidad y "acerca de".
 *
 * El texto de los dos primeros vive en `src/legal.ts`, junto al que muestra
 * el alta: el paso de aceptación enseña el mismo resumen que esta pantalla
 * amplía, y con el texto copiado en los dos sitios acabarían diciendo cosas
 * distintas.
 *
 * "Acerca de" se queda aquí: no es un documento legal, no se acepta y no
 * comparte estructura con los otros dos.
 */

const ABOUT: Omit<LegalDocument, 'slug'> = {
  title: 'Acerca de',
  summary: 'Peyma Music 1.0.0',
  sections: [
    {
      heading: 'Qué es',
      paragraphs: [
        'Una plataforma de streaming de música independiente: app, web pública, panel de administración y API propia.',
        'La app está hecha con React Native, Expo y TypeScript, con reproducción en segundo plano, biblioteca personal y cuentas de artista con estadísticas reales.',
      ],
    },
  ],
};

// `about` no se acepta ni se versiona, así que no lleva slug; el mapa se
// tipa sin él para no obligar a inventarle uno que no significa nada.
const PAGES: Record<string, Omit<LegalDocument, 'slug'>> = { ...LEGAL_DOCUMENTS, about: ABOUT };

export default function LegalScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(makeStyles);

  const page = PAGES[slug ?? ''];
  const esLegal = slug === 'terms' || slug === 'privacy';

  if (!page) {
    return (
      <>
        <AppBar title="Información" leftAction={{ icon: 'chevron-back', onPress: () => router.back() }} />
        <View style={styles.container}>
          <Text style={styles.body}>Contenido no disponible.</Text>
        </View>
      </>
    );
  }

  return (
    <>
      <AppBar title={page.title} leftAction={{ icon: 'chevron-back', onPress: () => router.back() }} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing['4xl'] }]}
      >
        <Text style={styles.summary}>{page.summary}</Text>

        {/* La versión se enseña porque es la que queda guardada con la
            cuenta: si alguna vez hay que revisar qué aceptó alguien, tiene
            que poder mirarla aquí y reconocerla. */}
        {esLegal && (
          <Text style={styles.meta}>
            Actualizado el {TERMS_UPDATED_LABEL} · versión {TERMS_VERSION}
          </Text>
        )}

        {page.sections.map((section, indice) => (
          <View key={section.heading} style={styles.section}>
            <Text style={styles.heading}>
              {indice + 1}. {section.heading}
            </Text>
            {section.paragraphs.map((parrafo) => (
              <Text key={parrafo} style={styles.body}>
                {parrafo}
              </Text>
            ))}
          </View>
        ))}
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
  summary: {
    color: colors.text.primary,
    fontFamily: typography.family.medium,
    fontSize: typography.size.base,
    lineHeight: typography.lineHeight.base,
  },
  meta: {
    color: colors.text.muted,
    fontFamily: typography.family.regular,
    fontSize: typography.size.xs,
    marginTop: spacing.sm,
  },
  section: {
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
  heading: {
    color: colors.text.primary,
    fontFamily: typography.family.bold,
    fontSize: typography.size.lg,
  },
  body: {
    color: colors.text.secondary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.base,
    lineHeight: typography.lineHeight.base,
  },
});
