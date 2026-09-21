"use client";

import { useToastStore } from "../store/useToastStore";

const VARIANT_STYLES: Record<string, string> = {
  info: "bg-surface-raised text-foreground",
  success: "bg-brand text-black",
  error: "bg-danger text-black",
};

/**
 * Pila de avisos flotantes sobre el player deck. `aria-live="polite"` para
 * que un lector de pantalla anuncie el mensaje sin interrumpir lo que esté
 * leyendo en ese momento.
 */
export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-[110px] left-1/2 z-[1000] flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={`pointer-events-auto rounded-full px-5 py-2.5 text-sm font-semibold shadow-2xl transition-all duration-300 ease-in-out hover:scale-105 ${VARIANT_STYLES[t.variant]}`}
        >
          {t.message}
        </button>
      ))}
    </div>
  );
}
