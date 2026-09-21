-- Peyma Music — Pipeline de ingesta de audio y metadatos avanzados
--
-- Añade: identificadores de industria (UPC junto al ISRC ya existente),
-- versión y fecha de lanzamiento, máster sin pérdida, geobloqueo por país,
-- nivel de suscripción, huella acústica, créditos relacionales, variantes
-- transcodificadas, cola de trabajos y medición EBU R128 + waveform.
--
-- CURADA A MANO. `prisma migrate diff` quiere borrar las tablas `users`,
-- `tracks` y `schema_migrations` y el tipo `track_status`: son restos del
-- scaffold de Neon Auth, están vacías y NO son nuestras. Esos bloques se
-- omiten a propósito, igual que en las cuatro migraciones anteriores.
-- Tampoco se tocan las FK de esa tabla `tracks` ajena (la nuestra es "Track").
-- CreateEnum
CREATE TYPE "AudioQuality" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'LOSSLESS');

-- CreateEnum
CREATE TYPE "SubscriptionTier" AS ENUM ('FREE', 'PREMIUM');

-- CreateEnum
CREATE TYPE "CreditRole" AS ENUM ('MAIN_ARTIST', 'FEATURED_ARTIST', 'REMIXER', 'PRODUCER', 'COMPOSER', 'WRITER', 'MIX_ENGINEER', 'MASTERING_ENGINEER');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "JobKind" AS ENUM ('WAVEFORM', 'LOUDNESS', 'TRANSCODE', 'ARTWORK', 'COLOR', 'FINGERPRINT');

-- AlterTable
ALTER TABLE "Album" ADD COLUMN     "dominantColor" TEXT,
ADD COLUMN     "releaseDate" TIMESTAMP(3),
ADD COLUMN     "upc" TEXT;

-- AlterTable
ALTER TABLE "AudioAnalysis" ADD COLUMN     "gainDb" DOUBLE PRECISION,
ADD COLUMN     "integratedLufs" DOUBLE PRECISION,
ADD COLUMN     "truePeakDb" DOUBLE PRECISION,
ADD COLUMN     "waveformPeaks" DOUBLE PRECISION[];

-- AlterTable
ALTER TABLE "Track" ADD COLUMN     "audioFingerprint" TEXT,
ADD COLUMN     "blockedCountries" TEXT[],
ADD COLUMN     "dominantColor" TEXT,
ADD COLUMN     "masterUrl" TEXT,
ADD COLUMN     "releaseDate" TIMESTAMP(3),
ADD COLUMN     "requiredTier" "SubscriptionTier" NOT NULL DEFAULT 'FREE',
ADD COLUMN     "version" TEXT;

-- AlterTable
ALTER TABLE "TrackUpload" ADD COLUMN     "masterObjectKey" TEXT,
ADD COLUMN     "masterUrl" TEXT;

-- CreateTable
CREATE TABLE "TrackCredit" (
    "id" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "role" "CreditRole" NOT NULL,
    "name" TEXT NOT NULL,
    "artistId" TEXT,
    "splitPercent" DOUBLE PRECISION,

    CONSTRAINT "TrackCredit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AudioVariant" (
    "id" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "quality" "AudioQuality" NOT NULL,
    "format" TEXT NOT NULL,
    "bitrateKbps" INTEGER,
    "url" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "requiredTier" "SubscriptionTier" NOT NULL DEFAULT 'FREE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AudioVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessingJob" (
    "id" TEXT NOT NULL,
    "kind" "JobKind" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "trackId" TEXT,
    "uploadId" TEXT,
    "payload" JSONB,
    "result" JSONB,
    "errorMessage" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcessingJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrackCredit_trackId_idx" ON "TrackCredit"("trackId");

-- CreateIndex
CREATE INDEX "TrackCredit_artistId_idx" ON "TrackCredit"("artistId");

-- CreateIndex
CREATE UNIQUE INDEX "TrackCredit_trackId_role_name_key" ON "TrackCredit"("trackId", "role", "name");

-- CreateIndex
CREATE INDEX "AudioVariant_trackId_idx" ON "AudioVariant"("trackId");

-- CreateIndex
CREATE UNIQUE INDEX "AudioVariant_trackId_quality_key" ON "AudioVariant"("trackId", "quality");

-- CreateIndex
CREATE INDEX "ProcessingJob_status_createdAt_idx" ON "ProcessingJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ProcessingJob_trackId_idx" ON "ProcessingJob"("trackId");

-- CreateIndex
CREATE INDEX "ProcessingJob_uploadId_idx" ON "ProcessingJob"("uploadId");

-- CreateIndex
CREATE UNIQUE INDEX "Album_upc_key" ON "Album"("upc");

-- CreateIndex
CREATE UNIQUE INDEX "Track_audioFingerprint_key" ON "Track"("audioFingerprint");

-- CreateIndex
CREATE INDEX "Track_releaseDate_idx" ON "Track"("releaseDate");

-- AddForeignKey
ALTER TABLE "TrackCredit" ADD CONSTRAINT "TrackCredit_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackCredit" ADD CONSTRAINT "TrackCredit_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudioVariant" ADD CONSTRAINT "AudioVariant_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessingJob" ADD CONSTRAINT "ProcessingJob_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessingJob" ADD CONSTRAINT "ProcessingJob_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "TrackUpload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

