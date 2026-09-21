"use client";

import { create } from "zustand";

export interface Toast {
  id: string;
  message: string;
  variant: "info" | "success" | "error";
}

interface ToastStore {
  toasts: Toast[];
  show: (message: string, variant?: Toast["variant"]) => void;
  dismiss: (id: string) => void;
}

const AUTO_DISMISS_MS = 3000;

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],

  show: (message, variant = "info") => {
    const id = crypto.randomUUID();
    set((state) => ({ toasts: [...state.toasts, { id, message, variant }] }));
    // El auto-cierre vive acá y no en el componente: así un toast sigue su
    // ciclo aunque quien lo disparó se desmonte (p. ej. al navegar).
    setTimeout(() => get().dismiss(id), AUTO_DISMISS_MS);
  },

  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

/** Atajo para usar fuera de componentes (stores, handlers) sin hooks. */
export const toast = {
  info: (message: string) => useToastStore.getState().show(message, "info"),
  success: (message: string) => useToastStore.getState().show(message, "success"),
  error: (message: string) => useToastStore.getState().show(message, "error"),
};
