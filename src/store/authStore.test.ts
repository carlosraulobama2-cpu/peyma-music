/**
 * Regresiones de la sesión al arrancar la app.
 *
 * Los usuarios reportaban que entraban y "la app se salía sola". No era un
 * cierre de sesión del servidor ni un token caducado: era el estado
 * inicial del store. Estas pruebas fijan las dos condiciones que lo
 * causaban, porque las dos son invisibles en el código y sólo se notan en
 * un teléfono.
 */
/**
 * El cliente HTTP se sustituye ENTERO, sin `requireActual`: el módulo real
 * exige `EXPO_PUBLIC_API_URL` al importarse y revienta la suite. `ApiError`
 * se redefine aquí dentro y es la misma clase que verá el store, así que
 * los `instanceof` de `loadStoredSession` siguen funcionando.
 */
jest.mock('../services/httpClient', () => {
  class ApiError extends Error {
    readonly status: number;
    readonly code?: string;
    constructor(message: string, status: number, code?: string) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.code = code;
    }
  }
  return {
    ApiError,
    http: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
    getAuthToken: jest.fn(),
    setAuthToken: jest.fn(async () => {}),
    clearAuthToken: jest.fn(async () => {}),
    // El store se suscribe al arrancar para cerrar la sesión si el token
    // caduca con la app abierta. Se guarda el callback para poder dispararlo
    // en la prueba de más abajo.
    onUnauthorized: jest.fn((listener: () => void) => {
      escuchasNoAutorizado.push(listener);
      return () => {};
    }),
  };
});

/** Los callbacks que el store registró con `onUnauthorized`. */
const escuchasNoAutorizado: Array<() => void> = [];

// El store de biblioteca se toca al adoptar/soltar la sesión; aquí no
// interesa y arrastra media app si se carga de verdad.
jest.mock('./libraryStore', () => ({
  useLibraryStore: {
    getState: () => ({
      syncFromServer: jest.fn(async () => {}),
      clearAccountData: jest.fn(),
    }),
  },
}));

type AuthModule = typeof import('./authStore');

interface ClienteMock {
  getAuthToken: jest.Mock;
  clearAuthToken: jest.Mock;
  http: { get: jest.Mock };
  ApiError: new (message: string, status: number, code?: string) => Error;
}

/**
 * El store y su cliente HTTP salen del MISMO registro aislado.
 *
 * `jest.isolateModules` crea un registro nuevo, así que pedir el cliente
 * desde fuera devolvía otra copia del mock: las implementaciones que le
 * ponía la prueba no eran las que veía el store.
 */
function loadModule(): { useAuthStore: AuthModule['useAuthStore']; cliente: ClienteMock } {
  let store!: AuthModule;
  let cliente!: ClienteMock;
  jest.isolateModules(() => {
    // `require` y no `import`: hay que resolver los módulos DENTRO del
    // registro aislado, y un import estático se evalúa antes de entrar aquí.
    /* eslint-disable @typescript-eslint/no-require-imports */
    cliente = require('../services/httpClient') as unknown as ClienteMock;
    store = require('./authStore') as AuthModule;
    /* eslint-enable @typescript-eslint/no-require-imports */
  });
  return { useAuthStore: store.useAuthStore, cliente };
}

describe('authStore — arranque de la sesión', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('arranca en "comprobando" y no en "sin sesión"', () => {
    const { useAuthStore } = loadModule();

    /**
     * Con `isLoading: false` de partida, el guardia de rutas y la pantalla
     * de arranque leían el primer render como "no hay sesión" y mandaban
     * al login antes de que nadie hubiera mirado el token guardado.
     */
    expect(useAuthStore.getState().isLoading).toBe(true);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('sin token guardado deja de cargar y no autentica', async () => {
    const { useAuthStore, cliente } = loadModule();
    cliente.getAuthToken.mockResolvedValue(null);

    await useAuthStore.getState().loadStoredSession();

    expect(useAuthStore.getState().isLoading).toBe(false);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('un 401 sí cierra la sesión y borra el token', async () => {
    const { useAuthStore, cliente } = loadModule();
    cliente.getAuthToken.mockResolvedValue('un-token-invalido');
    cliente.http.get.mockRejectedValue(new cliente.ApiError('Token inválido o expirado', 401));

    await useAuthStore.getState().loadStoredSession();

    expect(cliente.clearAuthToken).toHaveBeenCalled();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().isLoading).toBe(false);
  });

  it('un fallo de red NO cierra la sesión si había un usuario cacheado', async () => {
    const { useAuthStore, cliente } = loadModule();
    cliente.getAuthToken.mockResolvedValue('un-token-valido');
    cliente.http.get.mockRejectedValue(new cliente.ApiError('No se pudo conectar', 0, 'network_error'));

    // Simula lo que deja `persist` al rehidratar: el usuario cacheado.
    useAuthStore.setState({
      user: {
        id: 'u1',
        email: 'alguien@peyma.test',
        displayName: 'Alguien',
        accountType: 'listener',
      } as never,
    });

    await useAuthStore.getState().loadStoredSession();

    // Abrir la app sin cobertura no puede echar a nadie: el token sigue
    // siendo válido, simplemente no se pudo confirmar ahora mismo.
    expect(cliente.clearAuthToken).not.toHaveBeenCalled();
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().isLoading).toBe(false);
  });
});

/**
 * Quién es artista lo decide el servidor.
 *
 * El backend manda `role` en cada respuesta de sesión y el store lo
 * descartaba: la pestaña de Estudio dependía de un `accountType` guardado
 * en ESE teléfono, así que un artista que reinstalaba volvía como oyente.
 */
describe('authStore — el rol viene del servidor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    escuchasNoAutorizado.length = 0;
  });

  it('un ARTIST del servidor es artista aunque el teléfono no supiera nada', async () => {
    const { useAuthStore, cliente } = loadModule();
    cliente.getAuthToken.mockResolvedValue('token-valido');
    cliente.http.get.mockResolvedValue({
      user: {
        id: 'u1',
        email: 'a@b.c',
        displayName: 'Ana',
        avatarUrl: null,
        favoriteGenres: [],
        role: 'ARTIST',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    });

    await useAuthStore.getState().loadStoredSession();

    expect(useAuthStore.getState().user?.accountType).toBe('artist');
  });

  it('un USER del servidor es oyente', async () => {
    const { useAuthStore, cliente } = loadModule();
    cliente.getAuthToken.mockResolvedValue('token-valido');
    cliente.http.get.mockResolvedValue({
      user: {
        id: 'u2',
        email: 'c@d.e',
        displayName: 'Luis',
        avatarUrl: null,
        favoriteGenres: [],
        role: 'USER',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    });

    await useAuthStore.getState().loadStoredSession();

    expect(useAuthStore.getState().user?.accountType).toBe('listener');
  });
});

/**
 * El token dura 7 días y no se renueva: puede caducar con la app abierta.
 * Antes sólo se miraba el 401 al arrancar, y mientras tanto la interfaz
 * seguía mostrando la sesión iniciada mientras todo fallaba.
 */
describe('authStore — sesión caducada a mitad de uso', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    escuchasNoAutorizado.length = 0;
  });

  it('un 401 en cualquier petición cierra la sesión', async () => {
    const { useAuthStore, cliente } = loadModule();
    cliente.getAuthToken.mockResolvedValue('token-valido');
    cliente.http.get.mockResolvedValue({
      user: {
        id: 'u3',
        email: 'e@f.g',
        displayName: 'Mar',
        avatarUrl: null,
        favoriteGenres: [],
        role: 'USER',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    });

    await useAuthStore.getState().loadStoredSession();
    expect(useAuthStore.getState().isAuthenticated).toBe(true);

    // Lo que hace el cliente HTTP cuando el servidor responde 401.
    for (const avisar of escuchasNoAutorizado) avisar();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
    expect(cliente.clearAuthToken).toHaveBeenCalled();
  });
});
