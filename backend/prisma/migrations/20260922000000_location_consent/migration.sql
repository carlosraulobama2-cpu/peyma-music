-- Peyma Music — Consentimiento de ubicacion y coordenadas aproximadas
--
-- User.locationConsent: tres estados para distinguir 'dijo que no' de
-- 'no se le pregunto'. StreamLog.latitude/longitude: redondeadas a 1
-- decimal (~11 km), suficiente para un mapa de densidad e insuficiente
-- para ubicar a nadie. El servidor descarta coordenadas sin GRANTED.
--
-- CURADA A MANO: se omiten los DROP de las tablas huerfanas de Neon Auth.
-- CreateEnum
CREATE TYPE "LocationConsent" AS ENUM ('NOT_ASKED', 'GRANTED', 'DENIED');

-- AlterTable
ALTER TABLE "StreamLog" ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "locationConsent" "LocationConsent" NOT NULL DEFAULT 'NOT_ASKED',
ADD COLUMN     "locationConsentAt" TIMESTAMP(3);

