-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260504999999_create_payment_record
--
-- PURPOSE: Backfill migration — creates PaymentRecord + PaymentAllocation tables
--          and their required enums.
--
-- WHY THIS EXISTS:
--   These models were added to schema.prisma and deployed to the real database
--   via `prisma db push`, without a corresponding migration file.
--   The subsequent migration (20260505000000_payment_document_type) does:
--     ALTER TABLE "PaymentRecord" ADD COLUMN "documentType" ...
--   which fails on the Prisma shadow database (used by migrate dev/deploy to
--   verify migration history) because no prior migration created the table.
--
-- IDEMPOTENCY:
--   Uses IF NOT EXISTS guards so that running against a database that already
--   has these tables (the real Neon DB) is a safe no-op.
--
-- DOES NOT INCLUDE:
--   - "documentType" column (created by next migration: payment_document_type)
--   - "PaymentDocumentType" enum (created by next migration)
--
-- MUST RUN AFTER:
--   20260331224808_customer360_pipeline_intelligence
--   (which creates CustomerProfile and CustomerReceivable)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Enums ────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "PaymentMethod" AS ENUM (
    'TRANSFERENCIA',
    'CONSIGNACION',
    'CHEQUE',
    'EFECTIVO',
    'PSE',
    'TARJETA_CREDITO',
    'TARJETA_DEBITO',
    'OTRO'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PaymentStatus" AS ENUM (
    'DRAFT',
    'PENDING',
    'RECONCILED',
    'PARTIALLY_RECONCILED',
    'REVERSED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PaymentSource" AS ENUM (
    'FORM',
    'EXCEL_IMPORT',
    'BANK_FEED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── PaymentRecord ─────────────────────────────────────────────────────────────
-- NOTE: does NOT include "documentType" — that column is added by the next
--       migration (20260505000000_payment_document_type).

CREATE TABLE IF NOT EXISTS "PaymentRecord" (
    "id"                  TEXT          NOT NULL,
    "organizationId"      TEXT          NOT NULL,
    "customerId"          TEXT,
    "customerNit"         TEXT,
    "customerName"        TEXT          NOT NULL,
    "amount"              DECIMAL(18,2) NOT NULL,
    "currency"            TEXT          NOT NULL DEFAULT 'COP',
    "allocatedAmount"     DECIMAL(18,2) NOT NULL DEFAULT 0,
    "unallocatedAmount"   DECIMAL(18,2) NOT NULL DEFAULT 0,
    "paymentDate"         TIMESTAMP(3)  NOT NULL,
    "bankName"            TEXT,
    "bankAccount"         TEXT,
    "paymentMethod"       "PaymentMethod"  NOT NULL DEFAULT 'TRANSFERENCIA',
    "reference"           TEXT,
    "externalRef"         TEXT,
    "attachmentUrl"       TEXT,
    "attachmentName"      TEXT,
    "notes"               TEXT,
    "status"              "PaymentStatus"  NOT NULL DEFAULT 'DRAFT',
    "reconciledAt"        TIMESTAMP(3),
    "reversedAt"          TIMESTAMP(3),
    "reversalReason"      TEXT,
    "source"              "PaymentSource"  NOT NULL DEFAULT 'FORM',
    "createdBy"           TEXT          NOT NULL,
    "createdAt"           TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3)  NOT NULL,

    CONSTRAINT "PaymentRecord_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX IF NOT EXISTS "PaymentRecord_organizationId_status_idx"
    ON "PaymentRecord"("organizationId", "status");

CREATE INDEX IF NOT EXISTS "PaymentRecord_organizationId_paymentDate_idx"
    ON "PaymentRecord"("organizationId", "paymentDate");

CREATE INDEX IF NOT EXISTS "PaymentRecord_organizationId_customerNit_idx"
    ON "PaymentRecord"("organizationId", "customerNit");

CREATE INDEX IF NOT EXISTS "PaymentRecord_organizationId_customerId_idx"
    ON "PaymentRecord"("organizationId", "customerId");

CREATE INDEX IF NOT EXISTS "PaymentRecord_organizationId_createdAt_idx"
    ON "PaymentRecord"("organizationId", "createdAt");

-- FKs
ALTER TABLE "PaymentRecord"
    ADD CONSTRAINT "PaymentRecord_organizationId_fkey"
    FOREIGN KEY ("organizationId")
    REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PaymentRecord"
    ADD CONSTRAINT "PaymentRecord_customerId_fkey"
    FOREIGN KEY ("customerId")
    REFERENCES "CustomerProfile"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ── PaymentAllocation ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "PaymentAllocation" (
    "id"               TEXT          NOT NULL,
    "organizationId"   TEXT          NOT NULL,
    "paymentId"        TEXT          NOT NULL,
    "receivableId"     TEXT          NOT NULL,
    "allocatedAmount"  DECIMAL(18,2) NOT NULL,
    "balanceBefore"    DECIMAL(18,2) NOT NULL,
    "balanceAfter"     DECIMAL(18,2) NOT NULL,
    "receivableStatus" TEXT          NOT NULL,
    "createdAt"        TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX IF NOT EXISTS "PaymentAllocation_paymentId_idx"
    ON "PaymentAllocation"("paymentId");

CREATE INDEX IF NOT EXISTS "PaymentAllocation_receivableId_idx"
    ON "PaymentAllocation"("receivableId");

CREATE INDEX IF NOT EXISTS "PaymentAllocation_organizationId_idx"
    ON "PaymentAllocation"("organizationId");

-- FKs
ALTER TABLE "PaymentAllocation"
    ADD CONSTRAINT "PaymentAllocation_paymentId_fkey"
    FOREIGN KEY ("paymentId")
    REFERENCES "PaymentRecord"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PaymentAllocation"
    ADD CONSTRAINT "PaymentAllocation_receivableId_fkey"
    FOREIGN KEY ("receivableId")
    REFERENCES "CustomerReceivable"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
