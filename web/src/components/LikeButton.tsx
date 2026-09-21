"use client";

import { useState } from "react";
import { http } from "../lib/httpClient";

interface LikeButtonProps {
  trackId: string;
  initialLiked?: boolean;
}

/**
 * Actualización optimista: el corazón cambia al instante y sólo se revierte
 * si la API rechaza. El backend devuelve el estado final (`liked`), así que
 * ante desincronización manda su respuesta, no la suposición local.
 */
export function LikeButton({ trackId, initialLiked = false }: LikeButtonProps) {
  const [liked, setLiked] = useState(initialLiked);
  const [pending, setPending] = useState(false);

  const handleClick = async (event: React.MouseEvent) => {
    event.stopPropagation();
    if (pending) return;

    const optimistic = !liked;
    setLiked(optimistic);
    setPending(true);
    try {
      const { liked: confirmed } = await http.post<{ liked: boolean }>(`/tracks/${trackId}/like`);
      setLiked(confirmed);
    } catch {
      setLiked(!optimistic);
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      aria-label={liked ? "Quitar de me gusta" : "Añadir a me gusta"}
      aria-pressed={liked}
      className={`flex-shrink-0 text-lg transition-all duration-300 ease-in-out hover:scale-110 ${
        liked ? "text-brand" : "text-muted hover:text-foreground"
      }`}
    >
      {liked ? "♥" : "♡"}
    </button>
  );
}
