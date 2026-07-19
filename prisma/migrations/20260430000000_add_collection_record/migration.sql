-- Migration: add_collection_record
-- Sprint COBROS REALES — adds CollectionAmountSource enum and CollectionRecord model.
-- CollectionRecord is the monetary layer for cobros pulled from SAG v_pagosnew.
-- SaleRecord remains the documental header layer (no changes to it).

-- CreateEnum: CollectionAmountSource
CREATE TYPE "CollectionAmountSource" AS ENUM (
  'SAG_V_PAGOSNEW',
  'SAG_V_MOVPAGOS',
  'SAG_V_DOCPAGOS',
  'MANUAL'
);

-- CreateTable: CollectionRecord
CREATE TABLE "CollectionRecord" (
    "id"              TEXT NOT NULL,
    "organizationId"  TEXT NOT NULL,
    "erpMovId"        INTEGER,
    "comprobanteCode" TEXT NOT NULL,
    "documentNumber"  TEXT,
    "collectionDate"  TIMESTAMP(3) NOT NULL,
    "customerNit"     TEXT,
    "customerName"    TEXT,
    "amount"          DECIMAL(18,2) NOT NULL,
    "currency"        TEXT NOT NULL DEFAULT 'COP',
    "amountSource"    "CollectionAmountSource" NOT NULL DEFAULT 'SAG_V_PAGOSNEW',
    "appliedFacts"    JSONB,
    "bankReference"   TEXT,
    "naturalKey"      TEXT NOT NULL,
    "rawJson"         JSONB,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollectionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateUniqueIndex
CREATE UNIQUE INDEX "CollectionRecord_organizationId_naturalKey_key"
    ON "CollectionRecord"("organizationId", "naturalKey");

-- CreateIndexes
CREATE INDEX "CollectionRecord_organizationId_comprobanteCode_collectionDate_idx"
    ON "CollectionRecord"("organizationId", "comprobanteCode", "collectionDate");

CREATE INDEX "CollectionRecord_organizationId_collectionDate_idx"
    ON "CollectionRecord"("organizationId", "collectionDate");

CREATE INDEX "CollectionRecord_organizationId_customerNit_idx"
    ON "CollectionRecord"("organizationId", "customerNit");

CREATE INDEX "CollectionRecord_organizationId_erpMovId_idx"
    ON "CollectionRecord"("organizationId", "erpMovId");

-- AddForeignKey
ALTER TABLE "CollectionRecord"
    ADD CONSTRAINT "CollectionRecord_organizationId_fkey"
    FOREIGN KEY ("organizationId")
    REFERENCES "Organization"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
