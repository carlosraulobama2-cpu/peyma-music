import { useUserBehaviorStore } from './userBehaviorStore';
import type { ListeningEvent } from '../types/music';

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

beforeEach(() => {
  useUserBehaviorStore.getState().reset();
});

describe('userBehaviorStore — puntuación por evento', () => {
  // `recordEvent` sella `occurredAt` con la hora actual, así que estos
  // eventos caen siempre en la ventana "reciente" (peso 3x) — de ahí el
  // ×3 en cada valor esperado. El caso sin ese multiplicador se cubre
  // aparte, en el bloque de "desintegración temporal".
  it('suma +10 por completar, +25 por "me gusta" y resta 15 por saltar (con peso 3x por ser reciente)', () => {
    const store = useUserBehaviorStore.getState();
    store.recordEvent({ trackId: 't1', artistId: 'a1', genre: 'lofi', type: 'completed' });
    store.recordEvent({ trackId: 't2', artistId: 'a1', genre: 'lofi', type: 'liked' });
    store.recordEvent({ trackId: 't3', artistId: 'a2', genre: 'rock', type: 'skipped_early' });
    useUserBehaviorStore.getState().recomputeNow();

    const { metrics } = useUserBehaviorStore.getState();
    expect(metrics.genreScores.lofi).toBe(105); // (10 + 25) * 3
    expect(metrics.genreScores.rock).toBe(-45); // -15 * 3
    expect(metrics.artistScores.a1).toBe(105);
    expect(metrics.artistScores.a2).toBe(-45);
  });

  it('suma +15 extra por repetir la misma canción el mismo día', () => {
    const store = useUserBehaviorStore.getState();
    store.recordEvent({ trackId: 't1', artistId: 'a1', genre: 'jazz', type: 'completed' });
    store.recordEvent({ trackId: 't1', artistId: 'a1', genre: 'jazz', type: 'repeated_same_day' });
    useUserBehaviorStore.getState().recomputeNow();

    expect(useUserBehaviorStore.getState().metrics.trackScores.t1).toBe(75); // (10 + 15) * 3
  });
});

describe('userBehaviorStore — desintegración temporal', () => {
  it('pesa 3x una escucha de los últimos 7 días frente a una de hace un mes', () => {
    const recentEvent: ListeningEvent = {
      id: 'e1',
      trackId: 'recent-track',
      artistId: 'a1',
      genre: 'pop',
      type: 'completed',
      occurredAt: isoDaysAgo(2),
      points: 10,
    };
    const oldEvent: ListeningEvent = {
      id: 'e2',
      trackId: 'old-track',
      artistId: 'a2',
      genre: 'pop',
      type: 'completed',
      occurredAt: isoDaysAgo(35),
      points: 10,
    };

    useUserBehaviorStore.setState({ events: [recentEvent, oldEvent] });
    useUserBehaviorStore.getState().recomputeNow();

    const { metrics } = useUserBehaviorStore.getState();
    expect(metrics.trackScores['recent-track']).toBe(30); // 10 * 3
    expect(metrics.trackScores['old-track']).toBe(10); // 10 * 1
    expect(metrics.genreScores.pop).toBe(40); // 30 + 10
  });
});

describe('userBehaviorStore — topGenres / topArtists', () => {
  it('ordena de mayor a menor y excluye puntajes en cero o negativos', () => {
    const store = useUserBehaviorStore.getState();
    store.recordEvent({ trackId: 't1', artistId: 'a1', genre: 'lofi', type: 'liked' }); // +25
    store.recordEvent({ trackId: 't2', artistId: 'a2', genre: 'rock', type: 'completed' }); // +10
    store.recordEvent({ trackId: 't3', artistId: 'a3', genre: 'jazz', type: 'skipped_early' }); // -15
    useUserBehaviorStore.getState().recomputeNow();

    const { metrics } = useUserBehaviorStore.getState();
    expect(metrics.topGenres.map((g) => g.genre)).toEqual(['lofi', 'rock']);
    expect(metrics.topArtists.map((a) => a.artistId)).toEqual(['a1', 'a2']);
  });
});

describe('userBehaviorStore — reset', () => {
  it('limpia eventos y vuelve las métricas a cero', () => {
    const store = useUserBehaviorStore.getState();
    store.recordEvent({ trackId: 't1', artistId: 'a1', genre: 'lofi', type: 'liked' });
    store.reset();

    const { events, metrics } = useUserBehaviorStore.getState();
    expect(events).toHaveLength(0);
    expect(metrics.topGenres).toHaveLength(0);
  });
});
