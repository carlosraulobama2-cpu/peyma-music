/**
 * Peyma Music — Foto de perfil: cámara o galería → bucket → perfil
 *
 * Sustituye al campo donde había que pegar una URL a mano. Aquel campo no
 * era sólo incómodo: obligaba a que la foto ya estuviera publicada en algún
 * sitio de internet, así que en la práctica casi nadie ponía una.
 *
 * El recorrido es: se elige la imagen, se pide una URL firmada a la API, el
 * archivo sube DIRECTO al bucket (sin pasar por nuestro servidor) y por
 * último se guarda la URL pública en el perfil.
 */
import * as ImagePicker from 'expo-image-picker';
import { http } from './httpClient';

/**
 * Calidad de compresión al elegir la imagen.
 *
 * El recorte cuadrado obligatorio ya quita la mayor parte del peso de una
 * foto de móvil, y 0,7 baja bastante más sin que se note en un círculo de
 * 120 px. No se reescala a un lado fijo porque haría falta
 * `expo-image-manipulator`, un módulo nativo más: la foto sube algo más
 * grande de lo ideal (unos cientos de KB) a cambio de no añadir una
 * dependencia nativa que obligaría a recompilar la app.
 */
const IMAGE_QUALITY = 0.7;

export interface PickedImage {
  uri: string;
  contentType: string;
}

export class PermissionDeniedError extends Error {
  constructor(source: 'camera' | 'library') {
    super(
      source === 'camera'
        ? 'Necesitamos permiso para usar la cámara. Puedes activarlo en los ajustes del teléfono.'
        : 'Necesitamos permiso para ver tus fotos. Puedes activarlo en los ajustes del teléfono.',
    );
    this.name = 'PermissionDeniedError';
  }
}

/**
 * Deduce el tipo de contenido.
 *
 * `expo-image-picker` trae `mimeType` en las plataformas donde el sistema lo
 * da, pero no siempre; se cae a la extensión y, en último caso, a JPEG, que
 * es lo que produce el recorte del propio selector.
 */
function resolveContentType(asset: ImagePicker.ImagePickerAsset): string {
  if (asset.mimeType && /^image\/(jpeg|png|webp)$/.test(asset.mimeType)) return asset.mimeType;

  const extension = asset.uri.split('?')[0]?.split('.').pop()?.toLowerCase();
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  return 'image/jpeg';
}

const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  // Recorte cuadrado obligatorio: el avatar se muestra en círculo en todas
  // partes, y dejar que suban un panorama significa recortarlo por el centro
  // en el cliente, que casi nunca acierta con dónde está la cara.
  allowsEditing: true,
  aspect: [1, 1],
  quality: IMAGE_QUALITY,
};

/** Abre la cámara. Lanza `PermissionDeniedError` si el usuario no da permiso. */
export async function takePhoto(): Promise<PickedImage | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) throw new PermissionDeniedError('camera');

  const result = await ImagePicker.launchCameraAsync(PICKER_OPTIONS);
  if (result.canceled || !result.assets[0]) return null;

  return { uri: result.assets[0].uri, contentType: resolveContentType(result.assets[0]) };
}

/** Abre la galería. Lanza `PermissionDeniedError` si el usuario no da permiso. */
export async function pickFromLibrary(): Promise<PickedImage | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new PermissionDeniedError('library');

  const result = await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
  if (result.canceled || !result.assets[0]) return null;

  return { uri: result.assets[0].uri, contentType: resolveContentType(result.assets[0]) };
}

interface PresignedUpload {
  uploadUrl: string;
  publicUrl: string;
}

/**
 * Sube la imagen al bucket y devuelve su URL pública.
 *
 * El PUT va con `fetch` directo y NO con nuestro `http`: la URL firmada ya
 * lleva su propia autorización dentro, y mandarle además nuestra cabecera
 * `Authorization` haría que la firma no cuadrara y S3 rechazara la subida.
 *
 * El `Content-Type` tiene que ser exactamente el que se declaró al firmar,
 * porque va incluido en la firma.
 */
export async function uploadAvatar(image: PickedImage): Promise<string> {
  const { upload } = await http.post<{ upload: PresignedUpload }>('/auth/me/avatar/presign', {
    contentType: image.contentType,
  });

  const file = await fetch(image.uri);
  const blob = await file.blob();

  const response = await fetch(upload.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': image.contentType },
    body: blob,
  });

  if (!response.ok) {
    throw new Error(`No se pudo subir la foto (${response.status}).`);
  }

  // Sólo ahora se guarda en el perfil: si se guardara antes de confirmar la
  // subida, un fallo a mitad dejaría al usuario con un avatar roto.
  await http.patch('/auth/me', { avatarUrl: upload.publicUrl });

  return upload.publicUrl;
}
