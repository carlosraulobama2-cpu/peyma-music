"use client";

import { useState } from "react";
import { http } from "../lib/httpClient";
import type { CatalogTrack } from "../lib/catalog";

/**
 * Denunciar una canción.
 *
 * Los motivos están duplicados aquí y en el backend a propósito: el backend
 * es quien valida (no se puede confiar en el cliente) y esta lista es sólo
 * la etiqueta visible. Hay un endpoint `/reports/reasons` que los sirve, pero
 * pedirlos para abrir un diálogo añadiría una espera visible a cambio de
 * nada — son siete valores que cambian una vez al año.
 */

const REASONS = [
  { value: "PLAGIARISM", label: "Plagio de otra obra", needsDetails: true },
  { value: "COPYRIGHT", label: "Soy el titular de los derechos", needsDetails: true },
  { value: "EXPLICIT_CONTENT", label: "Contenido explícito sin marcar", needsDetails: false },
  { value: "HATE_SPEECH", label: "Incitación al odio", needsDetails: false },
  { value: "MISLEADING_METADATA", label: "Título, artista o portada falsos", needsDetails: false },
  { value: "LOW_QUALITY", label: "El audio está roto o es el archivo equivocado", needsDetails: false },
  { value: "OTHER", label: "Otro motivo", needsDetails: true },
] as const;

const MIN_DETAILS = 10;

interface ReportTrackModalProps {
  track: CatalogTrack;
  onClose: () => void;
}

export function ReportTrackModal({ track, onClose }: ReportTrackModalProps) {
  const [reason, setReason] = useState<(typeof REASONS)[number]["value"]>("PLAGIARISM");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const selected = REASONS.find((r) => r.value === reason)!;
  const detailsTooShort = selected.needsDetails && details.trim().length < MIN_DETAILS;

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await http.post("/reports", { trackId: track.id, reason, details: details.trim() || undefined });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar la denuncia.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center px-4">
      <button type="button" aria-label="Cerrar" onClick={onClose} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Denunciar ${track.title}`}
        className="relative w-full max-w-md rounded-xl border border-white/15 bg-surface p-6 shadow-2xl"
      >
        {sent ? (
          <>
            <h2 className="text-lg font-bold">Denuncia enviada</h2>
            <p className="mt-2 text-sm text-muted">
              Un moderador va a revisar &ldquo;{track.title}&rdquo;. Si procede, la canción se retira del catálogo.
            </p>
            <button
              onClick={onClose}
              className="mt-6 w-full rounded-full bg-brand py-3 text-sm font-bold text-black transition-colors hover:bg-brand-hover"
            >
              Cerrar
            </button>
          </>
        ) : (
          <>
            <h2 className="text-lg font-bold">Denunciar esta canción</h2>
            <p className="mt-1 truncate text-sm text-muted">
              {track.title} — {track.artist.name}
            </p>

            <fieldset className="mt-5 flex flex-col gap-1.5">
              <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Motivo</legend>
              {REASONS.map((option) => (
                <label
                  key={option.value}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                    reason === option.value ? "bg-white/10" : "hover:bg-white/5"
                  }`}
                >
                  <input
                    type="radio"
                    name="reason"
                    value={option.value}
                    checked={reason === option.value}
                    onChange={() => setReason(option.value)}
                    className="accent-brand"
                  />
                  {option.label}
                </label>
              ))}
            </fieldset>

            <label className="mt-4 flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
              Explicación {selected.needsDetails ? "(obligatoria)" : "(opcional)"}
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                rows={3}
                maxLength={1500}
                placeholder={
                  selected.needsDetails
                    ? "Decinos de qué obra se trata y por qué. Sin esto no se puede revisar."
                    : "Cualquier detalle que ayude a revisarlo"
                }
                className="rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm font-normal normal-case tracking-normal text-foreground outline-none focus:border-brand"
              />
            </label>

            {error && (
              <p role="alert" className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">
                {error}
              </p>
            )}

            <div className="mt-5 flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 rounded-full border border-white/25 py-3 text-sm font-semibold transition-colors hover:border-white"
              >
                Cancelar
              </button>
              <button
                onClick={submit}
                disabled={submitting || detailsTooShort}
                title={detailsTooShort ? `Escribí al menos ${MIN_DETAILS} caracteres` : undefined}
                className="flex-1 rounded-full bg-danger py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {submitting ? "Enviando…" : "Enviar denuncia"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
