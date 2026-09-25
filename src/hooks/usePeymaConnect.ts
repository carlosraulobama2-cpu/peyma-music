/**
 * Peyma Music — Peyma Connect (app móvil)
 *
 * Contraparte de `web/src/lib/usePeymaConnect.ts`: escucha los comandos y
 * cambios de estado de los otros dispositivos de la cuenta, y refleja los
 * cambios locales hacia ellos. Antes de esto, `socketService.ts` definía
 * todo el protocolo pero nada en la app lo usaba — el reproductor móvil no
 * participaba de la sincronización aunque el backend y el cliente web sí.
 */
import { useEffect } from 'react';
import type { Socket } from 'socket.io-client';
import { usePlayerStore } from '../store/playerStore';
import { useAuthStore } from '../store/authStore';
import { connectSocket, emitState, requestSync, type PlayerCommand, type RemotePlayerState } from '../services/socketService';

export function usePeymaConnect(): void {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const applyRemote = usePlayerStore((s) => s.applyRemote);
  const setRemoteDeviceName = usePlayerStore((s) => s.setRemoteDeviceName);

  useEffect(() => {
    if (!isAuthenticated) return;

    let cancelled = false;
    let activeSocket: Socket | null = null;

    const onCommand = (command: PlayerCommand) => {
      const store = usePlayerStore.getState();
      applyRemote(async () => {
        switch (command.type) {
          case 'PLAY':
            if (!store.isPlaying) await store.resume();
            break;
          case 'PAUSE':
            if (store.isPlaying) await store.pause();
            break;
          case 'SEEK':
            if (typeof command.positionMs === 'number') await store.seekTo(command.positionMs / 1000);
            break;
          case 'SKIP_NEXT':
            await store.next();
            break;
          case 'SKIP_PREVIOUS':
            await store.previous();
            break;
          case 'CHANGE_VOLUME':
            if (typeof command.volume === 'number') await store.setVolume(command.volume);
            break;
        }
      });
    };

    // Sólo se registra qué dispositivo está sonando; no se fuerza la
    // reproducción local (eso sería "Connect" completo, y necesitaría
    // resolver a quién le toca ser el dispositivo activo) — igual que en la web.
    const onStateChange = (state: RemotePlayerState) => {
      setRemoteDeviceName(state.isPlaying ? state.deviceName : null);
    };

    const onDeviceLeft = () => setRemoteDeviceName(null);

    const onRequestSync = () => {
      const store = usePlayerStore.getState();
      if (!store.currentTrack) return;
      void emitState({
        trackId: store.currentTrack.id,
        positionMs: Math.floor(store.progress * 1000),
        isPlaying: store.isPlaying,
        volume: store.volume,
        timestamp: Date.now(),
      });
    };

    connectSocket().then((socket) => {
      if (cancelled || !socket) return;
      activeSocket = socket;

      socket.on('player:command', onCommand);
      socket.on('player:state-change', onStateChange);
      socket.on('devices:left', onDeviceLeft);
      socket.on('devices:request-sync', onRequestSync);

      void requestSync();
    });

    return () => {
      cancelled = true;
      activeSocket?.off('player:command', onCommand);
      activeSocket?.off('player:state-change', onStateChange);
      activeSocket?.off('devices:left', onDeviceLeft);
      activeSocket?.off('devices:request-sync', onRequestSync);
    };
  }, [isAuthenticated, applyRemote, setRemoteDeviceName]);

  // Refleja los cambios locales hacia los otros dispositivos — salvo cuando
  // el cambio vino justamente de ellos.
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const volume = usePlayerStore((s) => s.volume);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (usePlayerStore.getState().isRemoteCommand) return;
    if (!currentTrack) return;
    void emitState({
      trackId: currentTrack.id,
      positionMs: Math.floor(usePlayerStore.getState().progress * 1000),
      isPlaying,
      volume,
      timestamp: Date.now(),
    });
  }, [isAuthenticated, currentTrack, isPlaying, volume]);
}
