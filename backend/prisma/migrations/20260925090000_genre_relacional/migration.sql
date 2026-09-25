-- El género deja de ser un enum de Postgres y pasa a apuntar a `MusicGenre`.
--
-- Por qué: el enum `Genre` tenía ocho valores fijos (lofi, jazz, ambient,
-- pop, hiphop, classical, electronic, rock) mientras que la tabla
-- `MusicGenre`, la que el panel cura, contiene Trap, Drill, Amapiano,
-- Reguetón y Corridos Tumbados. Eran dos vocabularios paralelos y ninguna
-- canción podía llevar los de la tabla: un tema de trap, como mucho, podía
-- ser "hiphop", y rap directamente no existía.
--
-- Se PIERDE el valor de `Track.genre` de las filas existentes, y es
-- deliberado: hasta ahora lo asignaba `pick(rand, GENRES)` en el analizador,
-- o sea al azar entre los ocho. No hay nada que conservar ahí, y mantener
-- etiquetas inventadas sería peor que quedarse sin ellas.
--
-- NO se tocan las tablas `tracks`, `users` ni `schema_migrations`, que son
-- restos en minúscula de un esquema anterior y están vacías. `prisma migrate
-- diff` propone eliminarlas porque no están en el modelo; eso es otra
-- decisión y no entra aquí.

DROP INDEX "Track_genre_idx";

ALTER TABLE "Track" DROP COLUMN "genre",
                    ADD COLUMN "genreId" TEXT;

ALTER TABLE "TrackUpload" DROP COLUMN "genreOverride",
                          ADD COLUMN "genreOverrideId" TEXT;

DROP TYPE "Genre";

CREATE INDEX "Track_genreId_idx" ON "Track"("genreId");

ALTER TABLE "Track"
  ADD CONSTRAINT "Track_genreId_fkey"
  FOREIGN KEY ("genreId") REFERENCES "MusicGenre"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TrackUpload"
  ADD CONSTRAINT "TrackUpload_genreOverrideId_fkey"
  FOREIGN KEY ("genreOverrideId") REFERENCES "MusicGenre"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
