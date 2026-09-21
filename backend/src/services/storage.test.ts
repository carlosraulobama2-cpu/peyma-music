import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';

/**
 * Pruebas del almacenamiento.
 *
 * Se centran en las dos cosas que se pueden romper en silencio y sólo se
 * notan en producción:
 *
 *  1. Que la URL pública y la clave del objeto sean convertibles en ambos
 *     sentidos. Si se rompe, las subidas "funcionan" (se escriben en el
 *     bucket) pero luego no se pueden releer ni borrar, y el fallo aparece
 *     días después al reprocesar o al borrar una cuenta.
 *  2. Que una URL ajena NUNCA se interprete como una clave de nuestro
 *     bucket, porque eso convertiría un enlace externo en una ruta interna.
 *
 * El camino contra un bucket real no se simula aquí: para eso está
 * `npm run storage:check`, que hace un viaje completo de ida y vuelta contra
 * el bucket que esté configurado de verdad.
 */

const ENV_KEYS = [
  'S3_BUCKET',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
  'S3_ENDPOINT',
  'S3_REGION',
  'S3_PUBLIC_BASE_URL',
] as const;

const originalEnv: Record<string, string | undefined> = {};

before(() => {
  for (const key of ENV_KEYS) originalEnv[key] = process.env[key];
});

after(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

describe('objectStorage — claves y URLs públicas', () => {
  test('la URL pública y la clave son convertibles en ambos sentidos', async () => {
    process.env.S3_BUCKET = 'peyma-test';
    process.env.S3_ACCESS_KEY_ID = 'clave';
    process.env.S3_SECRET_ACCESS_KEY = 'secreto';
    process.env.S3_PUBLIC_BASE_URL = 'https://cdn.peyma.test';

    const mod = await import('./objectStorage');
    mod.resetObjectStorageCache();

    const key = mod.uploadObjectKey('upload-1', 'audio-abc.mp3');
    assert.equal(key, 'uploads/upload-1/audio-abc.mp3');

    const url = mod.publicUrlFor(key);
    assert.equal(url, 'https://cdn.peyma.test/uploads/upload-1/audio-abc.mp3');

    // El viaje de vuelta es lo que usa `readFile` para releer un máster.
    assert.equal(mod.objectKeyFromPublicUrl(url), key);

    mod.resetObjectStorageCache();
  });

  test('una URL que no es nuestra no produce clave', async () => {
    process.env.S3_BUCKET = 'peyma-test';
    process.env.S3_ACCESS_KEY_ID = 'clave';
    process.env.S3_SECRET_ACCESS_KEY = 'secreto';
    process.env.S3_PUBLIC_BASE_URL = 'https://cdn.peyma.test';

    const mod = await import('./objectStorage');
    mod.resetObjectStorageCache();

    // Del catálogo real: estas pistas viven en Internet Archive, no en el
    // bucket. Tratarlas como objetos nuestros sería intentar borrarlas.
    assert.equal(mod.objectKeyFromPublicUrl('https://archive.org/download/algo/pista.mp3'), null);
    // Un prefijo parecido pero de otro dominio tampoco cuenta.
    assert.equal(mod.objectKeyFromPublicUrl('https://cdn.peyma.test.evil.com/uploads/x.mp3'), null);
    // Ni un intento de salirse de la carpeta.
    assert.equal(mod.objectKeyFromPublicUrl('https://cdn.peyma.test/../../secreto'), null);

    mod.resetObjectStorageCache();
  });

  test('una variable declarada pero vacía cuenta como ausente', async () => {
    process.env.S3_BUCKET = 'peyma-test';
    process.env.S3_ACCESS_KEY_ID = 'clave';
    process.env.S3_SECRET_ACCESS_KEY = 'secreto';
    process.env.S3_ENDPOINT = 'https://cuenta.r2.cloudflarestorage.com';
    // Así queda un `S3_PUBLIC_BASE_URL=` suelto en un .env, o un campo vacío
    // en el panel de Render. Con `??` esto pasaba de largo y la base pública
    // quedaba en "", así que cada audioUrl guardado era una ruta sin dominio.
    process.env.S3_PUBLIC_BASE_URL = '';
    process.env.S3_REGION = '   ';

    const mod = await import('./objectStorage');
    mod.resetObjectStorageCache();

    const url = mod.publicUrlFor('uploads/a/b.mp3');
    assert.equal(url, 'https://cuenta.r2.cloudflarestorage.com/peyma-test/uploads/a/b.mp3');
    assert.ok(url.startsWith('https://'), 'la URL pública tiene que llevar dominio');

    mod.resetObjectStorageCache();
  });

  test('sin credenciales el almacenamiento de objetos queda apagado', async () => {
    for (const key of ENV_KEYS) delete process.env[key];

    const mod = await import('./objectStorage');
    mod.resetObjectStorageCache();

    assert.equal(mod.isObjectStorageEnabled(), false);
    // Apagado significa apagado: no se devuelve una clave a medias.
    assert.equal(mod.objectKeyFromPublicUrl('https://cualquier.cosa/x.mp3'), null);

    mod.resetObjectStorageCache();
  });
});

describe('storage — disco local', () => {
  test('guarda, relee y borra una subida', async () => {
    // El servicio resuelve la raíz desde `process.cwd()`, así que se trabaja
    // en un directorio temporal para no ensuciar ./uploads del proyecto.
    const previousCwd = process.cwd();
    const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'peyma-storage-'));
    process.chdir(sandbox);

    try {
      const { storageService } = await import('./storage');

      const contenido = Buffer.from('audio de prueba');
      const stored = await storageService.saveFile('upload-1', 'audio', contenido, 'cancion.mp3');

      assert.match(stored.url, /^\/uploads\/upload-1\/audio-[0-9a-f-]+\.mp3$/);
      assert.equal(stored.sizeBytes, contenido.byteLength);

      // Releer por URL es lo que hace el paso de análisis.
      assert.deepEqual(await storageService.readFile(stored.url), contenido);

      // Y ffmpeg necesita la ruta en disco.
      const local = storageService.localPathForUrl(stored.url);
      assert.ok(local, 'en modo local tiene que haber una ruta de disco');
      assert.equal((await fs.stat(local)).size, contenido.byteLength);

      await storageService.deleteUploadFiles('upload-1');
      await assert.rejects(() => storageService.readFile(stored.url));
    } finally {
      process.chdir(previousCwd);
      await fs.rm(sandbox, { recursive: true, force: true });
    }
  });

  test('una URL externa no se confunde con un archivo local', async () => {
    const { storageService } = await import('./storage');
    assert.equal(storageService.localPathForUrl('https://archive.org/download/algo/pista.mp3'), null);
  });
});
