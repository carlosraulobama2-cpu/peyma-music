/**
 * Peyma Music — Toast Store (Zustand)
 * Cola de notificaciones efímeras. No se persiste: es puramente de sesión.
 */
import { create } from 'zustand';

export type ToastVariant = 'info' | 'success' | 'error';

export interface ToastMessage {
  id: number;
  text: string;
  variant: ToastVariant;
  durationMs: number;
}

interface ToastStore {
  current: ToastMessage | null;
  queue: ToastMessage[];
  show: (text: string, variant?: ToastVariant, durationMs?: number) => void;
  dismissCurrent: () => void;
}

let nextId = 1;

export const useToastStore = create<ToastStore>((set, get) => ({
  current: null,
  queue: [],

  show: (text, variant = 'info', durationMs = 3000) => {
    const message: ToastMessage = { id: nextId++, text, variant, durationMs };
    const { current, queue } = get();
    if (current) {
      set({ queue: [...queue, message] });
    } else {
      set({ current: message });
    }
  },

  dismissCurrent: () => {
    const { queue } = get();
    const [next, ...rest] = queue;
    set({ current: next ?? null, queue: rest });
  },
}));

/** Atajo para disparar toasts desde fuera de componentes (stores, servicios). */
export const toast = {
  info: (text: string) => useToastStore.getState().show(text, 'info'),
  success: (text: string) => useToastStore.getState().show(text, 'success'),
  error: (text: string) => useToastStore.getState().show(text, 'error'),
};
