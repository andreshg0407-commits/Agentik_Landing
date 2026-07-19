-- CreateTable
CREATE TABLE "ProductionOrderLine" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "productionOrderId" TEXT NOT NULL,
    "erpItemId" INTEGER NOT NULL,
    "referenceCode" TEXT NOT NULL,
    "productName" TEXT,
    "size" TEXT,
    "color" TEXT,
    "quantityOrdered" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitCost" DOUBLE PRECISION,
    "lineTotal" DOUBLE PRECISION,
    "rawJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductionOrderLine_organizationId_erpItemId_key" ON "ProductionOrderLine"("organizationId", "erpItemId");

-- CreateIndex
CREATE INDEX "ProductionOrderLine_productionOrderId_idx" ON "ProductionOrderLine"("productionOrderId");

-- CreateIndex
CREATE INDEX "ProductionOrderLine_organizationId_referenceCode_idx" ON "ProductionOrderLine"("organizationId", "referenceCode");

-- CreateIndex
CREATE INDEX "ProductionOrderLine_organizationId_referenceCode_size_color_idx" ON "ProductionOrderLine"("organizationId", "referenceCode", "size", "color");

-- AddForeignKey
ALTER TABLE "ProductionOrderLine" ADD CONSTRAINT "ProductionOrderLine_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrderLine" ADD CONSTRAINT "ProductionOrderLine_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
