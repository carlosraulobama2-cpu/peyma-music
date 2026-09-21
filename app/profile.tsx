import type { ReactNode } from 'react';
import { View, Text, ScrollView, Pressable, Alert, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore, useLibraryStore, useArtistStore, useSettingsStore, AUDIO_QUALITY_LABEL } from '../src/store';
import { Button, ThemeToggle, AppBar, AvatarPicker } from '../src/components';
import { useTheme, useThemedStyles, spacing, typography, type Theme } from '../src/theme';
import { getInitials } from '../src/utils';

interface NavigationSettingItem {
  kind: 'nav';
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress: () => void;
  /** Muestra el chevron ">" — sólo para filas que de verdad navegan a otro sitio. */
  navigable?: boolean;
}

interface CustomSettingItem {
  kind: 'custom';
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  render: () => ReactNode;
}

type SettingItem = NavigationSettingItem | CustomSettingItem;

export default function ProfileSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const updateUser = useAuthStore((s) => s.updateUser);
  const followedArtistCount = useLibraryStore((s) => s.followedArtistIds.length);
  const artistProfile = useArtistStore((s) => s.profile);

  const audioQuality = useSettingsStore((s) => s.audioQuality);
  const cycleAudioQuality = useSettingsStore((s) => s.cycleAudioQuality);
  const notificationsEnabled = useSettingsStore((s) => s.notificationsEnabled);
  const toggleNotifications = useSettingsStore((s) => s.toggleNotifications);
  const downloadOnWifiOnly = useSettingsStore((s) => s.downloadOnWifiOnly);
  const toggleDownloadOnWifiOnly = useSettingsStore((s) => s.toggleDownloadOnWifiOnly);

  const handleLogout = () => {
    Alert.alert('Cerrar sesión', '¿Estás seguro de que quieres cerrar sesión?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cerrar sesión',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/login');
        },
      },
    ]);
  };

  if (!user) return null;

  const initials = getInitials(user.displayName);
  const isArtist = user.accountType === 'artist';

  const sections: { title: string; items: SettingItem[] }[] = [
    {
      title: 'Cuenta',
      items: [
        { kind: 'nav', icon: 'person', label: 'Nombre', value: user.displayName, onPress: () => {} },
        { kind: 'nav', icon: 'mail', label: 'Correo', value: user.email, onPress: () => {} },
        {
          kind: 'nav',
          icon: 'musical-note',
          label: 'Géneros favoritos',
          value: user.favoriteGenres.join(', ') || 'Ninguno',
          onPress: () => {},
        },
        {
          kind: 'nav',
          icon: 'people',
          label: 'Artistas que sigues',
          value: String(followedArtistCount),
          navigable: true,
          onPress: () => router.push('/(tabs)/library'),
        },
      ],
    },
    {
      title: 'Cuenta de artista',
      items: isArtist
        ? [
            {
              kind: 'nav',
              icon: 'mic',
              label: 'Panel de artista',
              value: artistProfile?.name,
              navigable: true,
              onPress: () => router.push('/(tabs)/studio'),
            },
            {
              kind: 'nav',
              icon: 'create-outline',
              label: 'Editar perfil de artista',
              navigable: true,
              onPress: () => router.push('/studio/edit-profile'),
            },
          ]
        : [
            {
              kind: 'nav',
              icon: 'mic-outline',
              label: 'Convertirme en artista',
              navigable: true,
              onPress: () => router.push('/studio/become-artist'),
            },
          ],
    },
    {
      title: 'Preferencias',
      items: [
        { kind: 'custom', icon: 'moon', label: 'Apariencia', render: () => <ThemeToggle /> },
        {
          kind: 'nav',
          icon: 'volume-high',
          label: 'Calidad de audio',
          value: AUDIO_QUALITY_LABEL[audioQuality],
          onPress: cycleAudioQuality,
        },
        {
          kind: 'custom',
          icon: 'notifications',
          label: 'Notificaciones',
          render: () => (
            <Switch
              value={notificationsEnabled}
              onValueChange={toggleNotifications}
              trackColor={{ false: colors.surface[400], true: colors.brand[500] }}
              thumbColor={colors.text.primary}
            />
          ),
        },
        {
          kind: 'nav',
          icon: 'download',
          label: 'Descargas',
          value: downloadOnWifiOnly ? 'Solo WiFi' : 'Siempre',
          onPress: toggleDownloadOnWifiOnly,
        },
      ],
    },
    {
      title: 'Legal',
      items: [
        { kind: 'nav', icon: 'document-text', label: 'Términos de servicio', navigable: true, onPress: () => router.push('/legal/terms') },
        { kind: 'nav', icon: 'lock-closed', label: 'Privacidad', navigable: true, onPress: () => router.push('/legal/privacy') },
        { kind: 'nav', icon: 'information-circle', label: 'Acerca de', value: '1.0.0', navigable: true, onPress: () => router.push('/legal/about') },
      ],
    },
  ];

  return (
    <View style={styles.container}>
      <AppBar title="Perfil" leftAction={{ icon: 'chevron-back', onPress: () => router.back() }} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + spacing['4xl'] }]}
      >
        <View style={styles.profileSection}>
          <AvatarPicker
            avatarUrl={user.avatarUrl ?? null}
            initials={initials}
            size={96}
            // El servidor ya guardó la URL; esto sólo refresca la copia local
            // para que la foto nueva se vea sin recargar la pantalla.
            onUploaded={(url) => updateUser({ avatarUrl: url })}
          />
          <Text style={styles.profileName}>{user.displayName}</Text>
          <Text style={styles.profileEmail}>{user.email}</Text>
          {isArtist && (
            <View style={styles.artistBadge}>
              <Ionicons name="mic" size={12} color={colors.text.onBrand} />
              <Text style={styles.artistBadgeText}>Cuenta de artista</Text>
            </View>
          )}
        </View>

        {sections.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.items.map((item) => (
              <View key={item.label} style={styles.settingItem}>
                <Ionicons name={item.icon} size={22} color={colors.text.secondary} style={styles.settingIcon} />
                <Text style={styles.settingLabel}>{item.label}</Text>
                {item.kind === 'custom' ? (
                  item.render()
                ) : (
                  <Pressable onPress={item.onPress} accessibilityRole="button" style={styles.settingValueRow}>
                    {item.value && (
                      <Text style={styles.settingValue} numberOfLines={1}>
                        {item.value}
                      </Text>
                    )}
                    {item.navigable && <Ionicons name="chevron-forward" size={18} color={colors.text.secondary} />}
                  </Pressable>
                )}
              </View>
            ))}
          </View>
        ))}

        <View style={styles.footer}>
          <Button title="Cerrar sesión" onPress={handleLogout} variant="secondary" fullWidth />
        </View>
      </ScrollView>
    </View>
  );
}

const makeStyles = ({ colors }: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: colors.surface[50],
  },
  scrollContent: {
    paddingBottom: spacing['4xl'],
  },
  profileSection: {
    alignItems: 'center' as const,
    paddingVertical: spacing['2xl'],
    borderBottomWidth: 1,
    borderBottomColor: colors.surface[300],
    marginBottom: spacing['2xl'],
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: spacing.md,
    backgroundColor: colors.brand[500],
  },
  avatarText: {
    color: colors.text.onBrand,
    fontFamily: typography.family.bold,
    fontSize: typography.size.xl,
  },
  profileName: {
    color: colors.text.primary,
    fontFamily: typography.family.bold,
    fontSize: typography.size.lg,
  },
  profileEmail: {
    color: colors.text.secondary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.sm,
    marginTop: spacing.xs,
  },
  artistBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.xs,
    backgroundColor: colors.brand[500],
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    marginTop: spacing.md,
  },
  artistBadgeText: {
    color: colors.text.onBrand,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.xs,
  },
  section: {
    marginBottom: spacing['3xl'],
    paddingHorizontal: spacing.lg,
  },
  sectionTitle: {
    color: colors.text.secondary,
    fontFamily: typography.family.medium,
    fontSize: typography.size.xs,
    marginBottom: spacing.md,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  settingItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  settingIcon: {
    width: 26,
  },
  settingLabel: {
    flex: 1,
    color: colors.text.primary,
    fontFamily: typography.family.medium,
    fontSize: typography.size.base,
  },
  settingValueRow: {
    maxWidth: 180,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.xs,
  },
  settingValue: {
    color: colors.text.secondary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.sm,
    textAlign: 'right' as const,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
});
