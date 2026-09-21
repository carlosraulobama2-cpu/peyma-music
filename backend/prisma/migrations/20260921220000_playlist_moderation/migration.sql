-- Bloqueo de playlists por moderación.
--
-- Escrita a mano y no con `prisma migrate dev --create-only` a propósito:
-- la base tiene tablas huérfanas de un scaffold anterior de Neon Auth
-- (`users`, `tracks`, `schema_migrations`) y el tipo `track_status`, que
-- Prisma no conoce y querría eliminar. No son nuestras.
ALTER TABLE "Playlist" ADD COLUMN "isBlocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Playlist" ADD COLUMN "blockedReason" TEXT;
ALTER TABLE "Playlist" ADD COLUMN "blockedAt" TIMESTAMP(3);

-- Las consultas públicas filtran siempre por este campo; el índice parcial
-- cubre justo ese caso sin ocupar espacio por las bloqueadas, que son pocas.
CREATE INDEX "Playlist_isBlocked_idx" ON "Playlist"("isBlocked") WHERE "isBlocked" = false;
