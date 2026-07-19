-- Sprint S3 Phase 1: CollectionAllocation table
-- Audit trail for SAG cobro → CustomerReceivable applications.
-- Additive-only migration. No existing tables or columns are modified.

CREATE TABLE "CollectionAllocation" (
    "id"                 TEXT NOT NULL,
    "organizationId"     TEXT NOT NULL,
    "collectionRecordId" TEXT NOT NULL,
    "receivableId"       TEXT NOT NULL,
    "amountApplied"      DECIMAL(18,2) NOT NULL,
    "balanceBefore"      DECIMAL(18,2) NOT NULL,
    "balanceAfter"       DECIMAL(18,2) NOT NULL,
    "paidBefore"         DECIMAL(18,2) NOT NULL,
    "paidAfter"          DECIMAL(18,2) NOT NULL,
    "statusBefore"       TEXT NOT NULL,
    "statusAfter"        TEXT NOT NULL,
    "ruleUsed"           TEXT NOT NULL,
    "confidence"         TEXT NOT NULL,
    "appliedBy"          TEXT NOT NULL DEFAULT 'AUTO',
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionAllocation_pkey" PRIMARY KEY ("id")
);

-- Dedup constraint: each (cobro, invoice) pair applied exactly once
CREATE UNIQUE INDEX "CollectionAllocation_collectionRecordId_receivableId_key"
    ON "CollectionAllocation"("collectionRecordId", "receivableId");

-- Query indices
CREATE INDEX "CollectionAllocation_organizationId_idx"
    ON "CollectionAllocation"("organizationId");

CREATE INDEX "CollectionAllocation_receivableId_idx"
    ON "CollectionAllocation"("receivableId");

CREATE INDEX "CollectionAllocation_collectionRecordId_idx"
    ON "CollectionAllocation"("collectionRecordId");

CREATE INDEX "CollectionAllocation_organizationId_createdAt_idx"
    ON "CollectionAllocation"("organizationId", "createdAt");

-- Foreign keys
ALTER TABLE "CollectionAllocation"
    ADD CONSTRAINT "CollectionAllocation_organizationId_fkey"
    FOREIGN KEY ("organizationId")
    REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CollectionAllocation"
    ADD CONSTRAINT "CollectionAllocation_collectionRecordId_fkey"
    FOREIGN KEY ("collectionRecordId")
    REFERENCES "CollectionRecord"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CollectionAllocation"
    ADD CONSTRAINT "CollectionAllocation_receivableId_fkey"
    FOREIGN KEY ("receivableId")
    REFERENCES "CustomerReceivable"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Add appliedStatus index to CollectionRecord for efficient AVAILABLE queries
CREATE INDEX "CollectionRecord_organizationId_appliedStatus_idx"
    ON "CollectionRecord"("organizationId", "appliedStatus");
