/**
 * Peyma Music — Theme Store (Zustand)
 * Guarda la preferencia del usuario ('system' incluido) con persistencia.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ThemeMode } from '../theme/tokens';

export type ThemePreference = ThemeMode | 'system';

interface ThemeStore {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  /** Alterna entre claro y oscuro explícitos (ignora 'system'). */
  toggleTheme: () => void;
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set, get) => ({
      preference: 'system',
      setPreference: (preference) => set({ preference }),
      toggleTheme: () =>
        set({ preference: get().preference === 'dark' ? 'light' : 'dark' }),
    }),
    {
      name: 'peyma-theme',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
