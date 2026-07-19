-- Migration: 20260405000001_sale_source_inferred_from
--
-- Adds sourceInferredFrom audit column to SaleRecord.
-- Records which signal determined sagSourceType at import:
--   "family"          sagDocumentFamily was authoritative
--   "explicit_column" explicit CSV source column matched
--   "code_pattern"    comprobanteCode heuristic matched
--   "ref_pattern"     comprobante full-ref heuristic matched
--   "filename"        filename hint matched
--   "default"         fallback conservative default
--   "legacy"          imported before source-tracking sprint (FUENTE_1 assumed)
--
-- All pre-existing rows receive the "legacy" default, which is the DB column
-- default and is meaningful: it marks rows whose source assignment was assumed
-- (FUENTE_1 / OFICIAL) rather than explicitly inferred. These rows can later
-- be reviewed or re-imported if the source needs correction.
--
-- Safe to re-run (IF NOT EXISTS guard on ADD COLUMN).

-- Add the audit column with "legacy" as the default
ALTER TABLE "SaleRecord"
  ADD COLUMN IF NOT EXISTS "sourceInferredFrom" TEXT NOT NULL DEFAULT 'legacy';

-- Backfill: rows where sagDocumentFamily is known → update to "family"
UPDATE "SaleRecord"
SET    "sourceInferredFrom" = 'family'
WHERE  "sourceInferredFrom" = 'legacy'
  AND  "sagDocumentFamily"  <> 'OTHER';

-- Backfill: REMISION rows with OTHER family that have a recognizable
-- comprobante code → these were inferred from code_pattern heuristic
UPDATE "SaleRecord"
SET    "sourceInferredFrom" = 'code_pattern'
WHERE  "sourceInferredFrom" = 'legacy'
  AND  "sagSourceType"      = 'REMISION'
  AND  "sagDocumentFamily"  = 'OTHER'
  AND  "comprobanteCode"    ~ '^(NV|REM|RD|GD|NR|NDL|RR|GDE)$';

-- Add audit index (non-blocking on PostgreSQL ≥ 11)
CREATE INDEX IF NOT EXISTS "SaleRecord_orgId_inferredFrom_idx"
  ON "SaleRecord" ("organizationId", "sourceInferredFrom");
