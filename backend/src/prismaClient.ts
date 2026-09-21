import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const isProd = process.env.NODE_ENV === 'production';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL no está definida. Copia backend/.env.example a backend/.env.');
}

// Prisma 7 usa driver adapters en vez de leer la URL desde schema.prisma en
// runtime: el pool de conexiones (pg.Pool) lo gestionamos nosotros, lo que
// además permite ajustar su tamaño según la carga esperada.
const adapter = new PrismaPg({
  connectionString,
  max: Number(process.env.DATABASE_POOL_MAX) || 10,
});

export const prisma = new PrismaClient({
  adapter,
  log: isProd ? ['warn', 'error'] : ['warn', 'error', 'query'],
});
