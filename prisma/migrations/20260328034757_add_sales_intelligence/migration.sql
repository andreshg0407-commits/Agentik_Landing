-- CreateEnum
CREATE TYPE "SaleGrain" AS ENUM ('TRANSACTION', 'AGGREGATED');

-- CreateEnum
CREATE TYPE "SaleChannel" AS ENUM ('TIENDA', 'ONLINE', 'TELEFONO', 'DISTRIBUIDOR', 'MAYORISTA', 'OTRO');

-- CreateEnum
CREATE TYPE "SaleScopeType" AS ENUM ('MONTH', 'RANGE', 'YEAR', 'ADHOC');

-- CreateTable
CREATE TABLE "SalesImportBatch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'csv',
    "grain" "SaleGrain" NOT NULL DEFAULT 'TRANSACTION',
    "fileName" TEXT,
    "scopeType" "SaleScopeType" NOT NULL DEFAULT 'MONTH',
    "scopeKey" TEXT NOT NULL,
    "replacedByBatchId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "importedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "errorJson" JSONB,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedBy" TEXT,

    CONSTRAINT "SalesImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleRecord" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "importBatchId" TEXT NOT NULL,
    "grain" "SaleGrain" NOT NULL,
    "saleDate" TIMESTAMP(3) NOT NULL,
    "periodoAoMes" TEXT,
    "sellerCode" TEXT,
    "sellerSlug" TEXT NOT NULL,
    "sellerName" TEXT NOT NULL,
    "storeCode" TEXT,
    "storeSlug" TEXT NOT NULL,
    "storeName" TEXT NOT NULL,
    "productLine" TEXT NOT NULL,
    "brand" TEXT,
    "productCode" TEXT,
    "productName" TEXT,
    "zone" TEXT,
    "channel" "SaleChannel" NOT NULL,
    "comprobanteCode" TEXT,
    "comprobante" TEXT,
    "customerNit" TEXT,
    "customerName" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "units" INTEGER,
    "txCount" INTEGER,
    "naturalKey" TEXT NOT NULL,
    "rawJson" JSONB NOT NULL,

    CONSTRAINT "SaleRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalesImportBatch_organizationId_scopeType_scopeKey_idx" ON "SalesImportBatch"("organizationId", "scopeType", "scopeKey");

-- CreateIndex
CREATE INDEX "SalesImportBatch_organizationId_status_idx" ON "SalesImportBatch"("organizationId", "status");

-- CreateIndex
CREATE INDEX "SalesImportBatch_organizationId_importedAt_idx" ON "SalesImportBatch"("organizationId", "importedAt");

-- CreateIndex
CREATE INDEX "SaleRecord_organizationId_saleDate_idx" ON "SaleRecord"("organizationId", "saleDate");

-- CreateIndex
CREATE INDEX "SaleRecord_organizationId_periodoAoMes_idx" ON "SaleRecord"("organizationId", "periodoAoMes");

-- CreateIndex
CREATE INDEX "SaleRecord_organizationId_sellerSlug_saleDate_idx" ON "SaleRecord"("organizationId", "sellerSlug", "saleDate");

-- CreateIndex
CREATE INDEX "SaleRecord_organizationId_storeSlug_saleDate_idx" ON "SaleRecord"("organizationId", "storeSlug", "saleDate");

-- CreateIndex
CREATE INDEX "SaleRecord_organizationId_productLine_saleDate_idx" ON "SaleRecord"("organizationId", "productLine", "saleDate");

-- CreateIndex
CREATE INDEX "SaleRecord_organizationId_channel_saleDate_idx" ON "SaleRecord"("organizationId", "channel", "saleDate");

-- CreateIndex
CREATE INDEX "SaleRecord_organizationId_comprobanteCode_idx" ON "SaleRecord"("organizationId", "comprobanteCode");

-- CreateIndex
CREATE INDEX "SaleRecord_organizationId_customerNit_idx" ON "SaleRecord"("organizationId", "customerNit");

-- CreateIndex
CREATE INDEX "SaleRecord_importBatchId_idx" ON "SaleRecord"("importBatchId");

-- CreateIndex
CREATE UNIQUE INDEX "SaleRecord_organizationId_naturalKey_key" ON "SaleRecord"("organizationId", "naturalKey");

-- AddForeignKey
ALTER TABLE "SalesImportBatch" ADD CONSTRAINT "SalesImportBatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleRecord" ADD CONSTRAINT "SaleRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleRecord" ADD CONSTRAINT "SaleRecord_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "SalesImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
