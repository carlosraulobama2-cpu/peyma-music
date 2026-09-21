import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useThemedStyles, spacing, radius, typography, type Theme } from '../../theme';

/**
 * Filtros rápidos de Inicio. Se quedan en estado local del componente (no en
 * un store global): ningún otro lugar de la app necesita saber cuál está
 * seleccionado — un store global para un valor de un solo consumidor sería
 * el mismo tipo de duplicación innecesaria que se pidió evitar, sólo que
 * en la capa de estado en vez de en la de componentes.
 *
 * Catálogo actual sin podcasts: "Música" y "Todos" muestran lo mismo (todo
 * es música), así que se fusionan en un único chip "Todo" — un filtro que
 * no cambia nada al tocarlo sería una promesa falsa a quien lo usa. "Lo-Fi"
 * sí hace algo real: lleva al módulo dedicado que ya existe (`/lofi`), en
 * vez de reconstruir esa experiencia acá adentro.
 */
export function QuickFilterBar() {
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);
  const [active, setActive] = useState<'all' | 'lofi'>('all');

  const handlePress = (filter: 'all' | 'lofi') => {
    Haptics.selectionAsync().catch(() => {});
    setActive(filter);
    if (filter === 'lofi') router.push('/lofi');
  };

  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => handlePress('all')}
        style={[styles.chip, active === 'all' && styles.chipActive]}
        accessibilityRole="tab"
        accessibilityState={{ selected: active === 'all' }}
      >
        <Text style={[styles.chipText, active === 'all' && styles.chipTextActive]}>Todo</Text>
      </Pressable>
      <Pressable
        onPress={() => handlePress('lofi')}
        style={[styles.chip, active === 'lofi' && styles.chipActive]}
        accessibilityRole="tab"
        accessibilityState={{ selected: active === 'lofi' }}
      >
        <Text style={[styles.chipText, active === 'lofi' && styles.chipTextActive]}>Lo-Fi</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = ({ colors }: Theme) => ({
  row: {
    flexDirection: 'row' as const,
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    backgroundColor: colors.surface[200],
  },
  chipActive: {
    backgroundColor: colors.text.primary,
  },
  chipText: {
    color: colors.text.primary,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.xs,
  },
  chipTextActive: {
    color: colors.surface[0],
  },
});
