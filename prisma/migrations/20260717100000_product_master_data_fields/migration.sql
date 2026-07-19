-- COMERCIAL-INVENTARIO-MASTER-DATA-COMPLETION-01 Fase 6
-- Add missing SAG master data fields to ProductEntity

ALTER TABLE "ProductEntity" ADD COLUMN "grupoId" INTEGER;
ALTER TABLE "ProductEntity" ADD COLUMN "grupoSag" TEXT;
ALTER TABLE "ProductEntity" ADD COLUMN "lineaId" INTEGER;
ALTER TABLE "ProductEntity" ADD COLUMN "lineaSag" TEXT;
ALTER TABLE "ProductEntity" ADD COLUMN "costo" DOUBLE PRECISION;
ALTER TABLE "ProductEntity" ADD COLUMN "manejaTallaColor" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ProductEntity" ADD COLUMN "lastModifiedSag" TIMESTAMP(3);
ALTER TABLE "ProductEntity" ADD COLUMN "createdAtSag" TIMESTAMP(3);
ALTER TABLE "ProductEntity" ADD COLUMN "lastPurchaseSag" TIMESTAMP(3);
ALTER TABLE "ProductEntity" ADD COLUMN "lastSaleSag" TIMESTAMP(3);
ALTER TABLE "ProductEntity" ADD COLUMN "barcode" TEXT;
ALTER TABLE "ProductEntity" ADD COLUMN "description2" TEXT;
