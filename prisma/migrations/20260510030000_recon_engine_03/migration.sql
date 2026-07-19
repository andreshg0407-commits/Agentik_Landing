-- AGENTIK-RECON-ENGINE-03: Engine Persistence + Performance
-- Additive-only migration. No existing tables or columns are dropped.
--
-- Changes:
--   1. ReconciliationRun   — add metadataJson column (performance metrics + shadow snapshot)
--   2. ReconciliationException — new table (persisted exceptions with resolution lifecycle)

-- ── ReconciliationRun: add metadataJson ───────────────────────────────────────

ALTER TABLE "ReconciliationRun"
    ADD COLUMN "metadataJson" JSONB;

-- ── ReconciliationException ───────────────────────────────────────────────────

CREATE TABLE "ReconciliationException" (
    "id"             TEXT            NOT NULL,
    "organizationId" TEXT            NOT NULL,
    "sessionId"      TEXT            NOT NULL,
    "runId"          TEXT            NOT NULL,
    -- Deterministic key — matches WorkbenchException.recordKey
    "recordKey"      TEXT            NOT NULL,
    -- type: mismatch_amount | only_in_a | only_in_b | duplicate_in_a | duplicate_in_b | probable_match
    "type"           TEXT            NOT NULL,
    -- severity: info | watch | elevated | critical
    "severity"       TEXT            NOT NULL DEFAULT 'info',
    "amountA"        DOUBLE PRECISION,
    "amountB"        DOUBLE PRECISION,
    "delta"          DOUBLE PRECISION,
    "deltaPercent"   DOUBLE PRECISION,
    "rowsA"          INTEGER         NOT NULL DEFAULT 1,
    "rowsB"          INTEGER         NOT NULL DEFAULT 1,
    -- status: open | under_review | resolved | ignored
    "status"         TEXT            NOT NULL DEFAULT 'open',
    "resolution"     TEXT,
    "resolvedBy"     TEXT,
    "resolvedAt"     TIMESTAMP(3),
    -- explanation, reasons[], engine metadata snapshot
    "metadataJson"   JSONB,
    "createdAt"      TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3)    NOT NULL,

    CONSTRAINT "ReconciliationException_pkey" PRIMARY KEY ("id")
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- Session-scoped lookup (exception workbench, session detail view)
CREATE INDEX "ReconciliationException_sessionId_idx"
    ON "ReconciliationException"("sessionId");

-- Run-scoped lookup (run detail, re-run comparison)
CREATE INDEX "ReconciliationException_runId_idx"
    ON "ReconciliationException"("runId");

-- Operator queue: all open exceptions for an org
CREATE INDEX "ReconciliationException_organizationId_status_idx"
    ON "ReconciliationException"("organizationId", "status");

-- Exception type filter (workbench type tabs)
CREATE INDEX "ReconciliationException_organizationId_type_idx"
    ON "ReconciliationException"("organizationId", "type");

-- Severity triage (critical-first ordering)
CREATE INDEX "ReconciliationException_organizationId_severity_idx"
    ON "ReconciliationException"("organizationId", "severity");

-- Deduplication: find if key+type already persisted for this run
CREATE INDEX "ReconciliationException_recordKey_idx"
    ON "ReconciliationException"("recordKey");

-- ── Foreign keys ──────────────────────────────────────────────────────────────

ALTER TABLE "ReconciliationException"
    ADD CONSTRAINT "ReconciliationException_organizationId_fkey"
    FOREIGN KEY ("organizationId")
    REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReconciliationException"
    ADD CONSTRAINT "ReconciliationException_sessionId_fkey"
    FOREIGN KEY ("sessionId")
    REFERENCES "ReconciliationSession"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReconciliationException"
    ADD CONSTRAINT "ReconciliationException_runId_fkey"
    FOREIGN KEY ("runId")
    REFERENCES "ReconciliationRun"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
