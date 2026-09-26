"use client";

import { useCallback, useEffect, useState } from "react";
import { usePlayerStore } from "../store/usePlayerStore";
import { fetchNowPlaying, isRadioTrack, RADIO_TRACK_ID_PREFIX } from "./radioApi";

const POLL_MS = 20_000;

/**
 * "Sonando ahora" de la radio en curso, si la hay y si la estación anuncia
 * metadata ICY. Sondea cada 20 s en vez de pedirlo una sola vez: es lo único
 * que puede cambiar sin que cambie `currentTrack` (la estación sigue siendo
 * la misma pista, pero la canción que suena adentro va cambiando sola).
 */
export function useRadioNowPlaying(): string | null {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const [title, setTitle] = useState<string | null>(null);

  const stationId = currentTrack && isRadioTrack(currentTrack) ? currentTrack.id.slice(RADIO_TRACK_ID_PREFIX.length) : null;
  const streamUrl = currentTrack?.audioUrl ?? null;

  const poll = useCallback((id: string, url: string, cancelledRef: { current: boolean }) => {
    fetchNowPlaying(id, url).then((result) => {
      if (!cancelledRef.current) setTitle(result);
    });
  }, []);

  useEffect(() => {
    if (!stationId || !streamUrl) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTitle(null);
      return;
    }

    const cancelledRef = { current: false };
    poll(stationId, streamUrl, cancelledRef);
    const interval = setInterval(() => poll(stationId, streamUrl, cancelledRef), POLL_MS);
    return () => {
      cancelledRef.current = true;
      clearInterval(interval);
    };
  }, [stationId, streamUrl, poll]);

  return title;
}
