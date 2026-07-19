-- Migration: AGENTIK-SECURITY-COMPLIANCE-01
-- Adds ComplianceEvidence, ComplianceFinding, and ComplianceControlStatus models

-- CreateTable ComplianceEvidence
CREATE TABLE "ComplianceEvidence" (
    "id"           TEXT NOT NULL,
    "orgSlug"      TEXT NOT NULL,
    "controlId"    TEXT NOT NULL,
    "source"       TEXT NOT NULL,
    "isSupporting" BOOLEAN NOT NULL DEFAULT true,
    "summary"      TEXT NOT NULL,
    "data"         JSONB NOT NULL DEFAULT '{}',
    "collectedAt"  TIMESTAMP(3) NOT NULL,
    "expiresAt"    TIMESTAMP(3),
    "actorId"      TEXT,
    "framework"    TEXT,

    CONSTRAINT "ComplianceEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable ComplianceFinding
CREATE TABLE "ComplianceFinding" (
    "id"           TEXT NOT NULL,
    "orgSlug"      TEXT NOT NULL,
    "controlId"    TEXT NOT NULL,
    "framework"    TEXT,
    "type"         TEXT NOT NULL,
    "status"       TEXT NOT NULL DEFAULT 'UNKNOWN',
    "severity"     TEXT NOT NULL,
    "title"        TEXT NOT NULL,
    "summary"      TEXT NOT NULL,
    "score"        INTEGER NOT NULL DEFAULT 0,
    "evidenceIds"  JSONB NOT NULL DEFAULT '[]',
    "violations"   JSONB NOT NULL DEFAULT '[]',
    "remediations" JSONB NOT NULL DEFAULT '[]',
    "evaluatedAt"  TIMESTAMP(3) NOT NULL,
    "validUntil"   TIMESTAMP(3),

    CONSTRAINT "ComplianceFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable ComplianceControlStatus
CREATE TABLE "ComplianceControlStatus" (
    "id"          TEXT NOT NULL,
    "orgSlug"     TEXT NOT NULL,
    "controlId"   TEXT NOT NULL,
    "framework"   TEXT,
    "status"      TEXT NOT NULL,
    "score"       INTEGER NOT NULL DEFAULT 0,
    "evaluatedAt" TIMESTAMP(3) NOT NULL,
    "validUntil"  TIMESTAMP(3),

    CONSTRAINT "ComplianceControlStatus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex ComplianceEvidence
CREATE INDEX "ComplianceEvidence_orgSlug_idx" ON "ComplianceEvidence"("orgSlug");
CREATE INDEX "ComplianceEvidence_orgSlug_controlId_idx" ON "ComplianceEvidence"("orgSlug", "controlId");
CREATE INDEX "ComplianceEvidence_orgSlug_source_idx" ON "ComplianceEvidence"("orgSlug", "source");
CREATE INDEX "ComplianceEvidence_orgSlug_isSupporting_idx" ON "ComplianceEvidence"("orgSlug", "isSupporting");
CREATE INDEX "ComplianceEvidence_orgSlug_collectedAt_idx" ON "ComplianceEvidence"("orgSlug", "collectedAt");
CREATE INDEX "ComplianceEvidence_controlId_idx" ON "ComplianceEvidence"("controlId");

-- CreateIndex ComplianceFinding
CREATE INDEX "ComplianceFinding_orgSlug_idx" ON "ComplianceFinding"("orgSlug");
CREATE INDEX "ComplianceFinding_orgSlug_status_idx" ON "ComplianceFinding"("orgSlug", "status");
CREATE INDEX "ComplianceFinding_orgSlug_controlId_idx" ON "ComplianceFinding"("orgSlug", "controlId");
CREATE INDEX "ComplianceFinding_orgSlug_framework_idx" ON "ComplianceFinding"("orgSlug", "framework");
CREATE INDEX "ComplianceFinding_orgSlug_severity_idx" ON "ComplianceFinding"("orgSlug", "severity");
CREATE INDEX "ComplianceFinding_orgSlug_evaluatedAt_idx" ON "ComplianceFinding"("orgSlug", "evaluatedAt");
CREATE INDEX "ComplianceFinding_orgSlug_status_severity_idx" ON "ComplianceFinding"("orgSlug", "status", "severity");

-- CreateIndex ComplianceControlStatus
CREATE INDEX "ComplianceControlStatus_orgSlug_idx" ON "ComplianceControlStatus"("orgSlug");
CREATE INDEX "ComplianceControlStatus_orgSlug_controlId_idx" ON "ComplianceControlStatus"("orgSlug", "controlId");
CREATE INDEX "ComplianceControlStatus_orgSlug_status_idx" ON "ComplianceControlStatus"("orgSlug", "status");
CREATE INDEX "ComplianceControlStatus_orgSlug_evaluatedAt_idx" ON "ComplianceControlStatus"("orgSlug", "evaluatedAt");
