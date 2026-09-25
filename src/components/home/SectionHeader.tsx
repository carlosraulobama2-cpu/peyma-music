import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useTheme, useThemedStyles, spacing, typography, radius, type Theme } from '../../theme';

interface SectionHeaderProps {
  /** Ícono simbólico de la sección — lo que antes era sólo texto ahora se lee de un vistazo. */
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  /** Tinte del ícono y su halo. Por defecto el verde de marca; cada sección puede tener el suyo. */
  accentColor?: string;
  seeAllHref?: Href;
  onSeeAll?: () => void;
}

/**
 * Encabezado unificado de sección para toda la portada.
 *
 * Antes cada fila (Novedades, Para ti, cada género…) escribía su propio
 * `<Text>` con un tamaño ligeramente distinto y sin ningún elemento visual
 * que distinguiera una sección de otra — doce filas seguidas se leían como
 * una sola pantalla repetida. Un ícono con halo de color propio por sección
 * (más "Novedades" no es lo mismo que "Para ti") es la diferencia entre una
 * lista de títulos y una portada con jerarquía real.
 */
export function SectionHeader({ icon, title, subtitle, accentColor, seeAllHref, onSeeAll }: SectionHeaderProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const tint = accentColor ?? colors.brand[500];

  const handleSeeAll = () => {
    if (onSeeAll) return onSeeAll();
    if (seeAllHref) router.push(seeAllHref);
  };

  return (
    <View style={styles.row}>
      <View style={[styles.iconBadge, { backgroundColor: `${tint}22` }]}>
        <Ionicons name={icon} size={15} color={tint} />
      </View>

      <View style={styles.textColumn}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {subtitle && (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>

      {(onSeeAll || seeAllHref) && (
        <Pressable
          onPress={handleSeeAll}
          hitSlop={10}
          accessibilityRole="link"
          accessibilityLabel={`Ver todo en ${title}`}
          style={({ pressed }) => [styles.seeAll, pressed && styles.seeAllPressed]}
        >
          <Text style={styles.seeAllText}>Ver todo</Text>
          <Ionicons name="chevron-forward" size={13} color={colors.text.secondary} />
        </Pressable>
      )}
    </View>
  );
}

const makeStyles = ({ colors }: Theme) => ({
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  iconBadge: {
    width: 28,
    height: 28,
    borderRadius: radius.md,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  textColumn: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: colors.text.primary,
    fontFamily: typography.family.bold,
    fontSize: typography.size.lg,
    letterSpacing: typography.letterSpacing.tight,
  },
  subtitle: {
    color: colors.text.secondary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.xs,
    marginTop: 1,
  },
  seeAll: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 2,
    paddingVertical: spacing.xs,
    paddingLeft: spacing.sm,
  },
  seeAllPressed: {
    opacity: 0.6,
  },
  seeAllText: {
    color: colors.text.secondary,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.xs,
  },
});
