import { View } from 'react-native';
import { Skeleton } from '../Skeleton';
import { useThemedStyles, spacing, type Theme } from '../../theme';

/**
 * Replica la estructura exacta de Inicio (header, filtros, rejilla 2×3,
 * banner, carruseles) mientras se resuelve la carga — así no hay un salto
 * de layout cuando llegan los datos reales.
 */
export function HomeSkeleton() {
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Skeleton width={180} height={28} />
        <View style={styles.headerIcons}>
          <Skeleton width={36} height={36} borderRadius={18} />
          <Skeleton width={36} height={36} borderRadius={18} />
        </View>
      </View>

      <View style={styles.filterRow}>
        <Skeleton width={60} height={30} borderRadius={15} />
        <Skeleton width={60} height={30} borderRadius={15} />
      </View>

      <View style={styles.grid}>
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} width="48%" height={56} borderRadius={6} style={styles.gridTile} />
        ))}
      </View>

      <Skeleton width="100%" height={220} borderRadius={16} style={styles.section} />

      {[...Array(3)].map((_, i) => (
        <View key={i} style={styles.section}>
          <Skeleton width={160} height={22} style={styles.sectionTitle} />
          <Skeleton width="100%" height={150} borderRadius={12} />
        </View>
      ))}
    </View>
  );
}

const makeStyles = (_theme: Theme) => ({
  container: {
    flex: 1,
    paddingTop: spacing.xl,
  },
  headerRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  headerIcons: {
    flexDirection: 'row' as const,
    gap: spacing.md,
  },
  filterRow: {
    flexDirection: 'row' as const,
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
  },
  grid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  gridTile: {
    marginBottom: 0,
  },
  section: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    marginBottom: spacing.md,
  },
});
