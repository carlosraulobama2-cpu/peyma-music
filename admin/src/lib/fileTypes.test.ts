import { describe, it, expect } from 'vitest';
import { AUDIO_ACCEPT, IMAGE_ACCEPT, contentTypeOf, describeAudioRejection, takeFile } from './fileTypes';

/**
 * Peyma Music (panel) — El tipo de un archivo elegido
 *
 * Gemelo de `web/src/lib/fileTypes.test.ts`, por el mismo motivo por el que
 * el módulo está duplicado: son dos aplicaciones sin paquete compartido. Si
 * una de las dos copias se corrige y la otra no, estas pruebas lo dicen.
 */

function archivo(name: string, type: string, size = 1024): File {
  const file = new File([new Uint8Array(1)], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

describe('accept de los campos de archivo', () => {
  it('lleva extensiones literales, no sólo tipos MIME', () => {
    for (const extension of ['.mp3', '.mpeg', '.wav', '.m4a', '.ogg', '.flac']) {
      expect(AUDIO_ACCEPT).toContain(extension);
    }
    expect(IMAGE_ACCEPT).toContain('.webp');
  });
});

describe('contentTypeOf', () => {
  it('cae en la extensión cuando el navegador no sabe el tipo', () => {
    expect(contentTypeOf(archivo('cancion.mp3', ''))).toBe('audio/mpeg');
  });

  it('corrige el tipo cuando el navegador miente: .mpeg no es vídeo', () => {
    expect(contentTypeOf(archivo('tema.mp3.mpeg', 'video/mpeg'))).toBe('audio/mpeg');
  });
});

describe('takeFile', () => {
  it('guarda el archivo y no avisa de nada cuando vale', () => {
    let guardado: File | null = null;
    let aviso: string | null = 'sin tocar';

    takeFile(
      { 0: archivo('cancion.mp3', 'audio/mpeg'), length: 1, item: () => null } as unknown as FileList,
      describeAudioRejection,
      (f) => (guardado = f),
      (m) => (aviso = m),
    );

    expect(guardado).not.toBeNull();
    expect(aviso).toBeNull();
  });

  it('avisa y NO guarda cuando el archivo no vale', () => {
    let guardado: File | null = archivo('viejo.mp3', 'audio/mpeg');
    let aviso: string | null = null;

    takeFile(
      { 0: archivo('nota.aac', 'audio/aac'), length: 1, item: () => null } as unknown as FileList,
      describeAudioRejection,
      (f) => (guardado = f),
      (m) => (aviso = m),
    );

    expect(guardado).toBeNull();
    expect(aviso).toMatch(/Formato no admitido/);
  });
});
