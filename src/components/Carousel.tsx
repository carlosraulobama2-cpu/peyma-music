import { Text, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { FlashList } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInRight } from 'react-native-reanimated';
import { useThemedStyles, motion, radius, spacing, typography, type Theme } from '../theme';

export interface CarouselItemData {
  id: string;
  title: string;
  subtitle?: string;
  imageUrl: string;
}

interface CarouselProps {
  title: string;
  data: CarouselItemData[];
  onItemPress: (item: CarouselItemData) => void;
  /** Portadas circulares, para carruseles de artistas. */
  circular?: boolean;
}

const ITEM_SIZE = 140;
/** Sólo se anima la entrada de los primeros elementos visibles; el resto no lo necesita. */
const MAX_STAGGERED_ITEMS = 8;

export function Carousel({ title, data, onItemPress, circular = false }: CarouselProps) {
  const styles = useThemedStyles(makeStyles);

  if (data.length === 0) return null;

  return (
    <Animated.View entering={FadeInRight.duration(motion.duration.normal)} style={styles.container}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <FlashList
        data={data}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <Animated.View
            entering={
              index < MAX_STAGGERED_ITEMS
                ? FadeInRight.delay(index * motion.stagger).springify().damping(16)
                : undefined
            }
          >
            <Pressable
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                onItemPress(item);
              }}
              accessibilityRole="button"
              accessibilityLabel={item.subtitle ? `${item.title}, ${item.subtitle}` : item.title}
              style={({ pressed }) => [styles.itemContainer, pressed && styles.itemPressed]}
            >
              <Image
                source={item.imageUrl}
                style={[styles.image, circular && styles.circularImage]}
                contentFit="cover"
                transition={motion.duration.fast}
                cachePolicy="memory-disk"
              />
              <Text style={styles.itemTitle} numberOfLines={1}>
                {item.title}
              </Text>
              {item.subtitle && (
                <Text style={styles.itemSubtitle} numberOfLines={1}>
                  {item.subtitle}
                </Text>
              )}
            </Pressable>
          </Animated.View>
        )}
      />
    </Animated.View>
  );
}

const makeStyles = ({ colors }: Theme) => ({
  container: {
    marginVertical: spacing.lg,
  },
  sectionTitle: {
    color: colors.text.primary,
    fontFamily: typography.family.bold,
    fontSize: typography.size.xl,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
  },
  itemContainer: {
    width: ITEM_SIZE,
    marginRight: spacing.lg,
  },
  itemPressed: {
    opacity: 0.75,
  },
  image: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    marginBottom: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface[300],
  },
  circularImage: {
    borderRadius: ITEM_SIZE / 2,
  },
  itemTitle: {
    color: colors.text.primary,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.sm,
    marginBottom: 2,
  },
  itemSubtitle: {
    color: colors.text.secondary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.xs,
  },
});
