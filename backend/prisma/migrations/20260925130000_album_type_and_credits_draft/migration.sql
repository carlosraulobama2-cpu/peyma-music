-- CreateEnum
CREATE TYPE "AlbumType" AS ENUM ('SINGLE', 'EP', 'ALBUM');

-- AlterTable
ALTER TABLE "Album" ADD COLUMN     "type" "AlbumType" NOT NULL DEFAULT 'SINGLE';

-- AlterTable
ALTER TABLE "TrackUpload" ADD COLUMN     "creditsDraft" JSONB;
