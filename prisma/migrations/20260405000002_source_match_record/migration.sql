-- Migration: 20260405000002_source_match_record
--
-- Creates the SourceMatchRecord table — the persisted output of the F2↔F1
-- dedup engine. This is the single authoritative source for:
--   - Conversion rate (matched F2 / total F2)
--   - Real orphan remisiones (isOrphan = true)
--   - Orphan risk levels per seller / store / customer
--
-- All three previous ad-hoc calculations (conversion-tracking.ts min-heuristic,
-- remision-monitor.ts full-F2-scan, source-dedup.ts in-memory) will read from
-- this table instead of re-computing on every request.

CREATE TABLE IF NOT EXISTS "SourceMatchRecord" (
  "id"             TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
  "organizationId" TEXT         NOT NULL,

  -- F2 SaleRecord this row describes (unique: one match per F2 record)
  "f2RecordId"     TEXT         NOT NULL,
  -- Matching F1 SaleRecord. NULL when isOrphan = true.
  "f1RecordId"     TEXT,

  -- Period of the F2 record (YYYYMM)
  "periodoAoMes"   TEXT         NOT NULL,

  -- Match result
  "isOrphan"       BOOLEAN      NOT NULL DEFAULT TRUE,
  "matchSignal"    TEXT,                          -- "origin_doc_ref" | "comprobante_number" | "customer_amount_date" | "seller_store_amount"
  "confidence"     INTEGER,                       -- 0–100
  "conversionDays" INTEGER,                       -- days between F2 and F1 saleDate
  "amountDeltaPct" DOUBLE PRECISION,              -- (f1 - f2) / f2 * 100

  -- Orphan risk (meaningful only when isOrphan = true)
  "orphanRisk"     TEXT,                          -- "NONE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
  "orphanDays"     INTEGER,                       -- days pending at generation time

  -- Denormalized for fast querying
  "customerNit"    TEXT,
  "sellerSlug"     TEXT         NOT NULL DEFAULT '',
  "storeSlug"      TEXT         NOT NULL DEFAULT '',
  "f2Amount"       DOUBLE PRECISION NOT NULL DEFAULT 0,
  "f2Date"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  "generatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SourceMatchRecord_pkey" PRIMARY KEY ("id")
);

-- Unique: one row per F2 record per org (enables safe upsert)
CREATE UNIQUE INDEX IF NOT EXISTS "SourceMatchRecord_organizationId_f2RecordId_key"
  ON "SourceMatchRecord"("organizationId", "f2RecordId");

-- Fast period queries
CREATE INDEX IF NOT EXISTS "SourceMatchRecord_org_period_idx"
  ON "SourceMatchRecord"("organizationId", "periodoAoMes");

-- Orphan queries (alert engine, remision-monitor, cobranza actions)
CREATE INDEX IF NOT EXISTS "SourceMatchRecord_org_orphan_risk_idx"
  ON "SourceMatchRecord"("organizationId", "isOrphan", "orphanRisk");

-- Seller-level conversion queries
CREATE INDEX IF NOT EXISTS "SourceMatchRecord_org_seller_period_idx"
  ON "SourceMatchRecord"("organizationId", "sellerSlug", "periodoAoMes");

-- Customer-level orphan queries (for Customer 360)
CREATE INDEX IF NOT EXISTS "SourceMatchRecord_org_nit_period_idx"
  ON "SourceMatchRecord"("organizationId", "customerNit", "periodoAoMes");

-- Combined filter used by source-alerts and action engine
CREATE INDEX IF NOT EXISTS "SourceMatchRecord_org_orphan_period_idx"
  ON "SourceMatchRecord"("organizationId", "isOrphan", "periodoAoMes");
