import { View, Text, Pressable } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { usePlayerStore } from '../../store';
import { Skeleton } from '../Skeleton';
import { useTheme, useThemedStyles, spacing, typography, radius, motion, type Theme } from '../../theme';
import type { HomeFeed } from '../../services';

/**
 * Fila VIP: contenido promocionado desde el panel de control.
 *
 * Cada tarjeta se tiñe con el color dominante REAL de su portada, calculado
 * en el servidor. Sin color calculado usa un gris neutro: un tinte inventado
 * que no pega con la carátula se ve peor que ninguno.
 *
 * Es la misma fila que la web (`web/src/components/home/HeroRow.tsx`) y se
 * alimenta del mismo endpoint; cambian los componentes, no el contenido.
 */

const FALLBACK_COLOR = '#2a2a2e';
const CARD_WIDTH = 300;

type HeroItem = HomeFeed['hero'][number];

interface HeroRowProps {
  items: HeroItem[];
  isLoading: boolean;
}

export function HeroRow({ items, isLoading }: HeroRowProps) {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const play = usePlayerStore((s) => s.play);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Skeleton width={120} height={20} style={styles.skeletonTitle} />
        <Skeleton width="100%" height={112} borderRadius={12} />
      </View>
    );
  }

  if (items.length === 0) return null;

  const queue = items.map((item) => item.track);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Destacado</Text>
      <FlashList
        data={items}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.promotionId}
        contentContainerStyle={styles.listContent}
        renderItem={({ item, index }) => (
          <Pressable
            onPress={() => router.push(`/album/${item.track.albumId}`)}
            accessibilityRole="button"
            accessibilityLabel={`${item.track.title}, de ${item.track.artist}`}
            style={[styles.card, { backgroundColor: item.dominantColor ?? FALLBACK_COLOR }]}
          >
            <Image
              source={item.track.coverUrl}
              style={styles.cover}
              contentFit="cover"
              transition={motion.duration.fast}
              cachePolicy="memory-disk"
            />
            <View style={styles.info}>
              <Text style={styles.badge}>DESTACADO</Text>
              <Text style={styles.cardTitle} numberOfLines={2}>
                {item.track.title}
              </Text>
              <Text style={styles.cardArtist} numberOfLines={1}>
                {item.track.artist}
              </Text>
            </View>
            <Pressable
              onPress={(event) => {
                // Sin esto, el toque lo captura la tarjeta y navega al álbum
                // en vez de reproducir.
                event.stopPropagation();
                play(item.track, queue.slice(index));
              }}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={`Reproducir ${item.track.title}`}
              style={styles.playButton}
            >
              <Ionicons name="play" size={18} color={colors.text.onBrand} />
            </Pressable>
          </Pressable>
        )}
      />
    </View>
  );
}

const makeStyles = ({ colors }: Theme) => ({
  container: {
    marginBottom: spacing.xl,
  },
  title: {
    color: colors.text.primary,
    fontFamily: typography.family.bold,
    fontSize: typography.size.xl,
    marginBottom: spacing.sm,
    marginLeft: spacing.md,
  },
  skeletonTitle: {
    marginBottom: spacing.sm,
    marginLeft: spacing.md,
  },
  listContent: {
    paddingHorizontal: spacing.md,
  },
  card: {
    width: CARD_WIDTH,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    marginRight: spacing.md,
    overflow: 'hidden' as const,
  },
  cover: {
    width: 80,
    height: 80,
    borderRadius: radius.xs,
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  badge: {
    color: 'rgba(255,255,255,0.7)',
    fontFamily: typography.family.bold,
    fontSize: 10,
    letterSpacing: 0.6,
  },
  cardTitle: {
    color: '#fff',
    fontFamily: typography.family.bold,
    fontSize: typography.size.base,
    marginTop: 2,
  },
  cardArtist: {
    color: 'rgba(255,255,255,0.8)',
    fontFamily: typography.family.regular,
    fontSize: typography.size.sm,
  },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: colors.brand[500],
  },
});
