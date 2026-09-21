"use client";

import { useEffect, useState } from "react";
import { fetchNotifications, markAllNotificationsRead, type UserNotification } from "../lib/library";

/**
 * Campana de notificaciones.
 *
 * Sondea cada 60 segundos. Es un intervalo y no un WebSocket a propósito:
 * el socket que ya existe es el de sincronía del reproductor (Peyma
 * Connect) y meterle un canal de avisos mezclaría dos responsabilidades
 * distintas en el mismo sitio. Un aviso que tarda hasta un minuto en
 * aparecer no molesta a nadie; un socket mal compartido sí.
 */

const POLL_MS = 60_000;

const ICONS: Record<string, string> = {
  TRACK_APPROVED: "✓",
  TRACK_REJECTED: "✕",
  TRACK_TAKEDOWN: "⚠",
  ARTIST_VERIFIED: "★",
  PROMOTION_APPROVED: "📣",
  PROMOTION_REJECTED: "📣",
  NEW_FOLLOWER: "＋",
  SYSTEM: "ℹ",
};

function relativeTime(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? "ayer" : `hace ${days} días`;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<UserNotification[]>([]);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      fetchNotifications()
        .then((res) => {
          if (cancelled) return;
          setItems(res.notifications);
          setUnread(res.unread);
        })
        // Sin sesión o sin red: la campana simplemente no muestra nada. No
        // tiene sentido molestar con un error por esto.
        .catch(() => {});
    };

    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    // Al abrir se marcan como leídas: el usuario ya las vio. El contador se
    // baja aquí sin esperar al servidor para que la respuesta sea inmediata.
    if (next && unread > 0) {
      setUnread(0);
      void markAllNotificationsRead().catch(() => {});
    }
  };

  return (
    <div className="relative">
      <button
        onClick={toggle}
        aria-label={unread > 0 ? `Notificaciones (${unread} sin leer)` : "Notificaciones"}
        className="relative flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-sm transition-colors hover:bg-white/20"
      >
        🔔
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-black">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Capa invisible: un clic fuera cierra el panel. Es un botón y no
              un div con onClick para que también funcione con teclado. */}
          <button aria-label="Cerrar notificaciones" onClick={() => setOpen(false)} className="fixed inset-0 z-40 cursor-default" />

          <div className="absolute right-0 top-11 z-50 w-80 overflow-hidden rounded-xl border border-white/15 bg-surface-raised shadow-2xl">
            <p className="border-b border-white/10 px-4 py-3 text-sm font-bold">Notificaciones</p>

            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted">
                Sin novedades. Te avisamos cuando aprobemos una de tus canciones.
              </p>
            ) : (
              <ul className="max-h-96 overflow-y-auto">
                {items.map((item) => (
                  <li key={item.id} className="border-b border-white/5 px-4 py-3 last:border-0">
                    <p className="flex items-start gap-2 text-sm font-semibold">
                      <span aria-hidden className="text-brand">
                        {ICONS[item.kind] ?? "•"}
                      </span>
                      {item.title}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">{item.body}</p>
                    <p className="mt-1 text-[11px] text-muted">{relativeTime(item.createdAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
