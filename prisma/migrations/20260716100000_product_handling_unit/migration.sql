-- IMPORT-SIZECLASS-FROM-SAG-01
-- Add handlingUnit field to ProductEntity for SAG "Unidad de manejo"
-- Canonical values: PEQUENO | MEDIANO | GRANDE

ALTER TABLE "ProductEntity" ADD COLUMN "handlingUnit" TEXT;
