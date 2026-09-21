-- Créditos y metadatos de catálogo en Track (compositor, productor, sello,
-- ISRC, explícito). Los dos últimos además alimentan los comandos de
-- búsqueda `label:` e `isrc:`.
--
-- Curado a mano desde `prisma migrate diff`: se omitieron los DROP sobre
-- "users", "tracks", "schema_migrations" y "track_status" — son tablas
-- ajenas al esquema de Prisma (scaffold vacío de Neon Auth) que este
-- proyecto no gestiona. Ver la migración 20260919025000_admin_moderation.

-- AlterTable
ALTER TABLE "Track" ADD COLUMN     "composer" TEXT,
ADD COLUMN     "isExplicit" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isrc" TEXT,
ADD COLUMN     "label" TEXT,
ADD COLUMN     "producer" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Track_isrc_key" ON "Track"("isrc");
