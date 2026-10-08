/**
 * Peyma Music — Fondo de las pantallas de cuenta (login y alta)
 *
 * Mosaico con portadas y fotos de artistas reales del catálogo (vía
 * `GET /home`, el mismo endpoint público que ya usan la web y Home) —
 * el mismo tratamiento que el hero del landing de la web. Nada de fotos de
 * stock de alguien con auriculares: la prueba de que hay música real detrás
 * es la música real.
 *
 * Se comparte entre `app/login.tsx` y `app/onboarding.tsx` — son la misma
 * app, así que repetirlo en los dos sitios habría sido la clase de
 * duplicación que el resto del código evita (ver `CoverMarquee` en la web,
 * reusada igual entre el hero y la cinta de transición).
 *
 * Es siempre oscuro, sin importar el tema elegido en Ajustes: es un momento
 * de marca (como el login de Spotify o Apple Music), no una pantalla de
 * datos que deba respetar "claro/oscuro". Cada pantalla que lo usa arma su
 * propia hoja de estilos con `getPalette('dark')` en vez de `useTheme()`,
 * para que el resto de sus colores (texto, inputs, botones) coincidan.
 */
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import type { HomeFeed } from '../services';

export interface MosaicImage {
  id: string;
  src: string;
}

/**
 * Dos portadas por cada foto de artista: así la textura la dominan tapas de
 * disco (más variedad de color) con caras reales salpicadas, no al revés —
 * mismo criterio que `buildMosaicImages` del landing web.
 */
export function buildMosaicImages(feed: HomeFeed | null): MosaicImage[] {
  if (!feed) return [];
  const deTracks = feed.rows
    .flatMap((row) => row.tracks)
    .map((track) => ({ id: `track-${track.id}`, src: track.coverUrl }));
  const deArtistas = feed.artists.map((artist) => ({ id: `artist-${artist.id}`, src: artist.imageUrl }));

  const mezcla: MosaicImage[] = [];
  let it = 0;
  let ia = 0;
  while (it < deTracks.length || ia < deArtistas.length) {
    if (it < deTracks.length) mezcla.push(deTracks[it++]);
    if (it < deTracks.length) mezcla.push(deTracks[it++]);
    if (ia < deArtistas.length) mezcla.push(deArtistas[ia++]);
  }
  return mezcla;
}

const MOSAIC_COLUMNAS = 5;
const MOSAIC_CELDAS = 40;

export function AuthBackdrop({ images }: { images: MosaicImage[] }) {
  if (images.length === 0) {
    // Sin catálogo (API caída o sin conexión) la pantalla no se queda en
    // blanco: cae al fondo oscuro liso de siempre.
    return <View style={[StyleSheet.absoluteFill, styles.fallback]} />;
  }

  const celdas = Array.from({ length: MOSAIC_CELDAS }, (_, indice) => images[indice % images.length]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={styles.grid}>
        {celdas.map((imagen, indice) => (
          <Image key={`${imagen.id}-${indice}`} source={imagen.src} style={styles.cell} contentFit="cover" />
        ))}
      </View>
      <LinearGradient
        colors={['rgba(10,10,10,0.45)', 'rgba(10,10,10,0.65)', '#0A0A0A']}
        locations={[0, 0.5, 0.92]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: '#0A0A0A',
  },
  grid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: `${100 / MOSAIC_COLUMNAS}%`,
    aspectRatio: 1,
    opacity: 0.6,
  },
});
