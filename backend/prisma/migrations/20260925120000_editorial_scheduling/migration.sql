-- Peyma Music — Programacion de secciones editoriales
--
-- Ambas columnas opcionales, y ninguna reemplaza a isPublished: siguen
-- siendo un curador diciendo "esto ya esta listo" MAS una ventana de
-- cuando debe salir. Sin ventana (NULL en las dos), el comportamiento es
-- exactamente el de hoy.

-- AlterTable
ALTER TABLE "EditorialSection" ADD COLUMN     "publishAt" TIMESTAMP(3),
ADD COLUMN     "unpublishAt" TIMESTAMP(3);
