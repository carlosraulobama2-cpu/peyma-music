"use client";

import { useEffect } from "react";
import { usePlayerStore } from "../store/usePlayerStore";

const SEEK_STEP_SECONDS = 5;

/**
 * Atajos globales del reproductor. Se ignoran mientras el foco está en un
 * input/textarea (si no, escribir "q" en el buscador abriría la cola) y
 * cuando hay modificadores, para no pisar atajos del navegador.
 */
export function useKeyboardShortcuts(onToggleQueue: () => void): void {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable;
      if (isTyping || event.ctrlKey || event.metaKey || event.altKey) return;

      const store = usePlayerStore.getState();
      if (!store.currentTrack) return;

      switch (event.key) {
        case " ":
          event.preventDefault();
          store.togglePlay();
          break;
        case "m":
        case "M":
          event.preventDefault();
          store.setVolume(store.volume > 0 ? 0 : 0.8);
          break;
        case "q":
        case "Q":
          event.preventDefault();
          onToggleQueue();
          break;
        case "ArrowRight":
          event.preventDefault();
          store.seekTo(store.progress + SEEK_STEP_SECONDS);
          break;
        case "ArrowLeft":
          event.preventDefault();
          store.seekTo(store.progress - SEEK_STEP_SECONDS);
          break;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onToggleQueue]);
}
