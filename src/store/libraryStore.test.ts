import { useLibraryStore } from './libraryStore';
import { api } from '../services/api';
import type { Track, Playlist } from '../types';

/**
 * El store es ahora un espejo del servidor, así que la API va simulada: lo
 * que se comprueba aquí es la lógica local (optimismo, deduplicado, reversión
 * en caso de fallo), no el transporte HTTP.
 */
jest.mock('../services/api', () => ({
  api: {
    createPlaylist: jest.fn(),
    addTrackToPlaylist: jest.fn(),
    removeTrackFromPlaylist: jest.fn(),
    deletePlaylist: jest.fn(),
    updatePlaylist: jest.fn(),
    toggleLike: jest.fn(),
    toggleFollowArtist: jest.fn(),
  },
}));

const mockApi = api as jest.Mocked<typeof api>;

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    title: 'Test Track',
    artist: 'Test Artist',
    artistId: 'artist-1',
    album: 'Test Album',
    albumId: 'album-1',
    duration: 200,
    coverUrl: 'https://example.com/cover.jpg',
    audioUrl: 'https://example.com/audio.mp3',
    isLiked: false,
    ...overrides,
  };
}

function makePlaylist(overrides: Partial<Playlist> = {}): Playlist {
  return {
    id: 'playlist-servidor-1',
    title: 'Mi mix',
    coverUrl: '',
    ownerId: 'user-1',
    ownerName: 'Tú',
    tracks: [],
    isPublic: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

/** Deja que se resuelvan las promesas de las mutaciones optimistas. */
const flush = () => new Promise<void>((resolve) => setImmediate(() => resolve()));

// El store persiste entre tests vía el mismo módulo Zustand; se resetea a mano
// para que cada test empiece desde un estado limpio y predecible.
beforeEach(() => {
  jest.clearAllMocks();
  mockApi.toggleLike.mockResolvedValue(true);
  mockApi.toggleFollowArtist.mockResolvedValue(true);
  mockApi.addTrackToPlaylist.mockResolvedValue(undefined);
  mockApi.removeTrackFromPlaylist.mockResolvedValue(undefined);
  mockApi.deletePlaylist.mockResolvedValue(undefined);
  mockApi.updatePlaylist.mockResolvedValue(undefined);
  useLibraryStore.setState({
    favorites: [],
    playlists: [],
    downloadedTracks: [],
    recentlyPlayed: [],
    followedArtistIds: [],
  });
});

describe('libraryStore — favoritos', () => {
  it('agrega y quita una canción de favoritos', () => {
    const track = makeTrack();
    useLibraryStore.getState().toggleFavorite(track);
    expect(useLibraryStore.getState().isFavorite(track.id)).toBe(true);

    useLibraryStore.getState().toggleFavorite(track);
    expect(useLibraryStore.getState().isFavorite(track.id)).toBe(false);
  });

  it('lo manda al servidor, no sólo al estado local', () => {
    const track = makeTrack();
    useLibraryStore.getState().toggleFavorite(track);
    expect(mockApi.toggleLike).toHaveBeenCalledWith(track.id);
  });

  it('revierte el corazón si el servidor rechaza la llamada', async () => {
    mockApi.toggleLike.mockRejectedValueOnce(new Error('sin red'));
    const track = makeTrack();

    useLibraryStore.getState().toggleFavorite(track);
    expect(useLibraryStore.getState().isFavorite(track.id)).toBe(true); // optimista
    await flush();
    expect(useLibraryStore.getState().isFavorite(track.id)).toBe(false); // revertido
  });
});

describe('libraryStore — artistas seguidos', () => {
  it('revierte el seguimiento si el servidor falla', async () => {
    mockApi.toggleFollowArtist.mockRejectedValueOnce(new Error('sin red'));

    useLibraryStore.getState().toggleFollowArtist('artist-1');
    expect(useLibraryStore.getState().isFollowingArtist('artist-1')).toBe(true);
    await flush();
    expect(useLibraryStore.getState().isFollowingArtist('artist-1')).toBe(false);
  });
});

describe('libraryStore — playlists', () => {
  it('crea la playlist con el id que asigna el servidor', async () => {
    mockApi.createPlaylist.mockResolvedValueOnce(makePlaylist());

    const playlist = await useLibraryStore.getState().createPlaylist('Mi mix', 'Descripción');

    expect(mockApi.createPlaylist).toHaveBeenCalledWith({ title: 'Mi mix', description: 'Descripción' });
    expect(playlist.id).toBe('playlist-servidor-1');
    expect(playlist.title).toBe('Mi mix');
    expect(playlist.tracks).toHaveLength(0);
    expect(useLibraryStore.getState().playlists).toHaveLength(1);
  });

  it('propaga el error y no deja una playlist fantasma si el servidor falla', async () => {
    mockApi.createPlaylist.mockRejectedValueOnce(new Error('sin red'));

    await expect(useLibraryStore.getState().createPlaylist('Mi mix')).rejects.toThrow('sin red');
    expect(useLibraryStore.getState().playlists).toHaveLength(0);
  });

  it('no permite añadir la misma canción dos veces', async () => {
    mockApi.createPlaylist.mockResolvedValueOnce(makePlaylist());
    const playlist = await useLibraryStore.getState().createPlaylist('Mi mix');
    const track = makeTrack();

    useLibraryStore.getState().addToPlaylist(playlist.id, track);
    useLibraryStore.getState().addToPlaylist(playlist.id, track);

    const updated = useLibraryStore.getState().playlists.find((p) => p.id === playlist.id);
    expect(updated?.tracks).toHaveLength(1);
    // La segunda llamada ni siquiera sale a la red.
    expect(mockApi.addTrackToPlaylist).toHaveBeenCalledTimes(1);
  });

  it('elimina una canción de la playlist', async () => {
    mockApi.createPlaylist.mockResolvedValueOnce(makePlaylist());
    const playlist = await useLibraryStore.getState().createPlaylist('Mi mix');
    const track = makeTrack();
    useLibraryStore.getState().addToPlaylist(playlist.id, track);

    useLibraryStore.getState().removeFromPlaylist(playlist.id, track.id);

    const updated = useLibraryStore.getState().playlists.find((p) => p.id === playlist.id);
    expect(updated?.tracks).toHaveLength(0);
    expect(mockApi.removeTrackFromPlaylist).toHaveBeenCalledWith(playlist.id, track.id);
  });
});

describe('libraryStore — ciclo de vida de la sesión', () => {
  it('al cerrar sesión borra lo de la cuenta pero conserva lo del aparato', () => {
    useLibraryStore.setState({
      favorites: [makeTrack()],
      playlists: [makePlaylist()],
      followedArtistIds: ['artist-1'],
      recentlyPlayed: [makeTrack()],
      downloadedTracks: ['track-1'],
    });

    useLibraryStore.getState().clearAccountData();

    const state = useLibraryStore.getState();
    expect(state.favorites).toHaveLength(0);
    expect(state.playlists).toHaveLength(0);
    expect(state.followedArtistIds).toHaveLength(0);
    expect(state.recentlyPlayed).toHaveLength(0);
    // Las descargas son de este teléfono, no de la cuenta.
    expect(state.downloadedTracks).toEqual(['track-1']);
  });
});

describe('libraryStore — reproducciones recientes', () => {
  it('mantiene como máximo 30 elementos, sin duplicados, más reciente primero', () => {
    for (let i = 0; i < 35; i++) {
      useLibraryStore.getState().addToRecentlyPlayed(makeTrack({ id: `track-${i}` }));
    }
    const { recentlyPlayed } = useLibraryStore.getState();
    expect(recentlyPlayed).toHaveLength(30);
    expect(recentlyPlayed[0]?.id).toBe('track-34');
  });

  it('mueve una canción repetida al frente en lugar de duplicarla', () => {
    const track = makeTrack();
    useLibraryStore.getState().addToRecentlyPlayed(track);
    useLibraryStore.getState().addToRecentlyPlayed(makeTrack({ id: 'track-2' }));
    useLibraryStore.getState().addToRecentlyPlayed(track);

    const { recentlyPlayed } = useLibraryStore.getState();
    expect(recentlyPlayed).toHaveLength(2);
    expect(recentlyPlayed[0]?.id).toBe(track.id);
  });
});
