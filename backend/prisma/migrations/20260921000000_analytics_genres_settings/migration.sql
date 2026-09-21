-- Peyma Music — Analítica de audiencia, ritmos editables y ajustes
--
-- * StreamLog.secondsPlayed: tiempo REAL escuchado, para medir horas sin
--   asumir que nadie salta una cancion.
-- * SearchLog: que se busca y cuantos resultados da (un termino muy buscado
--   con 0 resultados es catalogo que falta).
-- * SignupAttempt: altas que fallaron y en que paso; sin esto el fallo es
--   invisible, porque un registro fallido no deja ningun User.
-- * MusicGenre: vocabulario de ritmos ampliable sin desplegar.
-- * AppSetting: ajustes de plataforma clave-valor.
--
-- CURADA A MANO, como las seis anteriores: se omiten los DROP de users,
-- tracks, schema_migrations y track_status, restos vacios del scaffold de
-- Neon Auth que no son nuestros.
-- CreateEnum
CREATE TYPE "SignupStage" AS ENUM ('VALIDATION', 'DUPLICATE_EMAIL', 'GOOGLE_OAUTH', 'SERVER_ERROR');

-- AlterTable
ALTER TABLE "StreamLog" ADD COLUMN     "secondsPlayed" INTEGER;

-- CreateTable
CREATE TABLE "SearchLog" (
    "id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "resultCount" INTEGER NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignupAttempt" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "stage" "SignupStage" NOT NULL,
    "reason" TEXT NOT NULL,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignupAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MusicGenre" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#1f6feb',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MusicGenre_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "SearchLog_normalized_createdAt_idx" ON "SearchLog"("normalized", "createdAt");

-- CreateIndex
CREATE INDEX "SearchLog_createdAt_idx" ON "SearchLog"("createdAt");

-- CreateIndex
CREATE INDEX "SignupAttempt_createdAt_idx" ON "SignupAttempt"("createdAt");

-- CreateIndex
CREATE INDEX "SignupAttempt_stage_idx" ON "SignupAttempt"("stage");

-- CreateIndex
CREATE UNIQUE INDEX "MusicGenre_name_key" ON "MusicGenre"("name");

-- CreateIndex
CREATE UNIQUE INDEX "MusicGenre_slug_key" ON "MusicGenre"("slug");

-- CreateIndex
CREATE INDEX "MusicGenre_isActive_position_idx" ON "MusicGenre"("isActive", "position");

-- CreateIndex
CREATE INDEX "StreamLog_playedAt_idx" ON "StreamLog"("playedAt");

-- AddForeignKey
ALTER TABLE "SearchLog" ADD CONSTRAINT "SearchLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppSetting" ADD CONSTRAINT "AppSetting_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

