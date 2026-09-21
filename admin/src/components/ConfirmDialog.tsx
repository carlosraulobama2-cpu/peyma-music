import { useEffect } from 'react';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Confirmación para acciones destructivas — nunca se borra con un solo clic. */
export function ConfirmDialog({ title, message, confirmLabel, isSubmitting, onCancel, onConfirm }: ConfirmDialogProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onCancel}
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-white/10 bg-surface-raised p-6 shadow-2xl"
      >
        <h2 className="text-lg font-bold">{title}</h2>
        <p className="mt-2 text-sm text-muted">{message}</p>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={isSubmitting}
            className="rounded-full px-4 py-2 text-sm font-semibold text-muted transition-colors hover:text-foreground disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={isSubmitting}
            className="rounded-full bg-danger px-5 py-2 text-sm font-bold text-black transition-all duration-300 ease-in-out hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
          >
            {isSubmitting ? 'Eliminando…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
