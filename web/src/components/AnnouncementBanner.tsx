"use client";

import { useEffect, useState } from "react";
import { http } from "../lib/httpClient";

const DISMISSED_KEY = "peyma-announcement-dismissed";

/**
 * Banner informativo, configurable desde el panel (Ajustes → Anuncio) sin
 * desplegar código — a diferencia del modo mantenimiento, éste NO bloquea
 * nada: es para "hay una función nueva" o "el sábado habrá una pausa
 * programada", no para cortar la app.
 *
 * Se recuerda cerrado por MENSAJE (la clave incluye el texto), no en
 * general: si el admin cambia el mensaje, es un aviso distinto y merece
 * mostrarse de nuevo aunque alguien haya cerrado el anterior.
 */
export function AnnouncementBanner() {
  const [message, setMessage] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    http
      .get<{ enabled: boolean; message: string }>("/config/announcement")
      .then((res) => {
        if (cancelled || !res.enabled) return;
        setMessage(res.message);
        try {
          setDismissed(sessionStorage.getItem(DISMISSED_KEY) === res.message);
        } catch {
          // Sin storage disponible, se muestra igual — sólo se pierde el "recordar cerrado".
        }
      })
      .catch(() => {
        // Un anuncio que no cargó no es un error que deba interrumpir nada.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!message || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISSED_KEY, message);
    } catch {
      // Se cierra igual para esta sesión, aunque no se recuerde entre pestañas nuevas.
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-center gap-3 bg-brand/15 px-4 py-2 text-center text-sm font-semibold text-brand">
      <span>{message}</span>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Cerrar aviso"
        className="rounded-full bg-brand/20 px-2.5 py-0.5 text-xs font-bold transition-colors hover:bg-brand/30"
      >
        ✕
      </button>
    </div>
  );
}
