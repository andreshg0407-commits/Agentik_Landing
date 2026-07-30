-- CreateEnum
CREATE TYPE "ReplenishmentDocumentStatus" AS ENUM ('BORRADOR', 'APROBADO', 'PREPARACION', 'DESPACHADO', 'RECIBIDO', 'CERRADO', 'CANCELADO');

-- CreateTable
CREATE TABLE "ReplenishmentDocumentSequence" (
    "organizationId" TEXT NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReplenishmentDocumentSequence_pkey" PRIMARY KEY ("organizationId")
);

-- CreateTable
CREATE TABLE "StoreReplenishmentDocument" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "consecutivo" INTEGER NOT NULL,
    "documentNumber" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "storeName" TEXT NOT NULL,
    "status" "ReplenishmentDocumentStatus" NOT NULL DEFAULT 'BORRADOR',
    "snapshotSchemaVersion" INTEGER NOT NULL DEFAULT 1,
    "planFingerprint" TEXT NOT NULL,
    "planSnapshot" JSONB NOT NULL,
    "suggestionCount" INTEGER NOT NULL,
    "allocatedUnits" INTEGER NOT NULL,
    "withdrawalUnits" INTEGER NOT NULL,
    "generatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreReplenishmentDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoreReplenishmentDocument_organizationId_consecutivo_key" ON "StoreReplenishmentDocument"("organizationId", "consecutivo");

-- CreateIndex
CREATE INDEX "StoreReplenishmentDocument_organizationId_storeId_status_idx" ON "StoreReplenishmentDocument"("organizationId", "storeId", "status");

-- CreateIndex
CREATE INDEX "StoreReplenishmentDocument_organizationId_batchId_idx" ON "StoreReplenishmentDocument"("organizationId", "batchId");

-- CreateIndex
CREATE INDEX "StoreReplenishmentDocument_organizationId_planFingerprint_idx" ON "StoreReplenishmentDocument"("organizationId", "planFingerprint");
