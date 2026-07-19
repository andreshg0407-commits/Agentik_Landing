-- CreateTable
CREATE TABLE "CustomerOrderLine" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "erpItemId" INTEGER NOT NULL,
    "erpMovId" INTEGER NOT NULL,
    "articleId" INTEGER NOT NULL,
    "referenceCode" TEXT NOT NULL,
    "articleName" TEXT NOT NULL,
    "quantity" DECIMAL(18,2) NOT NULL,
    "size" TEXT,
    "color" TEXT,
    "warehouseId" INTEGER,
    "unitValue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerOrderLine_organizationId_erpItemId_key" ON "CustomerOrderLine"("organizationId", "erpItemId");

-- CreateIndex
CREATE INDEX "CustomerOrderLine_organizationId_referenceCode_idx" ON "CustomerOrderLine"("organizationId", "referenceCode");

-- CreateIndex
CREATE INDEX "CustomerOrderLine_organizationId_orderId_idx" ON "CustomerOrderLine"("organizationId", "orderId");

-- CreateIndex
CREATE INDEX "CustomerOrderLine_orderId_idx" ON "CustomerOrderLine"("orderId");

-- AddForeignKey
ALTER TABLE "CustomerOrderLine" ADD CONSTRAINT "CustomerOrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CustomerOrderRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerOrderLine" ADD CONSTRAINT "CustomerOrderLine_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
