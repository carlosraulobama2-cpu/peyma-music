// Configuración de Prisma 7 para el CLI (migrate, db seed, studio).
// La app en runtime NO lee este archivo — usa el driver adapter en
// src/prismaClient.ts. Ver también .env.example para DATABASE_URL.
import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    // DIRECT_URL, no DATABASE_URL: en Neon la segunda apunta al endpoint con
    // pgbouncer, y `prisma migrate` toma un advisory lock de Postgres, que es
    // de SESIÓN. A través de un pooler de transacciones cada sentencia puede
    // caer en un backend distinto, así que el lock lo retiene el pooler y la
    // migración se queda esperando un lock que nunca podrá adquirir.
    // El runtime sí usa la pooled (src/prismaClient.ts), que es lo correcto
    // para la API.
    url: env('DIRECT_URL'),
  },
  migrations: {
    seed: 'ts-node prisma/seed.ts',
  },
});
