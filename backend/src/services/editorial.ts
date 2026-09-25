/**
 * Peyma Music API — Secciones editoriales de la portada
 *
 * Resuelve una sección a su contenido real. Las secciones MANUAL leen sus
 * `EditorialItem`; las automáticas (NEW_RELEASES, TOP_*) se calculan aquí en
 * cada consulta.
 *
 * Por qué se calculan y no se guardan: guardar el resultado obligaría a un
 * trabajo periódico que lo refresque, y el día que ese trabajo fallara la
 * portada mostraría "Lo nuevo" con lanzamientos de hace semanas sin que nadie
 * se enterara. Un fallo silencioso que muestra datos viejos es peor que una
 * consulta un poco más cara.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '../prismaClient';
import { getRankedArtists } from './artistRanking';

/** Misma ventana que oyentes mensuales y trending — un solo criterio en toda la plataforma. */
const ROLLING_WINDOW_DAYS = 28;
/**
 * Bajo este número de OYENTES DISTINTOS en la ventana, una pista o álbum no
 * cuenta como "top" para las secciones automáticas — sin este piso, algo
 * recién subido con una sola reproducción (la del propio artista) podía
 * ganar "Lo más escuchado" o "Mejores álbumes" el mismo día que se publica.
 */
export const MIN_LISTENERS_TO_FEATURE = 5;

/** Un artista bloqueado y una pista no aprobada no salen en ninguna sección. */
const PUBLIC_TRACK_WHERE: Prisma.TrackWhereInput = {
  status: 'APPROVED',
  isBlocked: false,
  artist: { isBlocked: false },
};

const TRACK_CARD_SELECT = {
  id: true,
  title: true,
  coverUrl: true,
  duration: true,
  genre: true,
  isExplicit: true,
  artist: { select: { id: true, name: true, imageUrl: true, isVerified: true } },
  album: { select: { id: true, title: true } },
} satisfies Prisma.TrackSelect;

const ALBUM_CARD_SELECT = {
  id: true,
  title: true,
  coverUrl: true,
  releaseYear: true,
  artist: { select: { id: true, name: true, isVerified: true } },
} satisfies Prisma.AlbumSelect;

const ARTIST_CARD_SELECT = {
  id: true,
  name: true,
  imageUrl: true,
  genres: true,
  isVerified: true,
} satisfies Prisma.ArtistSelect;

export interface ResolvedSection {
  id: string;
  title: string;
  subtitle: string | null;
  slug: string;
  kind: string;
  layout: string;
  position: number;
  tracks: Prisma.TrackGetPayload<{ select: typeof TRACK_CARD_SELECT }>[];
  albums: Prisma.AlbumGetPayload<{ select: typeof ALBUM_CARD_SELECT }>[];
  artists: Prisma.ArtistGetPayload<{ select: typeof ARTIST_CARD_SELECT }>[];
}

function windowStart(): Date {
  return new Date(Date.now() - ROLLING_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * IDs más reproducidos en la ventana, en orden — sólo entre las que
 * escuchó al menos `MIN_LISTENERS_TO_FEATURE` personas distintas.
 *
 * SQL crudo y no `groupBy`: Prisma no puede expresar `COUNT(DISTINCT
 * userId)` ni un `HAVING` sobre eso, y las dos cosas hacen falta para el
 * piso de oyentes distintos.
 */
async function topTrackIds(limit: number): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ trackId: string }[]>`
    SELECT s."trackId"
      FROM "StreamLog" s
     WHERE s."playedAt" >= ${windowStart()}
     GROUP BY s."trackId"
    HAVING COUNT(DISTINCT s."userId") >= ${MIN_LISTENERS_TO_FEATURE}
     ORDER BY COUNT(*) DESC
     LIMIT ${limit}
  `;
  return rows.map((row) => row.trackId);
}

/**
 * Reordena según el orden de `ids`.
 *
 * Hace falta porque `findMany({ where: { id: { in: ids } } })` NO respeta el
 * orden del array — Postgres devuelve las filas en el orden que le convenga,
 * y sin esto el "top 10" saldría barajado.
 */
function sortByIdOrder<T extends { id: string }>(rows: T[], ids: string[]): T[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.map((id) => byId.get(id)).filter((row): row is T => row !== undefined);
}

async function resolveNewReleases(limit: number) {
  return prisma.track.findMany({
    where: PUBLIC_TRACK_WHERE,
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: TRACK_CARD_SELECT,
  });
}

async function resolveTopTracks(limit: number) {
  const ids = await topTrackIds(limit);
  if (ids.length === 0) return [];
  // El filtro público se reaplica: una pista puede haber sido despublicada o
  // su artista bloqueado DESPUÉS de acumular las reproducciones.
  const rows = await prisma.track.findMany({
    where: { ...PUBLIC_TRACK_WHERE, id: { in: ids } },
    select: TRACK_CARD_SELECT,
  });
  return sortByIdOrder(rows, ids);
}

async function resolveTopAlbums(limit: number) {
  const rows = await prisma.$queryRaw<{ albumId: string }[]>`
    SELECT t."albumId", COUNT(*) AS streams
      FROM "StreamLog" s
      JOIN "Track" t ON t."id" = s."trackId"
      JOIN "Artist" a ON a."id" = t."artistId"
     WHERE s."playedAt" >= ${windowStart()}
       AND t."status" = 'APPROVED'
       AND a."isBlocked" = false
       -- Un sencillo es un álbum autogenerado de una sola pista (ver
       -- routes/uploads.ts): no es un ÁLBUM para efectos de "Mejores
       -- álbumes", aunque su única canción esté sonando mucho.
       AND (SELECT COUNT(*) FROM "Track" t2 WHERE t2."albumId" = t."albumId") > 1
     GROUP BY t."albumId"
    HAVING COUNT(DISTINCT s."userId") >= ${MIN_LISTENERS_TO_FEATURE}
     ORDER BY streams DESC
     LIMIT ${limit}
  `;
  const ids = rows.map((row) => row.albumId);
  if (ids.length === 0) return [];
  const albums = await prisma.album.findMany({ where: { id: { in: ids } }, select: ALBUM_CARD_SELECT });
  return sortByIdOrder(albums, ids);
}

async function resolveTopArtists(limit: number) {
  // Ranking compuesto (oyentes + reproducciones + seguidores) — ver
  // artistRanking.ts para el porqué de los pesos.
  const ranked = await getRankedArtists(windowStart(), limit, MIN_LISTENERS_TO_FEATURE);
  const ids = ranked.map((row) => row.artistId);
  if (ids.length === 0) return [];
  const artists = await prisma.artist.findMany({ where: { id: { in: ids } }, select: ARTIST_CARD_SELECT });
  return sortByIdOrder(artists, ids);
}

type SectionRow = Prisma.EditorialSectionGetPayload<{ include: { items: true } }>;

async function resolveOne(section: SectionRow): Promise<ResolvedSection> {
  const base = {
    id: section.id,
    title: section.title,
    subtitle: section.subtitle,
    slug: section.slug,
    kind: section.kind,
    layout: section.layout,
    position: section.position,
  };

  switch (section.kind) {
    case 'NEW_RELEASES':
      return { ...base, tracks: await resolveNewReleases(section.maxItems), albums: [], artists: [] };
    case 'TOP_TRACKS':
      return { ...base, tracks: await resolveTopTracks(section.maxItems), albums: [], artists: [] };
    case 'TOP_ALBUMS':
      return { ...base, tracks: [], albums: await resolveTopAlbums(section.maxItems), artists: [] };
    case 'TOP_ARTISTS':
      return { ...base, tracks: [], albums: [], artists: await resolveTopArtists(section.maxItems) };
    default: {
      // MANUAL: se respeta el orden que puso el curador.
      const ordered = [...section.items].sort((a, b) => a.position - b.position);
      const trackIds = ordered.map((i) => i.trackId).filter((id): id is string => id !== null);
      const albumIds = ordered.map((i) => i.albumId).filter((id): id is string => id !== null);
      const artistIds = ordered.map((i) => i.artistId).filter((id): id is string => id !== null);

      const [tracks, albums, artists] = await Promise.all([
        trackIds.length
          ? prisma.track.findMany({ where: { ...PUBLIC_TRACK_WHERE, id: { in: trackIds } }, select: TRACK_CARD_SELECT })
          : [],
        albumIds.length ? prisma.album.findMany({ where: { id: { in: albumIds } }, select: ALBUM_CARD_SELECT }) : [],
        artistIds.length
          ? prisma.artist.findMany({ where: { isBlocked: false, id: { in: artistIds } }, select: ARTIST_CARD_SELECT })
          : [],
      ]);

      return {
        ...base,
        tracks: sortByIdOrder(tracks, trackIds),
        albums: sortByIdOrder(albums, albumIds),
        artists: sortByIdOrder(artists, artistIds),
      };
    }
  }
}

/**
 * Todas las secciones publicadas, resueltas y en orden.
 *
 * Es lo que piden la app y la web para pintar la portada: una sola llamada
 * en vez de que cada cliente reimplemente "lo nuevo" y "top álbumes" por su
 * cuenta y terminen mostrando cosas distintas.
 */
export async function getPublishedSections(): Promise<ResolvedSection[]> {
  const sections = await prisma.editorialSection.findMany({
    where: { isPublished: true },
    orderBy: { position: 'asc' },
    include: { items: true },
  });

  // En paralelo: son independientes y serializarlas sumaría sus latencias.
  const resolved = await Promise.all(sections.map(resolveOne));

  // Una sección automática sin contenido (catálogo vacío, sin reproducciones)
  // se omite en vez de mandar un carrusel vacío que el cliente tendría que
  // saber esconder.
  return resolved.filter((s) => s.tracks.length + s.albums.length + s.artists.length > 0);
}

/**
 * Una sección publicada por su slug, para la página `/seccion/:slug`.
 *
 * Sólo devuelve publicadas: un slug de borrador no debe ser accesible por
 * URL aunque alguien la adivine.
 */
export async function getPublishedSectionBySlug(slug: string): Promise<ResolvedSection | null> {
  const section = await prisma.editorialSection.findFirst({
    where: { slug, isPublished: true },
    include: { items: true },
  });
  return section ? resolveOne(section) : null;
}

/** Igual que la anterior pero sin filtrar por publicada — para la vista previa del panel. */
export async function getSectionForPreview(id: string): Promise<ResolvedSection | null> {
  const section = await prisma.editorialSection.findUnique({ where: { id }, include: { items: true } });
  return section ? resolveOne(section) : null;
}
