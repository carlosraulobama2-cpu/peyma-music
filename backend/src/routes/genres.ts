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
 * Se combinan DOS vocabularios a propósito, porque en esta base existen los
 * dos y ocultar uno dejaría medio catálogo sin categoría:
 *
 *   - `MusicGenre`: la tabla editable desde el panel (Drill, Amapiano…),
 *     con su color elegido a mano. Se cruza con `Artist.genres`.
 *   - `Track.genre`: el enum cerrado de Postgres del catálogo original
 *     (lofi, jazz, ambient…), que no se puede ampliar sin migración.
 */
import { Router, type Request, type Response } from 'express';
import { prisma } from '../prismaClient';

const router = Router();

/** Colores por defecto del enum cerrado, que no tiene columna de color. */
const ENUM_GENRE_COLORS: Record<string, string> = {
  lofi: '#8b5cf6',
  jazz: '#d97706',
  ambient: '#0ea5e9',
  pop: '#ec4899',
  hiphop: '#ef4444',
  classical: '#78716c',
  electronic: '#06b6d4',
  rock: '#dc2626',
};

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
   * Con qué parámetro filtrar en Buscar. Son tres vocabularios distintos y
   * el backend los consulta por campos distintos: mezclarlos devolvería
   * listas vacías sin dar ningún error.
   */
  filter: 'primaryGenre' | 'genre' | 'mood';
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

/** Primera letra en mayúscula, para los valores del enum que van en minúscula. */
function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

router.get('/', async (_req: Request, res: Response) => {
  const [curated, byEnum, byMood] = await Promise.all([
    prisma.musicGenre.findMany({
      where: { isActive: true },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    }),
    // Cuántas pistas públicas hay de cada valor del enum, y una portada.
    prisma.track.groupBy({
      by: ['genre'],
      where: { status: 'APPROVED', isBlocked: false, artist: { isBlocked: false }, genre: { not: null } },
      _count: { _all: true },
    }),
    // Los ánimos también son una forma de explorar, y el catálogo ya los
    // tiene rellenos por el analizador de audio. Sin ellos la cuadrícula se
    // queda en cinco tarjetas.
    prisma.track.groupBy({
      by: ['mood'],
      where: { status: 'APPROVED', isBlocked: false, artist: { isBlocked: false }, mood: { not: null } },
      _count: { _all: true },
    }),
  ]);

  // Una portada por género del enum: la de la pista más reciente. Se pide
  // en una sola consulta con `distinct` en vez de una por género.
  const covers = await prisma.track.findMany({
    where: { status: 'APPROVED', isBlocked: false, genre: { not: null } },
    distinct: ['genre'],
    orderBy: { createdAt: 'desc' },
    select: { genre: true, coverUrl: true },
  });
  const coverByGenre = new Map(covers.map((row) => [row.genre, row.coverUrl]));

  // Cuántos artistas usan cada ritmo curado (viven en `Artist.genres`).
  const artists = await prisma.artist.findMany({
    where: { isBlocked: false },
    select: { genres: true },
  });
  const usage = new Map<string, number>();
  for (const artist of artists) {
    for (const name of artist.genres) usage.set(name, (usage.get(name) ?? 0) + 1);
  }

  // Una portada por ánimo, igual que por género.
  const moodCovers = await prisma.track.findMany({
    where: { status: 'APPROVED', isBlocked: false, mood: { not: null } },
    distinct: ['mood'],
    orderBy: { createdAt: 'desc' },
    select: { mood: true, coverUrl: true },
  });
  const coverByMood = new Map(moodCovers.map((row) => [row.mood, row.coverUrl]));

  const cards: GenreCard[] = [
    ...byEnum
      .filter((row) => row.genre !== null)
      .map((row) => ({
        id: `catalog-${row.genre}`,
        name: row.genre!,
        label: capitalize(row.genre!),
        slug: row.genre!,
        color: ENUM_GENRE_COLORS[row.genre!] ?? '#1f6feb',
        coverUrl: coverByGenre.get(row.genre!) ?? null,
        trackCount: row._count._all,
        filter: 'primaryGenre' as const,
      })),
    ...byMood
      .filter((row) => row.mood !== null)
      .map((row) => ({
        id: `mood-${row.mood}`,
        name: row.mood!,
        label: row.mood!,
        slug: row.mood!,
        color: MOOD_COLORS[row.mood!] ?? '#64748b',
        coverUrl: coverByMood.get(row.mood!) ?? null,
        trackCount: row._count._all,
        filter: 'mood' as const,
      })),
    ...curated.map((genre) => ({
      id: genre.id,
      name: genre.name,
      label: genre.name,
      slug: genre.slug,
      color: genre.color,
      coverUrl: null,
      trackCount: usage.get(genre.name) ?? 0,
      filter: 'genre' as const,
    })),
  ]
    /**
     * Se descartan las tarjetas SIN contenido.
     *
     * Antes se mostraban atenuadas y sin poder pulsarlas. Sobre el fondo
     * oscuro se veían casi negras y parecían un error de carga — que es
     * exactamente como las leyó quien las vio. Un ritmo recién creado en el
     * panel todavía no tiene música; su sitio es el panel, no la pestaña
     * Buscar. Aparece sola en cuanto alguien etiquete un artista.
     */
    .filter((card) => card.trackCount > 0);

  cards.sort((a, b) => b.trackCount - a.trackCount);

  res.json({ genres: cards });
});

export default router;
