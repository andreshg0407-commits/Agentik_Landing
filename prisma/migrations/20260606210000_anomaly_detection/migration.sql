-- Migration: AGENTIK-SECURITY-ANOMALY-DETECTION-01
-- Adds AnomalyAlert and AnomalySignal tables for the Security Anomaly Detection layer.
--
-- Design:
--   - orgSlug-scoped (no FK to organizations — consistent with security layer boundary).
--   - AnomalySignal.alertId → AnomalyAlert (nullable, SET NULL on delete).
--   - All metadata columns are JSONB to allow flexible context without raw secrets.
--   - Indexes: orgSlug, type, severity, status, occurredAt, createdAt, riskScore.

-- ── AnomalyAlert ──────────────────────────────────────────────────────────────

CREATE TABLE "AnomalyAlert" (
    "id"             TEXT NOT NULL,
    "orgSlug"        TEXT NOT NULL,
    "type"           TEXT NOT NULL,
    "severity"       TEXT NOT NULL,
    "status"         TEXT NOT NULL DEFAULT 'OPEN',
    "title"          TEXT NOT NULL,
    "description"    TEXT NOT NULL,
    "riskScore"      INTEGER NOT NULL DEFAULT 0,
    "isCorrelated"   BOOLEAN NOT NULL DEFAULT false,
    "sourceRule"     TEXT,
    "metadata"       JSONB NOT NULL DEFAULT '{}',
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    "resolvedAt"     TIMESTAMP(3),
    "acknowledgedBy" TEXT,
    "resolvedBy"     TEXT,

    CONSTRAINT "AnomalyAlert_pkey" PRIMARY KEY ("id")
);

-- Indexes for AnomalyAlert
CREATE INDEX "AnomalyAlert_orgSlug_idx"                ON "AnomalyAlert"("orgSlug");
CREATE INDEX "AnomalyAlert_orgSlug_status_idx"         ON "AnomalyAlert"("orgSlug", "status");
CREATE INDEX "AnomalyAlert_orgSlug_severity_idx"       ON "AnomalyAlert"("orgSlug", "severity");
CREATE INDEX "AnomalyAlert_orgSlug_type_idx"           ON "AnomalyAlert"("orgSlug", "type");
CREATE INDEX "AnomalyAlert_orgSlug_status_severity_idx" ON "AnomalyAlert"("orgSlug", "status", "severity");
CREATE INDEX "AnomalyAlert_orgSlug_createdAt_idx"      ON "AnomalyAlert"("orgSlug", "createdAt");
CREATE INDEX "AnomalyAlert_orgSlug_riskScore_idx"      ON "AnomalyAlert"("orgSlug", "riskScore");

-- ── AnomalySignal ─────────────────────────────────────────────────────────────

CREATE TABLE "AnomalySignal" (
    "id"          TEXT NOT NULL,
    "orgSlug"     TEXT NOT NULL,
    "type"        TEXT NOT NULL,
    "severity"    TEXT NOT NULL,
    "weight"      INTEGER NOT NULL DEFAULT 0,
    "reason"      TEXT NOT NULL,
    "detectorId"  TEXT NOT NULL,
    "metadata"    JSONB NOT NULL DEFAULT '{}',
    "occurredAt"  TIMESTAMP(3) NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd"   TIMESTAMP(3) NOT NULL,
    "userId"      TEXT,
    "agentId"     TEXT,
    "sessionId"   TEXT,
    "resource"    TEXT,
    "alertId"     TEXT,

    CONSTRAINT "AnomalySignal_pkey" PRIMARY KEY ("id")
);

-- Indexes for AnomalySignal
CREATE INDEX "AnomalySignal_orgSlug_idx"            ON "AnomalySignal"("orgSlug");
CREATE INDEX "AnomalySignal_orgSlug_type_idx"       ON "AnomalySignal"("orgSlug", "type");
CREATE INDEX "AnomalySignal_orgSlug_severity_idx"   ON "AnomalySignal"("orgSlug", "severity");
CREATE INDEX "AnomalySignal_orgSlug_occurredAt_idx" ON "AnomalySignal"("orgSlug", "occurredAt");
CREATE INDEX "AnomalySignal_orgSlug_detectorId_idx" ON "AnomalySignal"("orgSlug", "detectorId");
CREATE INDEX "AnomalySignal_orgSlug_userId_idx"     ON "AnomalySignal"("orgSlug", "userId");
CREATE INDEX "AnomalySignal_orgSlug_agentId_idx"    ON "AnomalySignal"("orgSlug", "agentId");
CREATE INDEX "AnomalySignal_alertId_idx"            ON "AnomalySignal"("alertId");

-- FK: AnomalySignal.alertId → AnomalyAlert (SET NULL on delete)
ALTER TABLE "AnomalySignal"
    ADD CONSTRAINT "AnomalySignal_alertId_fkey"
    FOREIGN KEY ("alertId")
    REFERENCES "AnomalyAlert"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
