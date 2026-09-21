/**
 * Peyma Music — Store root
 * Punto único de importación para todos los slices de Zustand.
 */
export { usePlayerStore, toTrackPlayerTrack } from './playerStore';
export { useAuthStore, AuthError } from './authStore';
export { useLibraryStore } from './libraryStore';
export { useThemeStore } from './themeStore';
export type { ThemePreference } from './themeStore';
export { useToastStore, toast } from './toastStore';
export type { ToastMessage, ToastVariant } from './toastStore';
export { useArtistStore } from './artistStore';
export { useSettingsStore, AUDIO_QUALITY_LABEL, type AudioQuality } from './settingsStore';
export { useSheetStore } from './sheetStore';
export { useUserBehaviorStore } from './userBehaviorStore';
