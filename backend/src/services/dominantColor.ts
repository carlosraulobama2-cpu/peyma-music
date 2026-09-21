/**
 * Peyma Music API — Color dominante de una portada
 *
 * Alimenta el degradado de las tarjetas grandes de la portada (fila VIP) y
 * el fondo del perfil de artista, como hacen Spotify y Apple Music.
 *
 * Cómo: se le pide a ffmpeg que escale la imagen a 1×1 píxel y se lee ese
 * píxel. El reescalado con área promedia todos los píxeles de origen, así
 * que el resultado ES la media cromática de la portada.
 *
 * Por qué así y no con `sharp` o una cuantización k-means: ffmpeg ya está
 * instalado para el audio, sabe leer URLs remotas y decodifica JPEG, PNG y
 * WebP. Añadir una librería de imágenes (~40 MB de binarios nativos) para
 * obtener tres números sería desproporcionado.
 *
 * Límite conocido: la media no es lo mismo que "el color que más destaca".
 * Una portada mitad negra y mitad roja da un rojo oscuro, no rojo puro. Para
 * un fondo de degradado eso es correcto — es justamente el color que mejor
 * se funde con la imagen — pero no sirve como "color de acento".
 */
import { runFfmpeg } from './ffmpeg';

/** Mínimo de luminancia para que el texto blanco encima siga siendo legible. */
const MAX_LUMINANCE_FOR_BACKGROUND = 140;

export interface DominantColor {
  hex: string;
  rgb: [number, number, number];
  /** Luminancia percibida 0–255. Permite decidir el color del texto encima. */
  luminance: number;
}

/** Luminancia percibida (ITU-R BT.601): el verde pesa más porque el ojo lo ve más brillante. */
function luminanceOf(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((value) => Math.round(value).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Oscurece el color hasta que el texto blanco encima sea legible.
 *
 * Una portada muy clara daría un degradado casi blanco sobre el que el
 * título en blanco desaparecería. En vez de elegir texto oscuro a veces y
 * claro otras (dos estilos distintos según la imagen, inconsistente), se
 * baja el color hasta un techo de luminancia fijo.
 */
function ensureReadable(r: number, g: number, b: number): [number, number, number] {
  const luminance = luminanceOf(r, g, b);
  if (luminance <= MAX_LUMINANCE_FOR_BACKGROUND) return [r, g, b];

  const factor = MAX_LUMINANCE_FOR_BACKGROUND / luminance;
  return [r * factor, g * factor, b * factor];
}

/**
 * Extrae el color dominante de una imagen local o remota.
 *
 * Devuelve `null` en vez de lanzar si la imagen no se puede leer: una
 * portada rota debe dejar la tarjeta con su degradado por defecto, no
 * romper la carga de toda la portada de la app.
 */
export async function extractDominantColor(imageUrl: string): Promise<DominantColor | null> {
  // Lista blanca de esquemas, igual que en el procesamiento de audio: ffmpeg
  // soporta `file:` y `subfile:`, y una URL que venga de la base no debe
  // poder convertirse en lectura de disco del servidor.
  if (!/^https?:\/\//i.test(imageUrl) && !imageUrl.startsWith('/uploads/')) return null;

  try {
    const { stdout } = await runFfmpeg(
      [
        '-hide_banner',
        '-loglevel', 'error',
        '-i', imageUrl,
        // `scale=1:1` promedia toda la imagen en un único píxel.
        '-vf', 'scale=1:1',
        '-frames:v', '1', // una portada animada (GIF/WebP) daría varios
        '-f', 'rawvideo',
        '-pix_fmt', 'rgb24',
        '-',
      ],
      { captureStdout: true, timeoutMs: 30_000 },
    );

    if (stdout.length < 3) return null;

    const [r, g, b] = ensureReadable(stdout[0]!, stdout[1]!, stdout[2]!);
    return {
      hex: toHex(r!, g!, b!),
      rgb: [Math.round(r!), Math.round(g!), Math.round(b!)],
      luminance: Math.round(luminanceOf(r!, g!, b!)),
    };
  } catch {
    return null;
  }
}
