import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Peyma Music (web) — La lista de artistas no se corta en 100
 *
 * `fetchArtists` pedía `?limit=100` y devolvía esa primera página como si
 * fuera el catálogo entero. Con 101 artistas, el desplegable de "Subir
 * canción" mostraba una lista incompleta con pinta de completa, y el
 * artista 101 sencillamente no existía para quien publicaba.
 */

const get = vi.fn();
vi.mock("./httpClient", () => ({ http: { get: (...args: unknown[]) => get(...args) } }));

const { fetchArtists } = await import("./artists");

/** Una página de artistas con nombres predecibles. */
function pagina(page: number, totalPages: number, cuantos: number) {
  return {
    artists: Array.from({ length: cuantos }, (_, i) => ({ id: `a${page}-${i}`, name: `Artista ${page}-${i}` })),
    pagination: { page, totalPages },
  };
}

describe("fetchArtists", () => {
  beforeEach(() => get.mockReset());

  it("recorre TODAS las páginas, no sólo la primera", async () => {
    get.mockResolvedValueOnce(pagina(1, 3, 100)).mockResolvedValueOnce(pagina(2, 3, 100)).mockResolvedValueOnce(pagina(3, 3, 7));

    const artistas = await fetchArtists();

    expect(artistas).toHaveLength(207);
    expect(get).toHaveBeenCalledTimes(3);
    expect(get).toHaveBeenLastCalledWith("/artists?limit=100&page=3");
  });

  it("con una sola página hace una sola petición", async () => {
    get.mockResolvedValueOnce(pagina(1, 1, 7));

    expect(await fetchArtists()).toHaveLength(7);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("no gira en bucle si el endpoint no devuelve paginación", async () => {
    // Defensa contra un servidor más viejo: mejor quedarse con lo que hay
    // que encadenar peticiones para siempre.
    get.mockResolvedValue({ artists: [{ id: "a", name: "A" }] });

    expect(await fetchArtists()).toHaveLength(1);
    expect(get).toHaveBeenCalledTimes(1);
  });
});
