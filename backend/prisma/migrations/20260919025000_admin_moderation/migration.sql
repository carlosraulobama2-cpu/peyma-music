-- Rol de usuario (para /api/admin/moderation/*) y moderación admin de tracks
-- publicados. Curado a mano a partir de `prisma migrate diff`: se omitieron
-- los `DROP TABLE`/`DROP TYPE` que esa diff sugería sobre "users", "tracks",
-- "schema_migrations" y "track_status" — son tablas ajenas al esquema de
-- Prisma (vacías, probablemente scaffold de Neon Auth) que este proyecto no
-- usa ni gestiona; no se tocan.

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ARTIST', 'ADMIN');

-- CreateEnum
CREATE TYPE "TrackReviewStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Track" ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT,
ADD COLUMN     "status" "TrackReviewStatus" NOT NULL DEFAULT 'APPROVED';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "role" "Role" NOT NULL DEFAULT 'USER';

-- CreateIndex
CREATE INDEX "Track_status_idx" ON "Track"("status");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- AddForeignKey
ALTER TABLE "Track" ADD CONSTRAINT "Track_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
