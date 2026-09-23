"use client";

import { http } from "./httpClient";
import { contentTypeOf } from "./fileTypes";

/**
 * Foto de perfil: del archivo del usuario al bucket, sin pasar por la API.
 *
 * Sustituye al campo donde había que pegar la URL de una imagen ya
 * publicada en internet — que en la práctica hacía que casi nadie pusiera
 * foto.
 *
 * La misma secuencia que en la app: se pide una URL firmada, se sube el
 * archivo directo al bucket y sólo entonces se guarda la URL en el perfil.
 */

/** Lo que acepta el bucket. Debe coincidir con `avatarPresignSchema` del backend. */
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Tope de tamaño.
 *
 * La foto de un móvil moderno pasa de 5 MB, y se muestra en un círculo de
 * 96 px. Rechazarla aquí da un mensaje claro al instante, en vez de una
 * subida larga que acabe fallando.
 */
const MAX_BYTES = 8 * 1024 * 1024;

interface PresignedUpload {
  uploadUrl: string;
  publicUrl: string;
}

export function describeRejection(file: File): string | null {
  // Por la extensión y no por `file.type`: en Windows el navegador saca ese
  // tipo del registro del sistema, que a menudo no tiene entrada para .jpg o
  // .webp, y entonces un archivo válido llegaba aquí sin tipo y se rechazaba.
  if (!ALLOWED_TYPES.has(contentTypeOf(file))) {
    return "Formato no admitido. Usa JPG, PNG o WebP.";
  }
  if (file.size > MAX_BYTES) {
    return `La imagen pesa ${(file.size / 1024 / 1024).toFixed(1)} MB y el máximo son 8 MB.`;
  }
  return null;
}

/**
 * Sube una imagen al bucket y devuelve su URL pública, SIN tocar el perfil.
 *
 * Es la foto del perfil de artista, que no es lo mismo que el avatar de la
 * cuenta: una persona puede llamarse Ana y su proyecto "Dúo Sombra". Antes
 * la app resolvía esto reutilizando el avatar del usuario (y, si no tenía,
 * una URL de archive.org escrita a mano), con lo que el artista heredaba
 * una foto que no eligió.
 *
 * Aprovecha el mismo endpoint de URL firmada porque el bucket y las reglas
 * de tipo y tamaño son los mismos; lo único que no hace es el `PATCH` final
 * al perfil.
 */
export async function uploadImageToBucket(file: File): Promise<string> {
  const rejection = describeRejection(file);
  if (rejection) throw new Error(rejection);

  const contentType = contentTypeOf(file);
  const { upload } = await http.post<{ upload: PresignedUpload }>("/auth/me/avatar/presign", {
    contentType,
  });

  const response = await fetch(upload.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: file,
  });

  if (!response.ok) {
    throw new Error(`No se pudo subir la imagen (${response.status}).`);
  }

  return upload.publicUrl;
}

/** Sube la imagen y devuelve su URL pública, ya guardada en el perfil. */
export async function uploadAvatar(file: File): Promise<string> {
  const rejection = describeRejection(file);
  if (rejection) throw new Error(rejection);

  const contentType = contentTypeOf(file);
  const { upload } = await http.post<{ upload: PresignedUpload }>("/auth/me/avatar/presign", {
    contentType,
  });

  // `fetch` a pelo y no nuestro `http`: la URL firmada lleva su propia
  // autorización dentro, y añadirle nuestra cabecera `Authorization` haría
  // que la firma no cuadrara y el bucket rechazara la subida.
  const response = await fetch(upload.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: file,
  });

  if (!response.ok) {
    throw new Error(`No se pudo subir la foto (${response.status}).`);
  }

  // Sólo ahora se guarda: si se guardara antes de confirmar la subida, un
  // fallo a mitad dejaría al usuario con un avatar roto.
  await http.patch("/auth/me", { avatarUrl: upload.publicUrl });

  return upload.publicUrl;
}
