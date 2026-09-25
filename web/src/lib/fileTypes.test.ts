import { describe, it, expect } from "vitest";
import { AUDIO_ACCEPT, IMAGE_ACCEPT, contentTypeOf, describeAudioRejection, describeCoverRejection } from "./fileTypes";

/**
 * Peyma Music (web) — El tipo de un archivo elegido
 *
 * Estas pruebas fijan dos fallos que llegaron a producción y costaron una
 * subida cada uno:
 *
 *  1. El diálogo de archivos se abría VACÍO en Windows. El `accept` sólo
 *     llevaba tipos MIME, y el navegador los traduce a extensiones con el
 *     registro del sistema, que a menudo no tiene entrada para .flac o .webp
 *     — así que el filtro no casaba con nada.
 *  2. Una canción que se subía y no sonaba: era un MP3 llamado ".mpeg", que
 *     Windows registra como `video/mpeg`.
 */

/** Construye un File de mentira: sólo importan nombre, tipo y tamaño. */
function archivo(name: string, type: string, size = 1024): File {
  const file = new File([new Uint8Array(1)], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

describe("accept de los campos de archivo", () => {
  it("lleva extensiones literales y no sólo tipos MIME", () => {
    // Sin esto, el diálogo de Windows no enseña los archivos del usuario.
    for (const extension of [".mp3", ".wav", ".m4a", ".ogg", ".flac"]) {
      expect(AUDIO_ACCEPT).toContain(extension);
    }
    for (const extension of [".jpg", ".png", ".webp"]) {
      expect(IMAGE_ACCEPT).toContain(extension);
    }
  });

  it("acepta .mpeg y .mpga, que son MP3 con otro nombre", () => {
    expect(AUDIO_ACCEPT).toContain(".mpeg");
    expect(AUDIO_ACCEPT).toContain(".mpga");
  });
});

describe("contentTypeOf", () => {
  it("se fía del navegador cuando dice algo que el servidor acepta", () => {
    expect(contentTypeOf(archivo("cancion.mp3", "audio/mpeg"))).toBe("audio/mpeg");
  });

  it("cae en la extensión cuando el navegador no sabe el tipo", () => {
    // Windows sin la clave del registro: `file.type` llega vacío.
    expect(contentTypeOf(archivo("cancion.mp3", ""))).toBe("audio/mpeg");
    expect(contentTypeOf(archivo("portada.webp", ""))).toBe("image/webp");
  });

  it("corrige el tipo cuando el navegador MIENTE: .mpeg no es vídeo", () => {
    expect(contentTypeOf(archivo("Astro Plane.mp3.mpeg", "video/mpeg"))).toBe("audio/mpeg");
  });

  it("devuelve cadena vacía si no reconoce nada", () => {
    expect(contentTypeOf(archivo("documento.pdf", "application/pdf"))).toBe("");
  });
});

describe("validación al elegir el archivo", () => {
  it("rechaza un formato que el servidor no admite", () => {
    expect(describeAudioRejection(archivo("nota.aac", "audio/aac"))).toMatch(/Formato no admitido/);
  });

  it("rechaza por tamaño antes de subir nada", () => {
    const enorme = archivo("master.wav", "audio/wav", 45 * 1024 * 1024);
    expect(describeAudioRejection(enorme)).toMatch(/45\.0 MB.*40 MB/);
  });

  it("acepta un MP3 normal", () => {
    expect(describeAudioRejection(archivo("cancion.mp3", "audio/mpeg"))).toBeNull();
  });

  it("la portada tiene su propio tope, más bajo", () => {
    expect(describeCoverRejection(archivo("portada.jpg", "image/jpeg", 9 * 1024 * 1024))).toMatch(/8 MB/);
    expect(describeCoverRejection(archivo("portada.jpg", "image/jpeg"))).toBeNull();
  });
});
