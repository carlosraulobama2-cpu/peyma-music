/**
 * Peyma Music — Política CORS del bucket
 *
 *   npm run storage:cors
 *
 * Aplica al bucket la misma lista de orígenes que usa la API (`CORS_ORIGINS`),
 * para que el navegador pueda leer el audio directamente desde el CDN.
 *
 * Por qué hace falta: la web reproduce con un `<audio crossOrigin="anonymous">`
 * conectado a un grafo de Web Audio (`createMediaElementSource`). Cuando el
 * medio viene de otro dominio y ese dominio NO devuelve
 * `Access-Control-Allow-Origin`, el navegador no falla de forma visible:
 * **silencia la salida**. Se vería el reproductor avanzando y no se oiría
 * nada, que es de los fallos más difíciles de diagnosticar.
 *
 * R2 no manda esa cabecera por defecto, así que hay que pedírselo. Se hace
 * por el propio protocolo S3 (`PutBucketCors`), con las mismas credenciales
 * que ya usa el backend — no hace falta ningún token de la API de Cloudflare.
 */
import 'dotenv/config';
import { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } from '@aws-sdk/client-s3';

const bucket = process.env.S3_BUCKET?.trim();
const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim();
const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim();
const endpoint = process.env.S3_ENDPOINT?.trim();

const origins = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

async function main(): Promise<void> {
  console.log('\nPolítica CORS del bucket\n');

  if (!bucket || !accessKeyId || !secretAccessKey) {
    console.error('  ✗ Falta configuración del bucket en backend/.env (S3_BUCKET / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY).');
    process.exit(1);
  }
  if (origins.length === 0) {
    console.error('  ✗ CORS_ORIGINS está vacía: no hay orígenes que autorizar.');
    console.error('    Se usa la MISMA lista que la API para no tener dos fuentes de verdad.');
    process.exit(1);
  }

  const client = new S3Client({
    region: process.env.S3_REGION?.trim() || 'auto',
    credentials: { accessKeyId, secretAccessKey },
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
  });

  console.log(`  bucket : ${bucket}`);
  console.log(`  orígenes:\n    ${origins.join('\n    ')}\n`);

  await client.send(
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: origins,
            // Sólo lectura: al bucket se ESCRIBE con URL firmada desde el
            // cliente, y esas llevan su propia autorización en la firma. Un
            // PUT abierto por CORS permitiría a cualquier web autorizada
            // subir objetos.
            AllowedMethods: ['GET', 'HEAD'],
            AllowedHeaders: ['Range', 'Content-Type'],
            // Sin exponer estas, `fetch` no puede leerlas aunque lleguen, y
            // el reproductor pierde la duración y la capacidad de buscar
            // dentro de la canción.
            ExposeHeaders: ['Content-Length', 'Content-Range', 'Accept-Ranges', 'Content-Type', 'ETag'],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    }),
  );
  console.log('  ✓ política aplicada');

  const current = await client.send(new GetBucketCorsCommand({ Bucket: bucket }));
  const rule = current.CORSRules?.[0];
  console.log(`  ✓ confirmada por el bucket: ${rule?.AllowedOrigins?.join(', ')} [${rule?.AllowedMethods?.join(', ')}]`);
  console.log('\nListo. Compruébalo con `npm run storage:check`.\n');
}

main().catch((error: unknown) => {
  console.error('\nNo se pudo aplicar la política:', error instanceof Error ? error.message : error);
  process.exit(1);
});
