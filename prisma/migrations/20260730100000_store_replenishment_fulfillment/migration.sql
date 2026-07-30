-- CreateEnum
CREATE TYPE "StoreReplenishmentTransition" AS ENUM ('APROBAR', 'INICIAR_PREPARACION', 'DESPACHAR', 'RECIBIR', 'CERRAR', 'CANCELAR');

-- CreateTable
CREATE TABLE "StoreReplenishmentDocumentEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "fromStatus" "ReplenishmentDocumentStatus" NOT NULL,
    "toStatus" "ReplenishmentDocumentStatus" NOT NULL,
    "transition" "StoreReplenishmentTransition" NOT NULL,
    "workflowVersion" INTEGER NOT NULL DEFAULT 1,
    "actorId" TEXT NOT NULL,
    "actorDisplayName" TEXT,
    "note" TEXT,
    "metadata" JSONB,
    "idempotencyKey" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreReplenishmentDocumentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoreReplenishmentDocumentEvent_documentId_idempotencyKey_key" ON "StoreReplenishmentDocumentEvent"("documentId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "StoreReplenishmentDocumentEvent_organizationId_documentId_oc_idx" ON "StoreReplenishmentDocumentEvent"("organizationId", "documentId", "occurredAt");

-- CreateIndex
CREATE INDEX "StoreReplenishmentDocumentEvent_organizationId_batchId_occu_idx" ON "StoreReplenishmentDocumentEvent"("organizationId", "batchId", "occurredAt");
