/**
 * Peyma Music — Importa música REAL con licencia libre
 *
 * Sustituye el catálogo de ejemplo (artistas inventados apuntando a un host
 * de audio de pruebas) por grabaciones de verdad, de artistas de verdad,
 * publicadas bajo Creative Commons Attribution 3.0 en Internet Archive.
 *
 * Por qué CC-BY y no cualquier cosa: es de las pocas licencias que permite
 * USO COMERCIAL mientras se dé atribución. Las variantes NonCommercial
 * (by-nc, by-nc-nd), que son la mayoría del archivo, no servirían para una
 * plataforma de streaming real. La atribución se guarda en `Track.label` y
 * en la biografía del artista, y sale en los créditos de la app.
 *
 * Qué NO hace: no descarga nada. Guarda la URL de Internet Archive, que
 * responde con `Accept-Ranges` y permite saltar en la barra de progreso.
 *
 * Uso:  npx tsx prisma/importRealMusic.ts [--dry]
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL }),
});

const DRY_RUN = process.argv.includes('--dry');

/**
 * Álbumes elegidos a mano de la colección `netlabels`, todos CC-BY 3.0.
 *
 * Se eligen a mano y no por búsqueda automática porque hace falta
 * comprobar uno a uno que tienen MP3 servibles, títulos legibles y que el
 * contenido es música (el archivo mezcla música con grabaciones de campo,
 * charlas y ruido ambiente).
 */
// `genre` es el slug de un `MusicGenre` (tabla editable desde el panel).
const ALBUMS: { identifier: string; genre: string; mood: string }[] = [
  { identifier: 'LeeRosevere_MusicForPodcasts3', genre: 'ambient', mood: 'Relajado' },
  { identifier: 'Escape_From_Lhasa', genre: 'electronic', mood: 'Soñador' },
  { identifier: 'AstralnauticsForBeginners', genre: 'electronic', mood: 'Intenso' },
  { identifier: 'breaknorth', genre: 'hiphop', mood: 'Enérgico' },
  { identifier: 'elevatormusic', genre: 'lofi', mood: 'Relajado' },
  { identifier: 'stochastic_arts', genre: 'electronic', mood: 'Melancólico' },
  { identifier: 'BLUnderwood_Geo_Sync_Deluxe', genre: 'ambient', mood: 'Soñador' },
  { identifier: 'badpanda006', genre: 'rock', mood: 'Enérgico' },
];

interface ArchiveFile {
  name: string;
  format?: string;
  length?: string;
  size?: string;
  title?: string;
  track?: string;
  /** `original` o `derivative`. */
  source?: string;
  /** En los derivados, el archivo máster del que salieron. */
  original?: string;
}

/** Duraciones aceptables para una canción. Fuera de esto es otra cosa. */
const MIN_TRACK_SECONDS = 30;
const MAX_TRACK_SECONDS = 15 * 60;

/**
 * Elige UNA codificación por grabación.
 *
 * Internet Archive guarda varias versiones del mismo máster (VBR, 64 kbps…)
 * y todas terminan en `.mp3`. Sin agrupar por el campo `original`, la misma
 * canción entraría tres veces al catálogo — que es exactamente lo que pasó
 * en la primera prueba.
 *
 * Además descarta lo que no puede ser una canción: por debajo de 30 s son
 * cortinillas, y por encima de 15 minutos suele ser el álbum entero en un
 * único archivo o un metadato mal puesto (apareció uno de 9 horas).
 */
function pickBestEncodings(files: ArchiveFile[]): ArchiveFile[] {
  const byRecording = new Map<string, ArchiveFile>();

  for (const file of files) {
    if (!/\.mp3$/i.test(file.name)) continue;

    const seconds = parseDuration(file.length);
    if (seconds < MIN_TRACK_SECONDS || seconds > MAX_TRACK_SECONDS) continue;

    // Los derivados comparten `original`; un mp3 subido tal cual se agrupa
    // por su propio nombre.
    const key = file.original ?? file.name;
    const current = byRecording.get(key);

    // Se prefiere la de mayor tamaño, que es la de mejor calidad de las
    // disponibles. Comparar por nombre de formato sería frágil: las
    // etiquetas varían entre elementos del archivo.
    if (!current || Number(file.size ?? 0) > Number(current.size ?? 0)) {
      byRecording.set(key, file);
    }
  }

  return [...byRecording.values()];
}

interface ArchiveMetadata {
  metadata?: {
    identifier?: string;
    title?: string;
    creator?: string | string[];
    licenseurl?: string;
    date?: string;
    description?: string;
  };
  files?: ArchiveFile[];
}

/** Sólo se aceptan licencias que permitan uso comercial. */
function isCommerciallyUsable(licenseUrl: string | undefined): boolean {
  if (!licenseUrl) return false;
  return /creativecommons\.org\/(licenses\/by(-sa)?\/|publicdomain\/)/.test(licenseUrl);
}

/**
 * "127.66" o "74:32" → segundos.
 *
 * Internet Archive usa los dos formatos según cómo se subiera el archivo.
 */
function parseDuration(raw: string | undefined): number {
  if (!raw) return 0;
  if (raw.includes(':')) {
    const parts = raw.split(':').map(Number);
    return parts.reduce((total, part) => total * 60 + (Number.isFinite(part) ? part : 0), 0);
  }
  const seconds = Number(raw);
  return Number.isFinite(seconds) ? Math.round(seconds) : 0;
}

/** Limpia el título: quita el número de pista y la extensión. */
function cleanTitle(file: ArchiveFile): string {
  if (file.title?.trim()) return file.title.trim();
  return file.name
    .replace(/\.mp3$/i, '')
    .replace(/^\d{1,2}[\s._-]+/, '')
    .replace(/_/g, ' ')
    .trim();
}

function firstCreator(creator: string | string[] | undefined): string | null {
  if (!creator) return null;
  const value = Array.isArray(creator) ? creator[0] : creator;
  return value?.trim() || null;
}

async function fetchMetadata(identifier: string): Promise<ArchiveMetadata | null> {
  try {
    const response = await fetch(`https://archive.org/metadata/${identifier}`, {
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) return null;
    return (await response.json()) as ArchiveMetadata;
  } catch {
    return null;
  }
}

/**
 * Comprueba que el archivo existe y soporta peticiones parciales.
 *
 * Sin `Accept-Ranges` el reproductor no puede saltar en la barra: tendría
 * que volver a descargar desde el principio en cada salto. Se verifica
 * ANTES de guardar, porque una pista que no se puede reproducir en el
 * catálogo es peor que una pista que no está.
 */
async function verifyPlayable(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      headers: { Range: 'bytes=0-1023' },
      signal: AbortSignal.timeout(30_000),
    });
    return response.status === 206 || (response.ok && response.headers.get('accept-ranges') === 'bytes');
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  console.log(DRY_RUN ? '— SIMULACRO: no se escribe nada —\n' : '— Importando música real —\n');

  let importedArtists = 0;
  let importedTracks = 0;
  let skipped = 0;

  for (const entry of ALBUMS) {
    const meta = await fetchMetadata(entry.identifier);
    if (!meta?.metadata) {
      console.log(`✗ ${entry.identifier}: sin metadatos`);
      skipped++;
      continue;
    }

    const { title: albumTitle, creator, licenseurl, date, description } = meta.metadata;
    const artistName = firstCreator(creator);

    if (!artistName || !albumTitle) {
      console.log(`✗ ${entry.identifier}: sin artista o título`);
      skipped++;
      continue;
    }

    if (!isCommerciallyUsable(licenseurl)) {
      console.log(`✗ ${entry.identifier}: licencia no apta (${licenseurl ?? 'ninguna'})`);
      skipped++;
      continue;
    }

    const mp3s = pickBestEncodings(meta.files ?? []).slice(0, 6);

    if (mp3s.length === 0) {
      console.log(`✗ ${entry.identifier}: sin MP3 utilizables`);
      skipped++;
      continue;
    }

    const coverUrl = `https://archive.org/services/img/${entry.identifier}`;
    const releaseYear = Number(String(date ?? '').slice(0, 4)) || new Date().getFullYear();

    console.log(`• ${artistName} — ${albumTitle} (${mp3s.length} pistas)`);

    if (DRY_RUN) {
      for (const file of mp3s) console.log(`    ${cleanTitle(file)} · ${parseDuration(file.length)}s`);
      continue;
    }

    const artist = await prisma.artist.upsert({
      where: { name: artistName },
      update: {},
      create: {
        name: artistName,
        imageUrl: coverUrl,
        genres: [entry.genre],
        // La atribución es una condición de la licencia, no un adorno.
        bio: `${String(description ?? '').replace(/<[^>]*>/g, '').slice(0, 400)}\n\nPublicado bajo Creative Commons BY 3.0 vía Internet Archive.`.trim(),
      },
    });
    importedArtists++;

    const album = await prisma.album.upsert({
      where: { id: `ia-${entry.identifier}`.slice(0, 30) },
      update: {},
      create: {
        id: `ia-${entry.identifier}`.slice(0, 30),
        title: albumTitle.slice(0, 200),
        artistId: artist.id,
        coverUrl,
        releaseYear,
      },
    });

    for (const file of mp3s) {
      const audioUrl = `https://archive.org/download/${entry.identifier}/${encodeURIComponent(file.name)}`;

      if (!(await verifyPlayable(audioUrl))) {
        console.log(`    ✗ ${cleanTitle(file)}: no se puede reproducir`);
        skipped++;
        continue;
      }

      const title = cleanTitle(file).slice(0, 200);
      const duration = parseDuration(file.length);

      // Sin clave única natural para (artista, título), se busca primero:
      // volver a correr el script no debe duplicar el catálogo.
      const existing = await prisma.track.findFirst({ where: { artistId: artist.id, title } });
      if (existing) continue;

      // El ritmo tiene que existir ya en `MusicGenre` (se curan desde Ritmos
      // en el panel). Se resuelve el id y se falla ruidosamente si no está,
      // que es mejor que importar un catálogo entero sin género.
      const genero = await prisma.musicGenre.findUnique({
        where: { slug: entry.genre },
        select: { id: true },
      });
      if (!genero) {
        throw new Error(`El género "${entry.genre}" no existe en MusicGenre. Créalo en el panel antes de importar.`);
      }

      await prisma.track.create({
        data: {
          title,
          duration,
          coverUrl,
          audioUrl,
          genreId: genero.id,
          mood: entry.mood,
          artistId: artist.id,
          albumId: album.id,
          status: 'APPROVED',
          label: 'Internet Archive · CC BY 3.0',
        },
      });
      importedTracks++;
      console.log(`    ✓ ${title} · ${duration}s`);
    }
  }

  console.log(`\nArtistas: ${importedArtists} · Pistas nuevas: ${importedTracks} · Descartadas: ${skipped}`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
