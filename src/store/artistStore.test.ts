import { useArtistStore } from './artistStore';
import { api } from '../services/api';
import type { ArtistStats, Track } from '../types';

/**
 * Las métricas ya no se generan aquí: vienen de `GET /artists/:id/stats`. Lo
 * que se comprueba es que el store las pida de verdad y que no rellene nada
 * por su cuenta cuando el servidor no contesta.
 */
jest.mock('../services/api', () => ({
  api: {
    getArtistStats: jest.fn(),
    getArtistTracks: jest.fn(),
  },
}));

const mockApi = api as jest.Mocked<typeof api>;

function makeStats(overrides: Partial<ArtistStats> = {}): ArtistStats {
  return {
    monthlyListeners: 1234,
    followers: 56,
    totalStreams: 7890,
    streamsLast14Days: Array.from({ length: 14 }, (_, i) => i),
    topTracks: [],
    ...overrides,
  };
}

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-servidor-1',
    title: 'Publicada',
    artist: 'Nova Austral',
    artistId: 'artist-test-1',
    album: 'Sencillos',
    albumId: 'album-1',
    duration: 180,
    coverUrl: '',
    audioUrl: '',
    isLiked: false,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockApi.getArtistStats.mockResolvedValue(makeStats());
  mockApi.getArtistTracks.mockResolvedValue([]);
  useArtistStore.setState({ profile: null, releases: [], stats: null, isLoadingStats: false });
});

describe('artistStore — becomeArtist', () => {
  it('crea el perfil con el id del servidor y sin métricas inventadas', async () => {
    useArtistStore.getState().becomeArtist({ id: 'artist-test-1', name: 'Luna Neón', genres: ['Synthwave'] });

    const { profile } = useArtistStore.getState();
    expect(profile?.id).toBe('artist-test-1');
    expect(profile?.name).toBe('Luna Neón');
    // Un artista recién creado no tiene oyentes hasta que el servidor diga
    // lo contrario; antes se le asignaban decenas de miles al azar.
    expect(profile?.monthlyListeners).toBe(0);

    await useArtistStore.getState().refreshStats();
    expect(mockApi.getArtistStats).toHaveBeenCalledWith('artist-test-1');
    expect(useArtistStore.getState().stats?.followers).toBe(56);
    expect(useArtistStore.getState().profile?.monthlyListeners).toBe(1234);
  });

  it('usa un nombre por defecto si se manda vacío', () => {
    useArtistStore.getState().becomeArtist({ id: 'artist-test-1', name: '   ', genres: [] });
    expect(useArtistStore.getState().profile?.name).toBe('Artista');
  });
});

describe('artistStore — refreshStats', () => {
  beforeEach(() => {
    useArtistStore.setState({
      profile: { id: 'artist-test-1', name: 'Nova Austral', imageUrl: '', genres: [], monthlyListeners: 0 },
      releases: [],
      stats: null,
      isLoadingStats: false,
    });
  });

  it('no consulta nada si todavía no hay perfil de artista', async () => {
    useArtistStore.setState({ profile: null });
    await useArtistStore.getState().refreshStats();
    expect(mockApi.getArtistStats).not.toHaveBeenCalled();
  });

  it('conserva las métricas anteriores si el servidor falla, en vez de rellenar', async () => {
    await useArtistStore.getState().refreshStats();
    expect(useArtistStore.getState().stats).not.toBeNull();

    mockApi.getArtistStats.mockRejectedValueOnce(new Error('sin red'));
    await useArtistStore.getState().refreshStats();

    expect(useArtistStore.getState().stats?.followers).toBe(56);
    expect(useArtistStore.getState().isLoadingStats).toBe(false);
  });

  it('mantiene las subidas que aún esperan aprobación', async () => {
    useArtistStore.getState().publishTrack({
      id: 'pendiente-1',
      title: 'En revisión',
      album: 'Sencillos',
      albumId: 'artist-self',
      duration: 200,
      coverUrl: '',
      audioUrl: '',
    });
    mockApi.getArtistTracks.mockResolvedValueOnce([makeTrack()]);

    await useArtistStore.getState().refreshStats();

    const ids = useArtistStore.getState().releases.map((t) => t.id);
    expect(ids).toContain('track-servidor-1'); // la que ya publicó el servidor
    expect(ids).toContain('pendiente-1'); // la que sigue en revisión
  });

  it('no duplica una pista cuando el servidor ya la devuelve', async () => {
    useArtistStore.getState().publishTrack({
      id: 'track-servidor-1',
      title: 'Publicada',
      album: 'Sencillos',
      albumId: 'album-1',
      duration: 180,
      coverUrl: '',
      audioUrl: '',
    });
    mockApi.getArtistTracks.mockResolvedValueOnce([makeTrack()]);

    await useArtistStore.getState().refreshStats();

    expect(useArtistStore.getState().releases.filter((t) => t.id === 'track-servidor-1')).toHaveLength(1);
  });
});

describe('artistStore — publicar y quitar lanzamientos', () => {
  beforeEach(() => {
    useArtistStore.getState().becomeArtist({ id: 'artist-test-1', name: 'Nova Austral', genres: ['Indie Pop'] });
  });

  it('publica una canción con el artista del perfil activo', () => {
    useArtistStore.getState().publishTrack({
      id: 'release-1',
      title: 'Mi Sencillo',
      album: 'Sencillos',
      albumId: 'artist-self',
      duration: 180,
      coverUrl: 'https://example.com/cover.jpg',
      audioUrl: 'file:///song.mp3',
    });

    const { releases } = useArtistStore.getState();
    expect(releases).toHaveLength(1);
    expect(releases[0]?.artist).toBe('Nova Austral');
    expect(releases[0]?.isLiked).toBe(false);
  });

  it('no publica nada si todavía no hay perfil de artista', () => {
    useArtistStore.setState({ profile: null, releases: [], stats: null });
    useArtistStore.getState().publishTrack({
      id: 'release-2',
      title: 'Huérfana',
      album: 'Sencillos',
      albumId: 'x',
      duration: 100,
      coverUrl: '',
      audioUrl: '',
    });
    expect(useArtistStore.getState().releases).toHaveLength(0);
  });

  it('quita un lanzamiento por id', () => {
    useArtistStore.getState().publishTrack({
      id: 'release-3',
      title: 'A quitar',
      album: 'Sencillos',
      albumId: 'artist-self',
      duration: 200,
      coverUrl: '',
      audioUrl: '',
    });
    expect(useArtistStore.getState().releases).toHaveLength(1);

    useArtistStore.getState().removeRelease('release-3');
    expect(useArtistStore.getState().releases).toHaveLength(0);
  });
});

describe('artistStore — stopBeingArtist', () => {
  it('limpia perfil, lanzamientos y estadísticas', () => {
    useArtistStore.getState().becomeArtist({ id: 'artist-test-1', name: 'Temporal', genres: [] });
    useArtistStore.getState().stopBeingArtist();

    const state = useArtistStore.getState();
    expect(state.profile).toBeNull();
    expect(state.releases).toEqual([]);
    expect(state.stats).toBeNull();
  });
});
