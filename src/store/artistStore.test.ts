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
    getMyTracks: jest.fn(),
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
  mockApi.getMyTracks.mockResolvedValue([]);
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

  it('muestra la subida propia al instante, antes de que el servidor conteste', () => {
    useArtistStore.getState().publishTrack({
      id: 'pendiente-1',
      title: 'En revisión',
      album: 'Sencillos',
      albumId: 'artist-self',
      duration: 200,
      coverUrl: '',
      audioUrl: '',
    });

    const [release] = useArtistStore.getState().releases;
    expect(release?.id).toBe('pendiente-1');
    expect(release?.status).toBe('PENDING_REVIEW');
  });

  it('refreshStats reemplaza el estado local por la lista completa y autoritativa del servidor (getMyTracks, todos los estados)', async () => {
    useArtistStore.getState().publishTrack({
      id: 'pendiente-1',
      title: 'En revisión',
      album: 'Sencillos',
      albumId: 'artist-self',
      duration: 200,
      coverUrl: '',
      audioUrl: '',
    });

    // El servidor ya tiene una versión más completa/actualizada: una
    // aprobada y una rechazada — ninguna es 'pendiente-1', que por tanto
    // debe desaparecer en vez de quedar mezclada con lo local.
    const approved = makeTrack({ id: 'track-servidor-1', status: 'APPROVED' });
    const rejected = makeTrack({ id: 'track-servidor-2', status: 'REJECTED' });
    mockApi.getMyTracks.mockResolvedValueOnce([approved, rejected]);

    await useArtistStore.getState().refreshStats();

    const ids = useArtistStore.getState().releases.map((t) => t.id);
    expect(ids).toEqual(['track-servidor-1', 'track-servidor-2']);
    expect(useArtistStore.getState().releases.find((t) => t.id === 'track-servidor-2')?.status).toBe('REJECTED');
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
