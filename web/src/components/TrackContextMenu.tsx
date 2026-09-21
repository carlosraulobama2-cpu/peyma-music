"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { usePlayerStore } from "../store/usePlayerStore";
import { toast } from "../store/useToastStore";
import type { CatalogTrack } from "../lib/catalog";

interface TrackContextMenuProps {
  track: CatalogTrack;
  x: number;
  y: number;
  onClose: () => void;
  /** Lo maneja el padre: el menú se cierra al elegir, así que no puede sostener el modal. */
  onShowCredits: (track: CatalogTrack) => void;
  onReport: (track: CatalogTrack) => void;
}

const MENU_WIDTH = 220;
const MENU_HEIGHT = 190;

/**
 * Menú de click derecho sobre una canción.
 *
 * Se renderiza con `createPortal` en `document.body` y NO dentro de la fila:
 * las listas tienen `overflow` y apilamiento propio, así que un menú anidado
 * quedaría recortado o por debajo de otros elementos.
 */
export function TrackContextMenu({ track, x, y, onClose, onShowCredits, onReport }: TrackContextMenuProps) {
  const router = useRouter();
  const addToQueue = usePlayerStore((s) => s.addToQueue);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // `document` no existe durante el render en servidor.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- montaje en cliente para poder usar el portal
    setMounted(true);
  }, []);

  useEffect(() => {
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    // `click` en captura: cualquier click fuera cierra, incluso sobre otros controles.
    window.addEventListener("click", close);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  if (!mounted) return null;

  // Si el menú se saldría por el borde, se abre hacia el lado contrario.
  const left = Math.min(x, window.innerWidth - MENU_WIDTH - 8);
  const top = Math.min(y, window.innerHeight - MENU_HEIGHT - 8);

  const items: { label: string; onSelect: () => void; danger?: boolean }[] = [
    {
      label: "Añadir a la cola",
      onSelect: () => {
        addToQueue(track);
        toast.success(`"${track.title}" se añadió a la cola`);
      },
    },
    { label: "Ir al artista", onSelect: () => router.push(`/artists/${track.artist.id}`) },
    {
      label: "Copiar enlace",
      onSelect: () => {
        void navigator.clipboard
          .writeText(`${window.location.origin}/artists/${track.artist.id}`)
          .then(() => toast.info("Enlace copiado"))
          .catch(() => toast.error("No se pudo copiar el enlace"));
      },
    },
    { label: "Ver créditos", onSelect: () => onShowCredits(track) },
    { label: "Denunciar canción", onSelect: () => onReport(track), danger: true },
  ];

  return createPortal(
    <ul
      role="menu"
      style={{ left, top }}
      onClick={(e) => e.stopPropagation()}
      className="fixed z-[1000] w-[220px] overflow-hidden rounded-lg border border-white/10 bg-surface-raised py-1 shadow-2xl"
    >
      {items.map((item) => (
        <li key={item.label}>
          <button
            role="menuitem"
            onClick={() => {
              item.onSelect();
              onClose();
            }}
            className={`w-full px-4 py-2 text-left text-sm transition-colors hover:bg-white/10 ${item.danger ? "text-danger" : ""}`}
          >
            {item.label}
          </button>
        </li>
      ))}
    </ul>,
    document.body,
  );
}
