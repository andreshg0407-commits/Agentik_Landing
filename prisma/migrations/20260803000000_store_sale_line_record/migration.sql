-- AGENTIK-STORES-PRODUCT-SALES-SYNC-01
-- Line-level store sales from SAG MOVIMIENTOS_ITEMS.
-- Source: MOVIMIENTOS (header) + MOVIMIENTOS_ITEMS (lines) + v_articulos (ref).

-- CreateTable
CREATE TABLE "StoreSaleLineRecord" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "erpItemId" INTEGER NOT NULL,
    "erpMovId" INTEGER NOT NULL,
    "articleId" INTEGER NOT NULL,
    "referenceCode" TEXT NOT NULL,
    "articleName" TEXT NOT NULL,
    "quantity" DECIMAL(18,2) NOT NULL,
    "lineTotal" DECIMAL(18,2) NOT NULL,
    "discountPercent" DECIMAL(5,2) NOT NULL,
    "ivaRate" DECIMAL(5,2) NOT NULL,
    "size" TEXT,
    "color" TEXT,
    "warehouseId" INTEGER,
    "documentDate" TIMESTAMP(3) NOT NULL,
    "comprobanteCode" TEXT NOT NULL,
    "comprobante" TEXT,
    "storeId" TEXT NOT NULL,
    "storeName" TEXT NOT NULL,
    "documentFamily" TEXT NOT NULL,
    "saleRecordId" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreSaleLineRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: idempotency constraint
CREATE UNIQUE INDEX "StoreSaleLineRecord_organizationId_erpItemId_key" ON "StoreSaleLineRecord"("organizationId", "erpItemId");

-- CreateIndex: store + date range queries
CREATE INDEX "StoreSaleLineRecord_organizationId_storeId_documentDate_idx" ON "StoreSaleLineRecord"("organizationId", "storeId", "documentDate");

-- CreateIndex: reference lookups
CREATE INDEX "StoreSaleLineRecord_organizationId_referenceCode_idx" ON "StoreSaleLineRecord"("organizationId", "referenceCode");

-- CreateIndex: document-level aggregation
CREATE INDEX "StoreSaleLineRecord_organizationId_erpMovId_idx" ON "StoreSaleLineRecord"("organizationId", "erpMovId");

-- CreateIndex: comprobante + date queries
CREATE INDEX "StoreSaleLineRecord_organizationId_comprobanteCode_documentD_idx" ON "StoreSaleLineRecord"("organizationId", "comprobanteCode", "documentDate");

-- AddForeignKey
ALTER TABLE "StoreSaleLineRecord" ADD CONSTRAINT "StoreSaleLineRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
