-- Peyma Music — Denuncias de canciones y bloqueo por pista
--
-- * TrackReport: denuncias de usuarios (plagio, copyright, contenido…) con
--   su resolucion y quien la cerro.
-- * Track.isBlocked / blockedReason / blockedAt: bloqueo de UNA cancion,
--   distinto de bloquear al artista entero. Es lo que se aplica cuando una
--   denuncia prospera, y es reversible.
--
-- CURADA A MANO como las siete anteriores: se omiten los DROP de users,
-- tracks, schema_migrations y track_status (restos de Neon Auth).
-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('PLAGIARISM', 'COPYRIGHT', 'EXPLICIT_CONTENT', 'HATE_SPEECH', 'MISLEADING_METADATA', 'LOW_QUALITY', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'REVIEWING', 'UPHELD', 'DISMISSED');

-- AlterTable
ALTER TABLE "Track" ADD COLUMN     "blockedAt" TIMESTAMP(3),
ADD COLUMN     "blockedReason" TEXT,
ADD COLUMN     "isBlocked" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "TrackReport" (
    "id" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "reporterId" TEXT,
    "reason" "ReportReason" NOT NULL,
    "details" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrackReport_status_createdAt_idx" ON "TrackReport"("status", "createdAt");

-- CreateIndex
CREATE INDEX "TrackReport_trackId_idx" ON "TrackReport"("trackId");

-- CreateIndex
CREATE UNIQUE INDEX "TrackReport_trackId_reporterId_key" ON "TrackReport"("trackId", "reporterId");

-- AddForeignKey
ALTER TABLE "TrackReport" ADD CONSTRAINT "TrackReport_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackReport" ADD CONSTRAINT "TrackReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackReport" ADD CONSTRAINT "TrackReport_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

