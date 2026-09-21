import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';

// Prisma 7 no lee DATABASE_URL solo — necesita el mismo driver adapter que
// usa el runtime en src/prismaClient.ts (ver ese archivo para el porqué).
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Sembrando la base de datos...');

  const passwordHash = await bcrypt.hash('demo12345', 12);
  const user = await prisma.user.upsert({
    where: { email: 'demo@peyma.music' },
    update: {},
    create: {
      email: 'demo@peyma.music',
      displayName: 'Usuario Demo',
      passwordHash,
      favoriteGenres: ['Electrónica', 'Indie Pop', 'Rock Alternativo'],
    },
  });
  console.log('✅ Usuario:', user.email);

  const artistSeeds = [
    {
      name: 'Luna Neón',
      imageUrl: 'https://picsum.photos/seed/artist1/300/300',
      genres: ['Electrónica', 'Synthwave'],
      bio: 'Proyecto de música electrónica que fusiona sonidos retro con producción moderna.',
    },
    {
      name: 'Estático',
      imageUrl: 'https://picsum.photos/seed/artist2/300/300',
      genres: ['Rock Alternativo', 'Post-punk'],
      bio: 'Banda de rock alternativo con influencias de post-punk y new wave.',
    },
    {
      name: 'Coral Andina',
      imageUrl: 'https://picsum.photos/seed/artist3/300/300',
      genres: ['Folk', 'World Music'],
      bio: 'Música que combina instrumentos andinos tradicionales con arreglos contemporáneos.',
    },
    {
      name: 'Nova Austral',
      imageUrl: 'https://picsum.photos/seed/artist4/300/300',
      genres: ['Indie Pop', 'Dream Pop'],
      bio: 'Dúo de indie pop con atmósferas etéreas y melodías envolventes.',
    },
    {
      name: 'Marea Baja',
      imageUrl: 'https://picsum.photos/seed/artist5/300/300',
      genres: ['Lo-Fi', 'Chillhop'],
      bio: 'Productor de lo-fi que samplea discos de vinilo encontrados en mercados de pulgas.',
    },
    {
      name: 'Cielo Partido',
      imageUrl: 'https://picsum.photos/seed/artist6/300/300',
      genres: ['Rock Alternativo', 'Shoegaze'],
      bio: 'Cuarteto de guitarras densas y voces sumergidas en reverb.',
    },
    {
      name: 'Río Sereno',
      imageUrl: 'https://picsum.photos/seed/artist7/300/300',
      genres: ['Ambient', 'Neoclásico'],
      bio: 'Piano y texturas electrónicas para acompañar la concentración.',
    },
    {
      name: 'Bloque Sur',
      imageUrl: 'https://picsum.photos/seed/artist8/300/300',
      genres: ['Hip-Hop', 'Trap'],
      bio: 'Rap en español con producción cruda y letras de barrio.',
    },
  ];

  const artists = await Promise.all(
    artistSeeds.map((data) =>
      prisma.artist.upsert({ where: { name: data.name }, update: {}, create: data }),
    ),
  );
  console.log('✅ Artistas:', artists.length);

  const albumSeeds = [
    { title: 'Sintetizador Estelar', artist: artists[0]!, coverUrl: 'https://picsum.photos/seed/album1/300/300', releaseYear: 2024 },
    { title: 'Circuito Abierto', artist: artists[1]!, coverUrl: 'https://picsum.photos/seed/album2/300/300', releaseYear: 2024 },
    { title: 'Tierra y Cielo', artist: artists[2]!, coverUrl: 'https://picsum.photos/seed/album3/300/300', releaseYear: 2023 },
    { title: 'Órbita', artist: artists[3]!, coverUrl: 'https://picsum.photos/seed/album4/300/300', releaseYear: 2024 },
    { title: 'Cinta Gastada', artist: artists[4]!, coverUrl: 'https://picsum.photos/seed/album5/300/300', releaseYear: 2025 },
    { title: 'Ruido Blanco', artist: artists[5]!, coverUrl: 'https://picsum.photos/seed/album6/300/300', releaseYear: 2024 },
    { title: 'Corriente Lenta', artist: artists[6]!, coverUrl: 'https://picsum.photos/seed/album7/300/300', releaseYear: 2025 },
    { title: 'Concreto', artist: artists[7]!, coverUrl: 'https://picsum.photos/seed/album8/300/300', releaseYear: 2025 },
  ];

  const albums = [];
  for (const seed of albumSeeds) {
    const existing = await prisma.album.findFirst({
      where: { title: seed.title, artistId: seed.artist.id },
    });
    const album =
      existing ??
      (await prisma.album.create({
        data: {
          title: seed.title,
          artistId: seed.artist.id,
          coverUrl: seed.coverUrl,
          releaseYear: seed.releaseYear,
        },
      }));
    albums.push(album);
  }
  console.log('✅ Álbumes:', albums.length);

  const trackSeeds = [
    { title: 'Horizonte Digital', artist: artists[0]!, album: albums[0]!, duration: 234, seed: 'track1' },
    { title: 'Noches de Cristal', artist: artists[0]!, album: albums[0]!, duration: 198, seed: 'track2' },
    { title: 'Pulso Urbano', artist: artists[1]!, album: albums[1]!, duration: 267, seed: 'track3' },
    { title: 'Amanecer Violeta', artist: artists[2]!, album: albums[2]!, duration: 312, seed: 'track4' },
    { title: 'Frecuencia Cero', artist: artists[1]!, album: albums[1]!, duration: 245, seed: 'track5' },
    { title: 'Ecos del Mar', artist: artists[2]!, album: albums[2]!, duration: 189, seed: 'track6' },
    { title: 'Gravedad', artist: artists[3]!, album: albums[3]!, duration: 278, seed: 'track7' },
    { title: 'Señales de Humo', artist: artists[3]!, album: albums[3]!, duration: 301, seed: 'track8' },
    { title: 'Café a las 3am', artist: artists[4]!, album: albums[4]!, duration: 172, seed: 'track9' },
    { title: 'Lluvia en la Ventana', artist: artists[4]!, album: albums[4]!, duration: 205, seed: 'track10' },
    { title: 'Muro de Sonido', artist: artists[5]!, album: albums[5]!, duration: 288, seed: 'track11' },
    { title: 'Distorsión Suave', artist: artists[5]!, album: albums[5]!, duration: 254, seed: 'track12' },
    { title: 'Caudal', artist: artists[6]!, album: albums[6]!, duration: 341, seed: 'track13' },
    { title: 'Niebla Matinal', artist: artists[6]!, album: albums[6]!, duration: 296, seed: 'track14' },
    { title: 'Bloque 7', artist: artists[7]!, album: albums[7]!, duration: 183, seed: 'track15' },
    { title: 'Esquina Norte', artist: artists[7]!, album: albums[7]!, duration: 211, seed: 'track16' },
  ];

  const tracks = [];
  for (const t of trackSeeds) {
    const existing = await prisma.track.findFirst({
      where: { title: t.title, artistId: t.artist.id, albumId: t.album.id },
    });
    const track =
      existing ??
      (await prisma.track.create({
        data: {
          title: t.title,
          artistId: t.artist.id,
          albumId: t.album.id,
          duration: t.duration,
          coverUrl: `https://picsum.photos/seed/${t.seed}/300/300`,
          audioUrl: `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-${trackSeeds.indexOf(t) + 1}.mp3`,
          // Créditos de ejemplo: el modal de créditos necesita datos reales
          // en la base para mostrar algo que no sea "desconocido".
          composer: `${t.artist.name} / L. Herrera`,
          producer: trackSeeds.indexOf(t) % 2 === 0 ? 'Estudio Peyma' : 'M. Cardozo',
          label: 'Peyma Records',
          isrc: `ESPYM${String(2600 + trackSeeds.indexOf(t)).padStart(7, '0')}`,
          isExplicit: trackSeeds.indexOf(t) % 5 === 0,
        },
      }));
    tracks.push(track);
  }
  console.log('✅ Canciones:', tracks.length);

  // Backfill de créditos: las pistas sembradas antes de que existieran estas
  // columnas no se recrean (el seed es idempotente), así que se completan acá.
  let backfilled = 0;
  for (const [index, track] of tracks.entries()) {
    if (track.composer) continue;
    const artistName = trackSeeds[index]?.artist.name ?? 'Peyma';
    await prisma.track.update({
      where: { id: track.id },
      data: {
        composer: `${artistName} / L. Herrera`,
        producer: index % 2 === 0 ? 'Estudio Peyma' : 'M. Cardozo',
        label: 'Peyma Records',
        isrc: `ESPYM${String(2600 + index).padStart(7, '0')}`,
        isExplicit: index % 5 === 0,
      },
    });
    backfilled++;
  }
  if (backfilled > 0) console.log('✅ Créditos completados en', backfilled, 'canciones');

  const playlistSeeds = [
    { title: 'Mix del Día', description: 'Tu mezcla personalizada basada en lo que escuchas', coverUrl: 'https://picsum.photos/seed/playlist1/300/300', isPublic: true, trackIndexes: [0, 2, 4, 6] },
    { title: 'Concentración Total', description: 'Música para enfocarte y ser productivo', coverUrl: 'https://picsum.photos/seed/playlist2/300/300', isPublic: true, trackIndexes: [1, 3, 5, 7] },
    { title: 'Vibras Nocturnas', description: 'Los mejores tracks para la noche', coverUrl: 'https://picsum.photos/seed/playlist3/300/300', isPublic: false, trackIndexes: [0, 1, 7] },
  ];

  for (const seed of playlistSeeds) {
    const existing = await prisma.playlist.findFirst({ where: { title: seed.title, ownerId: user.id } });
    const playlist =
      existing ??
      (await prisma.playlist.create({
        data: {
          title: seed.title,
          description: seed.description,
          coverUrl: seed.coverUrl,
          isPublic: seed.isPublic,
          ownerId: user.id,
        },
      }));

    for (const [position, trackIndex] of seed.trackIndexes.entries()) {
      const track = tracks[trackIndex]!;
      await prisma.playlistTrack.upsert({
        where: { playlistId_trackId: { playlistId: playlist.id, trackId: track.id } },
        update: {},
        create: { playlistId: playlist.id, trackId: track.id, position },
      });
    }
  }
  console.log('✅ Playlists: 3');

  await prisma.favorite.createMany({
    data: [tracks[1]!, tracks[4]!, tracks[7]!].map((track) => ({ userId: user.id, trackId: track.id })),
    skipDuplicates: true,
  });
  console.log('✅ Favoritos añadidos');

  await prisma.follow.createMany({
    data: [artists[0]!, artists[3]!].map((artist) => ({ userId: user.id, artistId: artist.id })),
    skipDuplicates: true,
  });
  console.log('✅ Artistas seguidos');

  // Un puñado de oyentes sintéticos + reproducciones repartidas en los
  // últimos 28 días, para que GET /artists/:id/stats no dé siempre 0 en un
  // entorno recién sembrado. La cuenta real (COUNT DISTINCT userId) sale
  // sola de estas filas, no de un número fijo por artista.
  const listenerSeeds = await Promise.all(
    Array.from({ length: 5 }, (_, i) =>
      prisma.user.upsert({
        where: { email: `oyente${i + 1}@peyma.music` },
        update: {},
        create: {
          email: `oyente${i + 1}@peyma.music`,
          displayName: `Oyente Demo ${i + 1}`,
          passwordHash,
          favoriteGenres: [],
        },
      }),
    ),
  );
  const allListeners = [user, ...listenerSeeds];

  const existingStreamLogs = await prisma.streamLog.count();
  if (existingStreamLogs === 0) {
    const streamLogData = tracks.flatMap((track) =>
      allListeners
        .filter(() => Math.random() > 0.35) // no todos escuchan todo, para que los números no salgan idénticos
        .map((listener) => ({
          userId: listener.id,
          trackId: track.id,
          artistId: track.artistId,
          playedAt: new Date(Date.now() - Math.floor(Math.random() * 27) * 24 * 60 * 60 * 1000),
        })),
    );
    await prisma.streamLog.createMany({ data: streamLogData });
    console.log('✅ Reproducciones (últimos 28 días):', streamLogData.length);
  } else {
    console.log('↷ Ya había reproducciones sembradas, no se duplican');
  }

  console.log('🎉 Seed completo.');
}

main()
  .catch((error) => {
    console.error('❌ El seed falló:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
