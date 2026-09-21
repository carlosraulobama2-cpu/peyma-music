import { useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  NOTIFICATION_ICONS,
  type ServerNotification,
} from '../src/services';
import { AppBar, EmptyState } from '../src/components';
import { useTheme, useThemedStyles, spacing, radius, typography, type Theme } from '../src/theme';

/**
 * Notificaciones.
 *
 * Antes esta pantalla INVENTABA los avisos a partir del estado local del
 * teléfono ("sigues a X artistas", "tu panel tiene Y reproducciones") para
 * que no se viera vacía. El resultado eran mensajes de cosas que el usuario
 * ya sabía, y silencio absoluto sobre lo único que importa: que un
 * administrador aprobó o rechazó su canción.
 *
 * Ahora vienen del servidor. Si no hay ninguna, se dice que no hay ninguna.
 */

/** Fecha relativa corta: "hace 3 h", "ayer". */
function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return 'ahora mismo';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'ayer' : `hace ${days} días`;
}

export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [notifications, setNotifications] = useState<ServerNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * `reloadKey` dispara la recarga en vez de llamar a una función que
   * escriba estado desde el efecto: así el efecto sólo SINCRONIZA con la
   * API y no arranca un render en cascada, que es lo que las reglas de
   * hooks señalan con razón.
   */
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    fetchNotifications()
      .then((res) => {
        if (cancelled) return;
        setNotifications(res.notifications);
        setError(null);

        // Se marcan como leídas al ABRIR la pantalla, no al tocar cada una:
        // el usuario ya las vio. Va después de pintarlas para que el
        // resaltado de "sin leer" alcance a verse.
        if (res.unread > 0) void markAllNotificationsRead();
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'No se pudieron cargar las notificaciones.');
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
        setRefreshing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  /** Lleva al contenido del aviso, si tiene destino. */
  const open = (item: ServerNotification) => {
    void markNotificationRead(item.id);
    if (item.targetType === 'track' && item.targetId) router.push(`/player/${item.targetId}`);
    else if (item.targetType === 'artist' && item.targetId) router.push(`/artist/${item.targetId}`);
  };

  return (
    <View style={styles.container}>
      <AppBar title="Notificaciones" leftAction={{ icon: 'chevron-back', onPress: () => router.back() }} />

      {error ? (
        <EmptyState icon="cloud-offline-outline" title="No se pudieron cargar" description={error} />
      ) : !loading && notifications.length === 0 ? (
        <EmptyState
          icon="notifications-outline"
          title="Sin novedades"
          description="Te avisamos cuando aprobemos una de tus canciones o pase algo con tu perfil."
        />
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing['4xl'] }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                setReloadKey((key) => key + 1);
              }}
              tintColor={colors.text.secondary}
            />
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => open(item)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.row, !item.readAt && styles.rowUnread, pressed && styles.rowPressed]}
            >
              <View style={styles.iconCircle}>
                <Ionicons name={NOTIFICATION_ICONS[item.kind]} size={20} color={colors.brand[500]} />
              </View>
              <View style={styles.rowContent}>
                <Text style={styles.rowTitle}>{item.title}</Text>
                <Text style={styles.rowBody}>{item.body}</Text>
                <Text style={styles.rowTime}>{relativeTime(item.createdAt)}</Text>
              </View>
              {!item.readAt && <View style={styles.unreadDot} />}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const makeStyles = ({ colors }: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: colors.surface[50],
  },
  list: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.xs,
  },
  rowUnread: {
    backgroundColor: colors.surface[200],
  },
  rowPressed: {
    opacity: 0.7,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: colors.surface[300],
  },
  rowContent: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    color: colors.text.primary,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.base,
  },
  rowBody: {
    color: colors.text.secondary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.sm,
    lineHeight: 19,
  },
  rowTime: {
    color: colors.text.muted,
    fontFamily: typography.family.regular,
    fontSize: typography.size.xs,
    marginTop: 2,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
    backgroundColor: colors.brand[500],
  },
});
