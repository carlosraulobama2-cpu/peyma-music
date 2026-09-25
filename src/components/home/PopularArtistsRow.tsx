import { View, Text, Pressable } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Skeleton } from '../Skeleton';
import { SectionHeader } from './SectionHeader';
import { useThemedStyles, spacing, typography, motion, type Theme } from '../../theme';
import type { HomeFeed } from '../../services';

/**
 * Artistas populares, con avatar redondo y desplazamiento horizontal.
 *
 * El orden ya viene del ranking compuesto del servidor (oyentes + streams +
 * seguidores, ver `artistRanking.ts`) — antes esa jerarquía se calculaba
 * pero no se VEÍA: dos artistas seguidos se mostraban exactamente igual.
 * La corona en el primero y el número en el segundo/tercero hacen visible
 * el trabajo que ya hace el backend.
 *
 * Misma fila que la web (`web/src/components/home/ArtistRow.tsx`) y mismo
 * origen de datos. Cambian los componentes, no el contenido.
 *
 * Al pulsar va al perfil, no reproduce: en un artista lo que se espera es
 * entrar, y meter un botón de play encima del avatar deja dos objetivos
 * táctiles solapados en 128 px.
 */

const AVATAR = 112;
const RANK_TINT = '#FFC94D';

export function PopularArtistsRow({ artists, isLoading }: PopularArtistsRowProps) {
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Skeleton width={160} height={20} style={styles.skeletonTitle} />
        <Skeleton width="100%" height={AVATAR + 30} borderRadius={12} />
      </View>
    );
  }

  if (artists.length === 0) return null;

  return (
    <View style={styles.container}>
      <SectionHeader icon="trending-up" title="Artistas populares" accentColor={RANK_TINT} />
      <FlashList
        data={artists}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item, index }) => (
          <Pressable
            onPress={() => router.push(`/artist/${item.id}`)}
            accessibilityRole="button"
            accessibilityLabel={`Ver el perfil de ${item.name}, #${index + 1} en popularidad`}
            style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
          >
            <View style={styles.avatarWrapper}>
              <Image
                source={item.imageUrl}
                style={styles.avatar}
                contentFit="cover"
                transition={motion.duration.fast}
                cachePolicy="memory-disk"
              />
              {index === 0 ? (
                <View style={styles.crownBadge}>
                  <Ionicons name="trophy" size={13} color="#3A2C00" />
                </View>
              ) : index < 3 ? (
                <View style={styles.rankBadge}>
                  <Text style={styles.rankBadgeText}>{index + 1}</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>
                {item.name}
              </Text>
              {item.isVerified && <Ionicons name="checkmark-circle" size={13} color="#3d91f4" />}
            </View>
            <Text style={styles.subtitle} numberOfLines={1}>
              {item.listeners > 0 ? `${item.listeners} oyente${item.listeners === 1 ? '' : 's'}` : 'Artista'}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}

interface PopularArtistsRowProps {
  artists: HomeFeed['artists'];
  isLoading: boolean;
}

const makeStyles = ({ colors }: Theme) => ({
  container: {
    marginBottom: spacing.xl,
  },
  skeletonTitle: {
    marginBottom: spacing.sm,
    marginLeft: spacing.md,
  },
  listContent: {
    paddingHorizontal: spacing.md,
  },
  item: {
    width: AVATAR + 16,
    alignItems: 'center' as const,
    marginRight: spacing.md,
  },
  itemPressed: {
    opacity: 0.7,
  },
  avatarWrapper: {
    position: 'relative' as const,
    marginBottom: spacing.xs,
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
  },
  crownBadge: {
    position: 'absolute' as const,
    bottom: 2,
    right: 2,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: RANK_TINT,
    borderWidth: 2,
    borderColor: colors.surface[50],
  },
  rankBadge: {
    position: 'absolute' as const,
    bottom: 2,
    right: 2,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: colors.surface[200],
    borderWidth: 2,
    borderColor: colors.surface[50],
  },
  rankBadgeText: {
    color: colors.text.primary,
    fontFamily: typography.family.bold,
    fontSize: 11,
  },
  nameRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 3,
    maxWidth: AVATAR + 16,
  },
  name: {
    color: colors.text.primary,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.sm,
    textAlign: 'center' as const,
    flexShrink: 1,
  },
  subtitle: {
    color: colors.text.secondary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.xs,
    textAlign: 'center' as const,
  },
});
