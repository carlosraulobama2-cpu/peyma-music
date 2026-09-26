import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter, type Href } from 'expo-router';
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
 * vez de reconstruir esa experiencia acá adentro. "Radio" hace lo mismo con
 * `/radio` — estaciones de radio en vivo de terceros, no del catálogo.
 */
export function QuickFilterBar() {
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);
  const [active, setActive] = useState<'all' | 'lofi' | 'radio'>('all');

  const handlePress = (filter: 'all' | 'lofi' | 'radio') => {
    Haptics.selectionAsync().catch(() => {});
    setActive(filter);
    if (filter === 'lofi') router.push('/lofi');
    // `/radio` es una ruta nueva: los tipos de expo-router (`.expo/types`)
    // todavía no la conocen hasta la próxima regeneración — mismo caso que
    // ya se dio con las rutas de plantilla en `EditorialSections.tsx`.
    if (filter === 'radio') router.push('/radio' as Href);
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
      <Pressable
        onPress={() => handlePress('radio')}
        style={[styles.chip, active === 'radio' && styles.chipActive]}
        accessibilityRole="tab"
        accessibilityState={{ selected: active === 'radio' }}
      >
        <Text style={[styles.chipText, active === 'radio' && styles.chipTextActive]}>Radio</Text>
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
