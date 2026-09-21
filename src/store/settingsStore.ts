/**
 * Peyma Music — Settings Store (Zustand)
 * Preferencias de reproducción y notificaciones, persistidas en el dispositivo.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type AudioQuality = 'normal' | 'high' | 'very_high';

export const AUDIO_QUALITY_LABEL: Record<AudioQuality, string> = {
  normal: 'Normal (96 kbps)',
  high: 'Alta (160 kbps)',
  very_high: 'Muy alta (320 kbps)',
};

const AUDIO_QUALITY_CYCLE: AudioQuality[] = ['normal', 'high', 'very_high'];

interface SettingsStore {
  audioQuality: AudioQuality;
  notificationsEnabled: boolean;
  downloadOnWifiOnly: boolean;

  cycleAudioQuality: () => void;
  toggleNotifications: () => void;
  toggleDownloadOnWifiOnly: () => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      audioQuality: 'high',
      notificationsEnabled: true,
      downloadOnWifiOnly: true,

      cycleAudioQuality: () => {
        const currentIndex = AUDIO_QUALITY_CYCLE.indexOf(get().audioQuality);
        const next = AUDIO_QUALITY_CYCLE[(currentIndex + 1) % AUDIO_QUALITY_CYCLE.length];
        set({ audioQuality: next });
      },

      toggleNotifications: () => set((state) => ({ notificationsEnabled: !state.notificationsEnabled })),
      toggleDownloadOnWifiOnly: () => set((state) => ({ downloadOnWifiOnly: !state.downloadOnWifiOnly })),
    }),
    {
      name: 'peyma-settings',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
