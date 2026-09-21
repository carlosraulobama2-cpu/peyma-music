-- Bloqueo administrativo de artistas: oculta al artista y sus pistas del
-- catálogo público sin destruir nada (reversible), a diferencia de eliminar.
--
-- Curado a mano desde `prisma migrate diff`: se omitieron los DROP sobre
-- "users", "tracks", "schema_migrations" y "track_status" — tablas ajenas
-- al esquema de Prisma (scaffold de Neon Auth) que este proyecto no gestiona.

-- AlterTable
ALTER TABLE "Artist" ADD COLUMN     "isBlocked" BOOLEAN NOT NULL DEFAULT false;
