/**
 * Peyma Music — Comprobación del bucket
 *
 *   npm run storage:check
 *
 * Hace un viaje completo de ida y vuelta contra el bucket que esté
 * configurado en `.env`: sube un archivo, comprueba que existe, lo descarga,
 * verifica que los bytes son los mismos, comprueba que la URL pública se
 * puede leer sin credenciales y lo borra.
 *
 * Existe porque "las variables están puestas" no significa "funciona". Los
 * fallos típicos de un bucket nuevo no se ven al arrancar: la clave no tiene
 * permiso de escritura, la región está mal, el bucket no es público de
 * lectura y las canciones dan 403 sólo cuando alguien intenta escucharlas.
 * Mejor descubrirlo con este comando que con un artista subiendo su disco.
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import {
  isObjectStorageEnabled,
  putObject,
  getObject,
  headObject,
  deleteObject,
  publicUrlFor,
  objectKeyFromPublicUrl,
} from '../src/services/objectStorage';

const CONTENIDO = Buffer.from(`peyma storage check ${new Date().toISOString()}`);

function ok(mensaje: string): void {
  console.log(`  ✓ ${mensaje}`);
}

function fallo(mensaje: string, detalle?: unknown): never {
  console.error(`  ✗ ${mensaje}`);
  if (detalle) console.error(`    ${detalle instanceof Error ? detalle.message : String(detalle)}`);
  process.exit(1);
}

async function main(): Promise<void> {
  console.log('\nComprobación del almacenamiento de objetos\n');

  if (!isObjectStorageEnabled()) {
    console.error('  ✗ No hay bucket configurado.');
    console.error('');
    console.error('    Faltan S3_BUCKET, S3_ACCESS_KEY_ID y/o S3_SECRET_ACCESS_KEY en backend/.env.');
    console.error('    Sin ellas el backend guarda en ./uploads, que en Render se borra en cada');
    console.error('    despliegue. Ver backend/.env.example para el detalle de cada variable.');
    process.exit(1);
  }

  console.log(`  bucket: ${process.env.S3_BUCKET}`);
  console.log(`  endpoint: ${process.env.S3_ENDPOINT || '(S3 de AWS)'}`);
  console.log(`  región: ${process.env.S3_REGION ?? 'auto'}\n`);

  const key = `diagnostico/storage-check-${randomUUID()}.txt`;
  let subido = false;

  try {
    try {
      await putObject(key, CONTENIDO, 'text/plain');
      subido = true;
      ok('escritura (PutObject)');
    } catch (error) {
      fallo('no se pudo escribir en el bucket — revisa la clave y sus permisos', error);
    }

    const info = await headObject(key).catch((error: unknown) => fallo('no se pudo consultar el objeto', error));
    if (!info) fallo('el objeto se subió pero no aparece: comprueba que el bucket es el correcto');
    if (info.sizeBytes !== CONTENIDO.byteLength) {
      fallo(`el tamaño no coincide: subimos ${CONTENIDO.byteLength} y el bucket dice ${info.sizeBytes}`);
    }
    ok(`lectura de metadatos (HeadObject, ${info.sizeBytes} bytes)`);

    const descargado = await getObject(key).catch((error: unknown) => fallo('no se pudo descargar', error));
    if (!descargado.equals(CONTENIDO)) fallo('los bytes descargados no coinciden con los subidos');
    ok('descarga (GetObject) y los bytes coinciden');

    const url = publicUrlFor(key);
    if (objectKeyFromPublicUrl(url) !== key) {
      fallo(
        `la URL pública no se puede convertir de vuelta en clave.\n    URL: ${url}\n    ` +
          'Revisa S3_PUBLIC_BASE_URL: tiene que ser la base EXACTA desde la que se leen los objetos.',
      );
    }
    ok('la URL pública y la clave son convertibles en ambos sentidos');

    /**
     * Lectura anónima. Es el paso que más veces falla y el único que importa
     * al usuario final: el navegador pide el audio SIN credenciales, así que
     * un bucket privado da 403 justo al darle al play.
     */
    try {
      const respuesta = await fetch(url);
      if (respuesta.ok) {
        ok(`lectura pública sin credenciales (${respuesta.status})`);
      } else {
        console.warn(`  ! la URL pública respondió ${respuesta.status}`);
        console.warn(`    ${url}`);
        console.warn('    Los archivos se guardan bien, pero el navegador no podrá reproducirlos.');
        console.warn('    En R2: activa el acceso público del bucket o conéctale un dominio,');
        console.warn('    y pon esa base en S3_PUBLIC_BASE_URL.');
      }
    } catch (error) {
      console.warn(`  ! no se pudo alcanzar la URL pública: ${error instanceof Error ? error.message : error}`);
    }
  } finally {
    if (subido) {
      await deleteObject(key)
        .then(() => ok('borrado (DeleteObject) — no queda basura de la prueba'))
        .catch((error: unknown) => {
          console.warn(`  ! no se pudo borrar ${key}: ${error instanceof Error ? error.message : error}`);
        });
    }
  }

  console.log('\nEl bucket está operativo.\n');
}

main().catch((error: unknown) => {
  console.error('\nLa comprobación falló:', error);
  process.exit(1);
});
