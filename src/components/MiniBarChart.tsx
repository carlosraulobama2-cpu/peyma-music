import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useTheme } from '../theme';

interface MiniBarChartProps {
  /** Valores no negativos; se normalizan contra el máximo. */
  values: number[];
  height?: number;
  barColor?: string;
}

/**
 * Gráfico de barras minimalista para tendencias cortas (streams de los
 * últimos 14 días, por ejemplo). No se trajo una librería de charts sólo
 * para esto — son unas `View` con altura animada.
 */
export function MiniBarChart({ values, height = 64, barColor }: MiniBarChartProps) {
  const { colors } = useTheme();
  const max = Math.max(...values, 1);
  const color = barColor ?? colors.brand[500];

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height, gap: 4 }}>
      {values.map((value, index) => (
        <Animated.View
          key={index}
          entering={FadeIn.delay(index * 20).duration(300)}
          style={{
            flex: 1,
            height: Math.max(4, (value / max) * height),
            backgroundColor: color,
            borderRadius: 3,
            opacity: 0.5 + (value / max) * 0.5,
          }}
        />
      ))}
    </View>
  );
}
