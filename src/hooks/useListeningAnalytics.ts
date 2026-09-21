/**
 * Peyma Music — Captura de eventos para el motor de afinidad
 *
 * Independiente de `useTrackPlayer()` (que sincroniza el estado de
 * reproducción) a propósito: esto es un consumidor más de los eventos
 * nativos de TrackPlayer, no una responsabilidad de la sincronización de
 * estado. Mezclar ambas cosas en un solo hook habría acoplado "reflejar lo
 * que pasa" con "interpretar lo que significa", que cambian por razones
 * distintas y se prueban distinto.
 *
 * Reglas de puntuación (ver AFFINITY_POINTS en types/music.ts):
 *  - Completada (>80% reproducido antes de cambiar de pista): +10
 *  - Repetida el mismo día calendario: +15
 *  - Saltada en los primeros 10s: -15
 *  - Guardada en favoritos: +25 (se dispara desde `libraryStore.toggleFavorite`,
 *    no desde acá — ese evento no depende de la reproducción en curso).
 */
import { useEffect, useRef } from 'react';
import TrackPlayer, { Event } from 'react-native-track-player';
import type { PlaybackProgressUpdatedEvent, PlaybackActiveTrackChangedEvent } from 'react-native-track-player';
import { usePlayerStore } from '../store/playerStore';
import { useUserBehaviorStore } from '../store/userBehaviorStore';
import type { Track } from '../types';

/** Por debajo de esto, cambiar de pista cuenta como "salto", no como abandono normal. */
const SKIP_THRESHOLD_SECONDS = 10;
/** Reproducir esto o más del total cuenta como "completada". */
const COMPLETION_RATIO = 0.8;

interface ActiveTrackSession {
  track: Track;
  startedAt: number;
  maxProgressRatio: number;
}

function isSameCalendarDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function findTrackById(queue: Track[], trackId: string): Track | undefined {
  return queue.find((t) => t.id === trackId);
}

/** Debe montarse una sola vez, junto a `useTrackPlayer()`. */
export function useListeningAnalytics(): void {
  const queue = usePlayerStore((s) => s.queue);
  const recordEvent = useUserBehaviorStore((s) => s.recordEvent);
  const events = useUserBehaviorStore((s) => s.events);

  const queueRef = useRef(queue);
  useEffect(() => {
    queueRef.current = queue;
  });
  const eventsRef = useRef(events);
  useEffect(() => {
    eventsRef.current = events;
  });

  const sessionRef = useRef<ActiveTrackSession | null>(null);

  useEffect(() => {
    /** Cierra la sesión de la pista saliente: decide si fue "completada" o "saltada". */
    const closeSession = () => {
      const session = sessionRef.current;
      if (!session) return;
      const elapsedSeconds = (Date.now() - session.startedAt) / 1000;

      if (elapsedSeconds < SKIP_THRESHOLD_SECONDS && session.maxProgressRatio < COMPLETION_RATIO) {
        recordEvent({
          trackId: session.track.id,
          artistId: session.track.artistId,
          genre: session.track.primaryGenre ?? null,
          type: 'skipped_early',
        });
      } else if (session.maxProgressRatio >= COMPLETION_RATIO) {
        recordEvent({
          trackId: session.track.id,
          artistId: session.track.artistId,
          genre: session.track.primaryGenre ?? null,
          type: 'completed',
        });
      }
      sessionRef.current = null;
    };

    const openSession = (track: Track) => {
      const now = new Date();
      const playedToday = eventsRef.current.some(
        (e) => e.trackId === track.id && isSameCalendarDay(new Date(e.occurredAt), now),
      );
      if (playedToday) {
        recordEvent({
          trackId: track.id,
          artistId: track.artistId,
          genre: track.primaryGenre ?? null,
          type: 'repeated_same_day',
        });
      }
      sessionRef.current = { track, startedAt: Date.now(), maxProgressRatio: 0 };
    };

    const subscriptions = [
      TrackPlayer.addEventListener(
        Event.PlaybackActiveTrackChanged,
        (event: PlaybackActiveTrackChangedEvent) => {
          closeSession();
          if (typeof event.index !== 'number' || !event.track) return;
          const peymaTrack = findTrackById(queueRef.current, event.track.id ?? '');
          if (peymaTrack) openSession(peymaTrack);
        },
      ),

      TrackPlayer.addEventListener(
        Event.PlaybackProgressUpdated,
        (event: PlaybackProgressUpdatedEvent) => {
          const session = sessionRef.current;
          if (!session || event.duration <= 0) return;
          session.maxProgressRatio = Math.max(session.maxProgressRatio, event.position / event.duration);
        },
      ),

      TrackPlayer.addEventListener(Event.PlaybackQueueEnded, closeSession),
    ];

    return () => {
      closeSession();
      subscriptions.forEach((sub) => sub.remove());
    };
    // Sólo debe montarse una vez; `queueRef`/`eventsRef` evitan re-suscribir
    // en cada cambio de cola o de historial (mismo patrón que useTrackPlayer).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
