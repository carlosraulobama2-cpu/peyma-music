/**
 * Peyma Music API — Ritmos públicos (pestaña Buscar)
 *
 * Devuelve las tarjetas de categoría de la pestaña Buscar: nombre, color y
 * una portada representativa.
 *
 * La portada NO se guarda en `MusicGenre`: se toma de la canción más
 * escuchada de ese ritmo en la ventana de 28 días. Así la tarjeta se
 * actualiza sola cuando cambia lo que suena, en vez de quedarse con una
 * imagen que alguien subió una vez y nadie volvió a mirar.
 *
 * Hubo un tiempo en que esta ruta combinaba DOS vocabularios de género: la
 * tabla `MusicGenre` que se edita desde el panel y un enum cerrado de
 * Postgres en `Track.genre`. Ya no: el género de una canción apunta a
 * `MusicGenre`, así que aquí sólo queda ese vocabulario más los ánimos, que
 * sí son una dimensión distinta de exploración.
 */
import { Router, type Request, type Response } from 'express';
import { prisma } from '../prismaClient';

const router = Router();

export interface GenreCard {
  id: string;
  name: string;
  /** Etiqueta visible, ya capitalizada. */
  label: string;
  slug: string;
  color: string;
  /** Portada representativa; null si no hay ninguna. */
  coverUrl: string | null;
  trackCount: number;
  /**
   * Con qué parámetro filtrar en Buscar. Género y ánimo se consultan por
   * campos distintos: mezclarlos devolvería listas vacías sin dar ningún
   * error.
   */
  filter: 'primaryGenre' | 'mood';
}

/** Colores de los ánimos. Tonos más suaves que los de género, para que se distingan de un vistazo. */
const MOOD_COLORS: Record<string, string> = {
  Relajado: '#3b82f6',
  'Enérgico': '#f97316',
  'Melancólico': '#6366f1',
  'Soñador': '#a855f7',
  Alegre: '#eab308',
  Intenso: '#e11d48',
};

/**
 * Lista plana de ritmos activos, para los desplegables de quien sube música.
 *
 * Aparte de `GET /` porque aquella ruta descarta las categorías sin
 * canciones — lo que tiene sentido en la pestaña Buscar, pero haría
 * imposible estrenar un ritmo: no se podría elegir hasta que alguien ya
 * hubiera publicado algo con él, y nadie podría publicar nada con él.
 */
router.get('/options', async (_req: Request, res: Response) => {
  const genres = await prisma.musicGenre.findMany({
    where: { isActive: true },
    orderBy: [{ position: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, slug: true, color: true },
  });
  res.json({ genres });
});

router.get('/', async (_req: Request, res: Response) => {
  const PUBLICO = { status: 'APPROVED', isBlocked: false, artist: { isBlocked: false } } as const;

  const [curated, porGenero, porAnimo] = await Promise.all([
    prisma.musicGenre.findMany({
      where: { isActive: true },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    }),
    // Cuántas canciones públicas tiene cada ritmo. Antes esto contaba
    // ARTISTAS etiquetados (`Artist.genres`, texto libre) porque ninguna
    // canción podía apuntar a un ritmo curado; ahora se cuenta lo que de
    // verdad se puede escuchar.
    prisma.track.groupBy({
      by: ['genreId'],
      where: { ...PUBLICO, genreId: { not: null } },
      _count: { _all: true },
    }),
    prisma.track.groupBy({
      by: ['mood'],
      where: { ...PUBLICO, mood: { not: null } },
      _count: { _all: true },
    }),
  ]);

  // Una portada por ritmo y por ánimo: la de la canción más reciente. Con
  // `distinct` en una sola consulta, no una por categoría.
  const [portadasGenero, portadasAnimo] = await Promise.all([
    prisma.track.findMany({
      where: { ...PUBLICO, genreId: { not: null } },
      distinct: ['genreId'],
      orderBy: { createdAt: 'desc' },
      select: { genreId: true, coverUrl: true },
    }),
    prisma.track.findMany({
      where: { ...PUBLICO, mood: { not: null } },
      distinct: ['mood'],
      orderBy: { createdAt: 'desc' },
      select: { mood: true, coverUrl: true },
    }),
  ]);

  const portadaPorGenero = new Map(portadasGenero.map((row) => [row.genreId, row.coverUrl]));
  const portadaPorAnimo = new Map(portadasAnimo.map((row) => [row.mood, row.coverUrl]));
  const conteoPorGenero = new Map(porGenero.map((row) => [row.genreId, row._count._all]));

  const cards: GenreCard[] = [
    ...curated.map((genre) => ({
      id: genre.id,
      name: genre.name,
      label: genre.name,
      // El slug es lo que viaja como `primaryGenre`, no el nombre: "Corridos
      // Tumbados" no vale en una URL y "corridos-tumbados" sí.
      slug: genre.slug,
      color: genre.color,
      coverUrl: portadaPorGenero.get(genre.id) ?? null,
      trackCount: conteoPorGenero.get(genre.id) ?? 0,
      filter: 'primaryGenre' as const,
    })),
    ...porAnimo
      .filter((row) => row.mood !== null)
      .map((row) => ({
        id: `mood-${row.mood}`,
        name: row.mood!,
        label: row.mood!,
        slug: row.mood!,
        color: MOOD_COLORS[row.mood!] ?? '#64748b',
        coverUrl: portadaPorAnimo.get(row.mood) ?? null,
        trackCount: row._count._all,
        filter: 'mood' as const,
      })),
  ]
    /**
     * Se descartan las tarjetas SIN contenido.
     *
     * Antes se mostraban atenuadas y sin poder pulsarlas. Sobre el fondo
     * oscuro se veían casi negras y parecían un error de carga — que es
     * exactamente como las leyó quien las vio. Un ritmo recién creado en el
     * panel todavía no tiene música; su sitio es el panel, no la pestaña
     * Buscar. Aparece sola en cuanto alguien publique una canción con él.
     */
    .filter((card) => card.trackCount > 0);

  cards.sort((a, b) => b.trackCount - a.trackCount);

  res.json({ genres: cards });
});

export default router;
