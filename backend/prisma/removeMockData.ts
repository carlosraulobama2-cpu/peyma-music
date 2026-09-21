/**
 * Peyma Music — Borra el catálogo de ejemplo
 *
 * Los artistas del seed original apuntaban a un host de audio de pruebas
 * (soundhelix.com) con canciones genéricas. Ahora que hay música real con
 * licencia libre, ese catálogo sólo confunde: no se distingue a simple vista
 * lo que es real de lo que era relleno.
 *
 * Se identifican por la URL del audio, no por el nombre: el nombre es
 * editable desde el panel y alguien podría renombrarlos, mientras que la URL
 * es el rastro fiable de su origen.
 *
 * Uso:  npx tsx prisma/removeMockData.ts [--dry]
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL }),
});
const DRY = process.argv.includes('--dry');

async function main() {
  const mockTracks = await prisma.track.findMany({
    where: { audioUrl: { contains: 'soundhelix.com' } },
    select: { id: true, title: true, artistId: true },
  });
  const mockArtistIds = [...new Set(mockTracks.map((t) => t.artistId))];

  const artists = await prisma.artist.findMany({
    where: { id: { in: mockArtistIds } },
    select: {
      id: true,
      name: true,
      _count: { select: { tracks: true, albums: true, followers: true, streamLogs: true } },
    },
  });

  console.log(DRY ? '— SIMULACRO —\n' : '— Borrando catálogo de ejemplo —\n');
  console.log('Artistas de ejemplo:', artists.length, '| pistas:', mockTracks.length);
  for (const a of artists) {
    console.log(
      `  ${a.name.padEnd(16)} ${a._count.tracks} pistas · ${a._count.albums} álbumes · ` +
        `${a._count.followers} seguidores · ${a._count.streamLogs} reproducciones`,
    );
  }

  // Lo que se pierde al borrar en cascada, dicho antes de hacerlo.
  const streamLogs = await prisma.streamLog.count({ where: { artistId: { in: mockArtistIds } } });
  const playlistEntries = await prisma.playlistTrack.count({
    where: { trackId: { in: mockTracks.map((t) => t.id) } },
  });
  console.log(`\nEn cascada se borran: ${streamLogs} reproducciones y ${playlistEntries} entradas de playlist.`);

  if (DRY) {
    console.log('\n(simulacro: no se borró nada)');
    await prisma.$disconnect();
    return;
  }

  const deleted = await prisma.artist.deleteMany({ where: { id: { in: mockArtistIds } } });
  console.log(`\nBorrados ${deleted.count} artistas de ejemplo.`);

  console.log('Quedan:', await prisma.artist.count(), 'artistas y', await prisma.track.count(), 'pistas — todas reales.');
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
