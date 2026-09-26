import { View, Text, Pressable, StyleSheet } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { usePlayerStore } from '../../store';
import { Skeleton } from '../Skeleton';
import { SectionHeader } from './SectionHeader';
import { useTheme, useThemedStyles, spacing, typography, radius, motion, elevation, type Theme } from '../../theme';
import type { HomeFeed } from '../../services';

/**
 * Fila VIP: contenido promocionado desde el panel de control.
 *
 * Tarjeta a sangre (imagen completa, no una miniatura a un lado) con
 * degradado real en vez de un tinte plano: el color dominante de la
 * portada ya lo calcula el servidor, así que el "mood" de la tarjeta sigue
 * siendo el de la carátula real, pero ahora se lee como una pieza editorial
 * — el mismo lenguaje que usan las portadas destacadas de Apple Music —
 * en vez de una fila de catálogo más.
 *
 * Es la misma fila que la web (`web/src/components/home/HeroRow.tsx`) y se
 * alimenta del mismo endpoint; cambian los componentes, no el contenido.
 */

const FALLBACK_COLOR = '#2a2a2e';
const CARD_WIDTH = 268;
const CARD_HEIGHT = 320;

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
        <Skeleton width={140} height={20} style={styles.skeletonTitle} />
        <Skeleton width={CARD_WIDTH} height={CARD_HEIGHT} borderRadius={radius['2xl']} style={styles.skeletonCard} />
      </View>
    );
  }

  if (items.length === 0) return null;

  const queue = items.map((item) => item.track);

  return (
    <View style={styles.container}>
      <SectionHeader icon="flame" title="Destacado" subtitle="Elegido a mano desde el panel" accentColor="#FF6B6B" />
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
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
          >
            <Image
              source={item.track.coverUrl}
              style={[StyleSheet.absoluteFill, { backgroundColor: item.dominantColor ?? FALLBACK_COLOR }]}
              contentFit="cover"
              transition={motion.duration.normal}
              cachePolicy="memory-disk"
            />
            {/* Doble degradado: uno suave desde arriba (separa el número del
                fondo brillante de una portada clara) y uno fuerte desde abajo
                (legibilidad garantizada del título, sea cual sea la carátula). */}
            <LinearGradient colors={['rgba(0,0,0,0.35)', 'transparent']} style={styles.topScrim} />
            <LinearGradient colors={['transparent', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.92)']} style={styles.bottomScrim} />

            <View style={styles.indexBadge}>
              <Text style={styles.indexText}>{String(index + 1).padStart(2, '0')}</Text>
            </View>

            <View style={styles.info}>
              <View style={styles.badgeRow}>
                <Ionicons name="flame" size={10} color="#FF6B6B" />
                <Text style={styles.badge}>DESTACADO</Text>
              </View>
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
              <Ionicons name="play" size={20} color={colors.text.onBrand} style={styles.playIcon} />
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
  skeletonTitle: {
    marginBottom: spacing.sm,
    marginLeft: spacing.lg,
  },
  skeletonCard: {
    marginLeft: spacing.lg,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: radius['2xl'],
    marginRight: spacing.md,
    overflow: 'hidden' as const,
    backgroundColor: colors.surface[300],
    ...elevation.md,
  },
  cardPressed: {
    opacity: 0.92,
  },
  topScrim: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    height: 90,
  },
  bottomScrim: {
    position: 'absolute' as const,
    bottom: 0,
    left: 0,
    right: 0,
    height: '65%' as const,
  },
  indexBadge: {
    position: 'absolute' as const,
    top: spacing.md,
    left: spacing.md,
  },
  indexText: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: typography.family.bold,
    fontSize: typography.size['2xl'],
    letterSpacing: -1,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  info: {
    position: 'absolute' as const,
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
  },
  badgeRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    marginBottom: spacing.xs,
  },
  badge: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: typography.family.bold,
    fontSize: 10,
    letterSpacing: 1,
  },
  cardTitle: {
    color: '#fff',
    fontFamily: typography.family.bold,
    fontSize: typography.size.xl,
    marginBottom: 2,
  },
  cardArtist: {
    color: 'rgba(255,255,255,0.8)',
    fontFamily: typography.family.medium,
    fontSize: typography.size.sm,
  },
  playButton: {
    position: 'absolute' as const,
    right: spacing.lg,
    top: spacing.lg,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: colors.brand[500],
    ...elevation.sm,
  },
  playIcon: {
    marginLeft: 2,
  },
});
