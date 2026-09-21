import { useState } from 'react';

interface ReasonModalProps {
  trackTitle: string;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}

export function ReasonModal({ trackTitle, isSubmitting, onCancel, onConfirm }: ReasonModalProps) {
  const [reason, setReason] = useState('');

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm" onClick={onCancel}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-white/10 bg-surface-raised p-6 shadow-2xl transition-all duration-300 ease-in-out"
      >
        <h2 className="text-lg font-bold">Rechazar pista</h2>
        <p className="mt-1 text-sm text-muted">
          Vas a rechazar <span className="font-semibold text-foreground">&ldquo;{trackTitle}&rdquo;</span>. El motivo se guarda junto a la
          revisión.
        </p>

        <textarea
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ej: calidad de audio insuficiente, contenido con derechos de autor…"
          rows={3}
          className="mt-4 w-full resize-none rounded-lg border border-white/15 bg-transparent px-3 py-2 text-sm outline-none transition-colors focus:border-white/40"
        />

        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={isSubmitting}
            className="rounded-full px-4 py-2 text-sm font-semibold text-muted transition-colors hover:text-foreground disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(reason.trim())}
            disabled={!reason.trim() || isSubmitting}
            className="rounded-full bg-danger px-5 py-2 text-sm font-bold text-black transition-all duration-300 ease-in-out hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
          >
            {isSubmitting ? 'Rechazando…' : 'Confirmar rechazo'}
          </button>
        </div>
      </div>
    </div>
  );
}
