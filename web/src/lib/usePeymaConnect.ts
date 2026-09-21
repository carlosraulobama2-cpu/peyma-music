"use client";

import { useEffect } from "react";
import { usePlayerStore } from "../store/usePlayerStore";
import { getSocket, emitState, requestSync, type PlayerCommand, type RemotePlayerState } from "./socketService";

/**
 * Peyma Connect del lado web: escucha los eventos de los otros dispositivos
 * del usuario y refleja los cambios locales hacia ellos.
 *
 * Todo lo que entra se aplica dentro de `applyRemote()`, que levanta la
 * bandera `isRemoteCommand`; el efecto que emite estado la consulta antes de
 * mandar nada, así un cambio que vino de la red no se reenvía y no se forma
 * un bucle entre dos dispositivos.
 */
export function usePeymaConnect(): void {
  const applyRemote = usePlayerStore((s) => s.applyRemote);
  const setRemoteDeviceName = usePlayerStore((s) => s.setRemoteDeviceName);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onCommand = (command: PlayerCommand) => {
      const store = usePlayerStore.getState();
      applyRemote(() => {
        switch (command.type) {
          case "PLAY":
            if (!store.isPlaying) store.togglePlay();
            break;
          case "PAUSE":
            if (store.isPlaying) store.togglePlay();
            break;
          case "SEEK":
            if (typeof command.positionMs === "number") store.seekTo(command.positionMs / 1000);
            break;
          case "SKIP_NEXT":
            store.next();
            break;
          case "SKIP_PREVIOUS":
            store.previous();
            break;
          case "CHANGE_VOLUME":
            if (typeof command.volume === "number") store.setVolume(command.volume);
            break;
        }
      });
    };

    const onStateChange = (state: RemotePlayerState) => {
      // Sólo se registra qué dispositivo está sonando; no se fuerza la
      // reproducción local (eso sería "Connect" completo, y necesitaría
      // resolver a quién le toca ser el dispositivo activo).
      setRemoteDeviceName(state.isPlaying ? state.deviceName : null);
    };

    const onDeviceLeft = () => setRemoteDeviceName(null);

    socket.on("player:command", onCommand);
    socket.on("player:state-change", onStateChange);
    socket.on("devices:left", onDeviceLeft);
    socket.on("devices:request-sync", () => {
      const store = usePlayerStore.getState();
      if (!store.currentTrack) return;
      emitState({
        trackId: store.currentTrack.id,
        positionMs: Math.floor(store.progress * 1000),
        isPlaying: store.isPlaying,
        volume: store.volume,
        timestamp: Date.now(),
      });
    });

    requestSync();

    return () => {
      socket.off("player:command", onCommand);
      socket.off("player:state-change", onStateChange);
      socket.off("devices:left", onDeviceLeft);
      socket.off("devices:request-sync");
    };
  }, [applyRemote, setRemoteDeviceName]);

  // Refleja los cambios locales hacia los otros dispositivos — salvo cuando
  // el cambio vino justamente de ellos.
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const volume = usePlayerStore((s) => s.volume);

  useEffect(() => {
    if (usePlayerStore.getState().isRemoteCommand) return;
    if (!currentTrack) return;
    emitState({
      trackId: currentTrack.id,
      positionMs: Math.floor(usePlayerStore.getState().progress * 1000),
      isPlaying,
      volume,
      timestamp: Date.now(),
    });
  }, [currentTrack, isPlaying, volume]);
}
