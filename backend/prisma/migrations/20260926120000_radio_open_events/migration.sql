-- Peyma Music — Conteo de aperturas de "Radio en vivo"
--
-- Sólo un conteo de uso (plataforma + fecha), nunca contra qué estación:
-- eso es contenido de un tercero (radio-browser.info) que Peyma no aloja
-- ni modera, y no hay ninguna razón para registrar qué escucha cada
-- usuario ahí.
-- CreateEnum
CREATE TYPE "RadioPlatform" AS ENUM ('APP', 'WEB');

-- CreateTable
CREATE TABLE "RadioOpenEvent" (
    "id" TEXT NOT NULL,
    "platform" "RadioPlatform" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RadioOpenEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RadioOpenEvent_createdAt_idx" ON "RadioOpenEvent"("createdAt");
