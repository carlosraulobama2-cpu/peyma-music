"use client";

import { useEffect, useState } from "react";
import { onMaintenance } from "../lib/httpClient";

/**
 * Pantalla bloqueante de mantenimiento.
 *
 * Se monta en el layout raíz y escucha al cliente HTTP: en cuanto CUALQUIER
 * petición devuelve 503 con `maintenance_mode`, cubre la pantalla. Así no
 * hace falta que cada página compruebe el estado por su cuenta, ni sondear
 * un endpoint "por si acaso".
 *
 * Reintenta sola cada 30 segundos y se quita cuando la API vuelve. Dejar al
 * usuario recargando a mano sería cargarle a él el trabajo de adivinar
 * cuándo volvimos.
 */

const RETRY_MS = 30_000;

export function MaintenanceScreen() {
  const [message, setMessage] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => onMaintenance(setMessage), []);

  useEffect(() => {
    if (!message) return;

    const check = async () => {
      setChecking(true);
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ""}/home`);
        // Cualquier respuesta que no sea 503 significa que ya volvimos.
        if (response.status !== 503) {
          setMessage(null);
          // Recarga completa: los datos que hubiera en memoria son de antes
          // del mantenimiento y pueden haber quedado obsoletos.
          window.location.reload();
        }
      } catch {
        // Sigue sin responder; se reintenta en el próximo ciclo.
      } finally {
        setChecking(false);
      }
    };

    const timer = setInterval(check, RETRY_MS);
    return () => clearInterval(timer);
  }, [message]);

  if (!message) return null;

  return (
    <div className="fixed inset-0 z-[2000] flex flex-col items-center justify-center gap-5 bg-background px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand/15">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2" aria-hidden>
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76Z" />
        </svg>
      </div>

      <h1 className="text-2xl font-extrabold">Estamos en mantenimiento</h1>
      <p className="max-w-md text-sm text-muted">{message}</p>

      <p className="text-xs text-muted">
        {checking ? "Comprobando…" : "Volvemos a comprobarlo cada 30 segundos."}
      </p>

      <button
        onClick={() => window.location.reload()}
        className="rounded-full bg-brand px-6 py-2.5 text-sm font-bold text-black transition-colors hover:bg-brand-hover"
      >
        Reintentar ahora
      </button>
    </div>
  );
}
