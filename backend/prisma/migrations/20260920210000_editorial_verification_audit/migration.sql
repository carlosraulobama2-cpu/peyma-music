-- Peyma Music — Secciones editoriales, verificación de artistas y auditoría
--
-- * Artist.isVerified (+ quién y cuándo lo otorgó): el check azul del panel.
-- * EditorialSection / EditorialItem: las secciones de la portada
--   ("Lo nuevo", "Los mejores álbumes"), que la app y la web consumen igual.
-- * AuditLog: registro inmutable de las acciones del panel.
--
-- CURADA A MANO, igual que las cinco anteriores: `prisma migrate diff` quiere
-- borrar `users`, `tracks`, `schema_migrations` y el tipo `track_status`,
-- restos vacíos del scaffold de Neon Auth que NO son nuestros.
-- CreateEnum
CREATE TYPE "EditorialKind" AS ENUM ('MANUAL', 'NEW_RELEASES', 'TOP_TRACKS', 'TOP_ALBUMS', 'TOP_ARTISTS');

-- CreateEnum
CREATE TYPE "EditorialLayout" AS ENUM ('CAROUSEL', 'GRID', 'HERO');

-- AlterTable
ALTER TABLE "Artist" ADD COLUMN     "isVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ADD COLUMN     "verifiedById" TEXT;

-- CreateTable
CREATE TABLE "EditorialSection" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "slug" TEXT NOT NULL,
    "kind" "EditorialKind" NOT NULL DEFAULT 'MANUAL',
    "layout" "EditorialLayout" NOT NULL DEFAULT 'CAROUSEL',
    "position" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "maxItems" INTEGER NOT NULL DEFAULT 10,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EditorialSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EditorialItem" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "trackId" TEXT,
    "albumId" TEXT,
    "artistId" TEXT,

    CONSTRAINT "EditorialItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorEmail" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "targetLabel" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EditorialSection_slug_key" ON "EditorialSection"("slug");

-- CreateIndex
CREATE INDEX "EditorialSection_isPublished_position_idx" ON "EditorialSection"("isPublished", "position");

-- CreateIndex
CREATE INDEX "EditorialItem_sectionId_position_idx" ON "EditorialItem"("sectionId", "position");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");

-- AddForeignKey
ALTER TABLE "Artist" ADD CONSTRAINT "Artist_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditorialItem" ADD CONSTRAINT "EditorialItem_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "EditorialSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditorialItem" ADD CONSTRAINT "EditorialItem_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditorialItem" ADD CONSTRAINT "EditorialItem_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "Album"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditorialItem" ADD CONSTRAINT "EditorialItem_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

