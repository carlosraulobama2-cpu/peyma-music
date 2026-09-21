/**
 * Peyma Music — Configuración e integración con react-native-track-player
 */
import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
  Event,
  RepeatMode,
} from 'react-native-track-player';

/** Idempotente: puede llamarse en cada montaje sin re-inicializar el player nativo. */
export async function setupTrackPlayer(): Promise<boolean> {
  try {
    // Lanza si el player nativo aún no se inicializó.
    await TrackPlayer.getActiveTrackIndex();
    return true;
  } catch {
    // No estaba listo: caída esperada, se inicializa a continuación.
  }

  try {
    /**
     * Búfer mínimo para que el sonido empiece cuanto antes.
     *
     * Por defecto el reproductor acumula varios segundos antes de sonar, lo
     * que es razonable en una red mala pero se nota como un retraso cada vez
     * que pulsas una canción. Con estos valores arranca en cuanto tiene
     * medio segundo de audio y sigue llenando el búfer mientras suena.
     *
     * `backBuffer` a 0 a propósito: guardar lo ya reproducido sólo sirve
     * para retroceder sin volver a descargar, y cuesta memoria en un móvil.
     *
     * Los tres valores son coherentes entre sí: `playBuffer` (cuándo
     * empezar) debe ser menor que `minBuffer` (cuánto mantener por delante),
     * y `maxBuffer` acota cuánto se descarga por adelantado para no gastar
     * datos de alguien que va a saltar de canción a los diez segundos.
     */
    await TrackPlayer.setupPlayer({
      minBuffer: 5,
      maxBuffer: 30,
      playBuffer: 0.5,
      backBuffer: 0,
    });

    await TrackPlayer.updateOptions({
      android: {
        appKilledPlaybackBehavior: AppKilledPlaybackBehavior.ContinuePlayback,
      },
      capabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SkipToNext,
        Capability.SkipToPrevious,
        Capability.SeekTo,
        Capability.Stop,
      ],
      compactCapabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SkipToNext,
        Capability.SkipToPrevious,
      ],
      notificationCapabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SkipToNext,
        Capability.SkipToPrevious,
      ],
      progressUpdateEventInterval: 1,
    });

    await TrackPlayer.setRepeatMode(RepeatMode.Off);
    return true;
  } catch (error) {
    console.error('[trackPlayerService] Falló la inicialización del reproductor:', error);
    return false;
  }
}

/** Servicio en segundo plano: enlaza controles del sistema con el player. */
export async function playbackService(): Promise<void> {
  TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
  TrackPlayer.addEventListener(Event.RemoteStop, () => TrackPlayer.pause());
  TrackPlayer.addEventListener(Event.RemoteNext, () => TrackPlayer.skipToNext());
  TrackPlayer.addEventListener(Event.RemotePrevious, () => TrackPlayer.skipToPrevious());
  TrackPlayer.addEventListener(Event.RemoteSeek, (event) => TrackPlayer.seekTo(event.position));
  TrackPlayer.addEventListener(Event.RemoteDuck, async (event) => {
    // Otra app (llamada, navegación) pide el audio: pausamos y no reanudamos
    // solos — dejamos que el usuario retome el control.
    if (event.paused || event.permanent) {
      await TrackPlayer.pause();
    }
  });
}
