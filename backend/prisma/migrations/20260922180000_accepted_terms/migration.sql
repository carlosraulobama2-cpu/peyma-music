-- Peyma Music — Registro de aceptacion de terminos y privacidad
--
-- Se guarda la VERSION aceptada y no un booleano: los textos cambian, y
-- "acepto" sin decir que acepto no sirve para responder a una reclamacion
-- ni para saber a quien hay que volver a pedirselo tras una revision.
--
-- Ambas columnas son opcionales a proposito. Las cuentas que ya existian se
-- quedan en NULL en vez de heredar una fecha inventada: un consentimiento
-- que nadie dio es peor que ninguno, y NULL permite distinguir "nunca lo
-- acepto" de "lo acepto en tal fecha" para pedirselo cuando vuelva a entrar.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "acceptedTermsVersion" TEXT,
ADD COLUMN     "acceptedTermsAt" TIMESTAMP(3);
