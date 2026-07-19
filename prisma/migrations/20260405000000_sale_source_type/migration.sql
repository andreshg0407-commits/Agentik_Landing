-- Migration: 20260405000000_sale_source_type
-- Sprint: SAG Source-Aware Layer
--
-- NON-DESTRUCTIVE: all changes are additive (new columns with defaults,
-- new enum types, new indexes). No existing data is removed.
--
-- Execution order:
--   1. Create new enum types
--   2. Add columns to SaleRecord with safe defaults
--   3. Backfill from sagDocumentFamily (primary signal)
--   4. Heuristic backfill for OTHER records (comprobante prefix patterns)
--   5. Create new indexes
--
-- Safe to run multiple times — uses IF NOT EXISTS / idempotent UPDATE.

-- ── 1. Enum types ─────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "SagSourceType" AS ENUM ('OFICIAL', 'REMISION');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SourceDocumentStage" AS ENUM ('FACTURADO', 'REMITIDO', 'DESPACHADO', 'PENDIENTE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 2. Add columns ────────────────────────────────────────────────────────────

ALTER TABLE "SaleRecord"
  ADD COLUMN IF NOT EXISTS "sagSourceType"       "SagSourceType"       NOT NULL DEFAULT 'OFICIAL',
  ADD COLUMN IF NOT EXISTS "sourceDocumentStage" "SourceDocumentStage" NOT NULL DEFAULT 'FACTURADO';

-- ── 3. Backfill from sagDocumentFamily ───────────────────────────────────────
--
--   DISPATCH_REMISION → REMISION / REMITIDO
--   OFFICIAL_INVOICE  → OFICIAL  / FACTURADO (already default)
--   CREDIT_NOTE       → OFICIAL  / FACTURADO (already default)
--   DEBIT_NOTE        → OFICIAL  / FACTURADO (already default)
--   OTHER             → handled in step 4 below

UPDATE "SaleRecord"
SET
  "sagSourceType"       = 'REMISION',
  "sourceDocumentStage" = 'REMITIDO'
WHERE "sagDocumentFamily" = 'DISPATCH_REMISION'
  AND "sagSourceType" = 'OFICIAL';   -- only touch rows not yet backfilled

-- ── 4. Heuristic backfill for OTHER records ───────────────────────────────────
--
-- When sagDocumentFamily = OTHER (documentFamilyMap not configured), infer
-- source type from comprobante code / reference patterns.
--
-- Prefix patterns observed in Colombian SAG exports that indicate remision:
--   comprobanteCode starts with: R, REM, NR, NV, RD, RE, GD, RRD
--   comprobante     starts with: R-, REM-, NV-, GD-
--
-- Conservative: we only mark REMISION when there is strong evidence.
-- Everything else stays OFICIAL (safe default for fiscal compliance).

UPDATE "SaleRecord"
SET
  "sagSourceType"       = 'REMISION',
  "sourceDocumentStage" = 'REMITIDO'
WHERE "sagDocumentFamily" = 'OTHER'
  AND "sagSourceType"    = 'OFICIAL'   -- idempotent guard
  AND (
    -- comprobanteCode pattern
    "comprobanteCode" IS NOT NULL AND (
      UPPER("comprobanteCode") ~ '^(REM|RD|GD|NR)' OR
      (UPPER("comprobanteCode") ~ '^R[A-Z]?' AND UPPER("comprobanteCode") !~ '^RE[SC]')
    )
    OR
    -- comprobante (full reference) pattern
    "comprobante" IS NOT NULL AND (
      UPPER("comprobante") ~ '^(REM-|NV-|GD-|RD-)' OR
      UPPER("comprobante") ~ '^R[0-9]'
    )
  );

-- ── 5. Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS "SaleRecord_orgId_sourceType_date_idx"
  ON "SaleRecord" ("organizationId", "sagSourceType", "saleDate");

CREATE INDEX IF NOT EXISTS "SaleRecord_orgId_sourceType_seller_idx"
  ON "SaleRecord" ("organizationId", "sagSourceType", "sellerSlug", "saleDate");

CREATE INDEX IF NOT EXISTS "SaleRecord_orgId_sourceType_store_idx"
  ON "SaleRecord" ("organizationId", "sagSourceType", "storeSlug", "saleDate");

CREATE INDEX IF NOT EXISTS "SaleRecord_orgId_sourceType_stage_date_idx"
  ON "SaleRecord" ("organizationId", "sagSourceType", "sourceDocumentStage", "saleDate");
