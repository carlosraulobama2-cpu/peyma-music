-- Peyma Music — Promociones de primera fila y retirada por plagio
--
-- * Promotion: solicitudes de artistas para destacar en la Home, con
--   aprobacion, ventana de fechas y orden. El importe se calcula pero
--   NO se cobra: no hay pasarela y simularlo seria peor que no tenerlo.
-- * Track.blockedByName: quien reclamo la retirada, para poder mostrarselo
--   al artista infractor aunque la cuenta del denunciante desaparezca.
--
-- CURADA A MANO: se omiten los DROP de las tablas huerfanas de Neon Auth.
-- CreateEnum
CREATE TYPE "PromotionStatus" AS ENUM ('PENDING_APPROVAL', 'ACTIVE', 'REJECTED', 'EXPIRED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Track" ADD COLUMN     "blockedByName" TEXT;

-- CreateTable
CREATE TABLE "Promotion" (
    "id" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "days" INTEGER NOT NULL,
    "status" "PromotionStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "position" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "priceCents" INTEGER NOT NULL,
    "paidAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Promotion_status_position_idx" ON "Promotion"("status", "position");

-- CreateIndex
CREATE INDEX "Promotion_trackId_idx" ON "Promotion"("trackId");

-- AddForeignKey
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

