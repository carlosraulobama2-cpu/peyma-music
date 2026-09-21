"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { CoverImage } from "./CoverImage";
import type { CatalogTrack } from "../lib/catalog";

interface CreditsModalProps {
  track: CatalogTrack;
  onClose: () => void;
}

interface CreditRow {
  label: string;
  value: string | null | undefined;
}

/**
 * Modal de créditos. Sólo muestra los campos que existen de verdad en la
 * base: si una pista no tiene compositor o sello cargados, esa fila
 * desaparece en vez de rellenarse con "Desconocido".
 */
export function CreditsModal({ track, onClose }: CreditsModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const rows: CreditRow[] = [
    { label: "Interpretada por", value: track.artist.name },
    { label: "Compuesta por", value: track.composer },
    { label: "Producida por", value: track.producer },
    { label: "Sello", value: track.label },
    { label: "Álbum", value: track.album.title },
    { label: "ISRC", value: track.isrc },
  ];
  const present = rows.filter((r) => r.value);

  return createPortal(
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Créditos de ${track.title}`}
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-white/10 bg-surface-raised p-6 shadow-2xl"
      >
        <div className="flex items-start gap-4">
          <CoverImage src={track.coverUrl} alt={track.title} size={64} rounded="rounded-md" glow={false} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-bold">{track.title}</h2>
            <p className="truncate text-sm text-muted">{track.artist.name}</p>
            {track.isExplicit && (
              <span className="mt-1 inline-block rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-bold" title="Contenido explícito">
                E
              </span>
            )}
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="text-muted transition-colors hover:text-foreground">
            ✕
          </button>
        </div>

        <dl className="mt-6 flex flex-col gap-3">
          {present.map((row) => (
            <div key={row.label} className="flex flex-col">
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{row.label}</dt>
              <dd className={`text-sm ${row.label === "ISRC" ? "font-mono" : "font-semibold"}`}>{row.value}</dd>
            </div>
          ))}
        </dl>

        {present.length <= 2 && (
          <p className="mt-5 text-xs text-muted">Esta pista todavía no tiene créditos completos cargados.</p>
        )}
      </div>
    </div>,
    document.body,
  );
}
