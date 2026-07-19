-- CASTILLITOS-LOGISTICS-SYNC-01
-- Inventory transfers: TR (fuente 34) and TM (fuente 206)

-- CreateTable
CREATE TABLE "InventoryTransfer" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "erpMovId" INTEGER NOT NULL,
    "documentNumber" TEXT NOT NULL,
    "transferType" TEXT NOT NULL,
    "sourceCode" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "documentDate" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "remisionRef" TEXT,
    "originWarehouseCode" TEXT,
    "originWarehouseName" TEXT,
    "destinationWarehouseCode" TEXT,
    "destinationWarehouseName" TEXT,
    "rawJson" JSONB NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryTransferLine" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "inventoryTransferId" TEXT NOT NULL,
    "erpItemId" INTEGER NOT NULL,
    "referenceCode" TEXT NOT NULL,
    "productName" TEXT,
    "size" TEXT,
    "color" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitCost" DOUBLE PRECISION,
    "lineTotal" DOUBLE PRECISION,
    "destinationWarehouseCode" TEXT,
    "rawJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryTransferLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InventoryTransfer_organizationId_erpMovId_key" ON "InventoryTransfer"("organizationId", "erpMovId");

-- CreateIndex
CREATE INDEX "InventoryTransfer_organizationId_transferType_idx" ON "InventoryTransfer"("organizationId", "transferType");

-- CreateIndex
CREATE INDEX "InventoryTransfer_organizationId_status_idx" ON "InventoryTransfer"("organizationId", "status");

-- CreateIndex
CREATE INDEX "InventoryTransfer_organizationId_documentDate_idx" ON "InventoryTransfer"("organizationId", "documentDate");

-- CreateIndex
CREATE INDEX "InventoryTransfer_organizationId_originWarehouseCode_idx" ON "InventoryTransfer"("organizationId", "originWarehouseCode");

-- CreateIndex
CREATE INDEX "InventoryTransfer_organizationId_destinationWarehouseCode_idx" ON "InventoryTransfer"("organizationId", "destinationWarehouseCode");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryTransferLine_organizationId_erpItemId_key" ON "InventoryTransferLine"("organizationId", "erpItemId");

-- CreateIndex
CREATE INDEX "InventoryTransferLine_inventoryTransferId_idx" ON "InventoryTransferLine"("inventoryTransferId");

-- CreateIndex
CREATE INDEX "InventoryTransferLine_organizationId_referenceCode_idx" ON "InventoryTransferLine"("organizationId", "referenceCode");

-- CreateIndex
CREATE INDEX "InventoryTransferLine_organizationId_referenceCode_size_col_idx" ON "InventoryTransferLine"("organizationId", "referenceCode", "size", "color");

-- AddForeignKey
ALTER TABLE "InventoryTransfer" ADD CONSTRAINT "InventoryTransfer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransferLine" ADD CONSTRAINT "InventoryTransferLine_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransferLine" ADD CONSTRAINT "InventoryTransferLine_inventoryTransferId_fkey" FOREIGN KEY ("inventoryTransferId") REFERENCES "InventoryTransfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
