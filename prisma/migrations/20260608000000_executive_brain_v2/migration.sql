-- AGENTIK-EXECUTIVE-BRAIN-02
-- Migration: Executive Brain V2 Models

CREATE TABLE "ExecutiveBriefingRecord" (
    "id"             TEXT NOT NULL,
    "orgSlug"        TEXT NOT NULL,
    "type"           TEXT NOT NULL,
    "title"          TEXT NOT NULL,
    "summary"        TEXT NOT NULL,
    "executiveScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidence"     TEXT NOT NULL DEFAULT 'LOW',
    "metadata"       JSONB NOT NULL DEFAULT '{}',
    "generatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExecutiveBriefingRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExecutiveDigestRecord" (
    "id"             TEXT NOT NULL,
    "orgSlug"        TEXT NOT NULL,
    "period"         TEXT NOT NULL,
    "title"          TEXT NOT NULL,
    "headline"       TEXT NOT NULL,
    "executiveScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidence"     TEXT NOT NULL DEFAULT 'LOW',
    "metadata"       JSONB NOT NULL DEFAULT '{}',
    "generatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExecutiveDigestRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExecutivePriorityRecord" (
    "id"                      TEXT NOT NULL,
    "orgSlug"                 TEXT NOT NULL,
    "rank"                    INTEGER NOT NULL,
    "title"                   TEXT NOT NULL,
    "description"             TEXT NOT NULL,
    "domain"                  TEXT NOT NULL,
    "level"                   TEXT NOT NULL,
    "confidence"              TEXT NOT NULL,
    "confidenceScore"         DOUBLE PRECISION NOT NULL DEFAULT 0,
    "impactScore"             DOUBLE PRECISION NOT NULL DEFAULT 0,
    "urgencyScore"            DOUBLE PRECISION NOT NULL DEFAULT 0,
    "strategicAlignmentScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "historicalRiskScore"     DOUBLE PRECISION NOT NULL DEFAULT 0,
    "priorityScore"           DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rationale"               TEXT NOT NULL,
    "evidenceIds"             TEXT[],
    "metadata"                JSONB NOT NULL DEFAULT '{}',
    "computedAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExecutivePriorityRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExecutiveFocusAreaRecord" (
    "id"             TEXT NOT NULL,
    "orgSlug"        TEXT NOT NULL,
    "rank"           INTEGER NOT NULL,
    "title"          TEXT NOT NULL,
    "rationale"      TEXT NOT NULL,
    "domain"         TEXT NOT NULL,
    "priority"       TEXT NOT NULL,
    "confidence"     TEXT NOT NULL,
    "urgencyScore"   DOUBLE PRECISION NOT NULL DEFAULT 0,
    "impactScore"    DOUBLE PRECISION NOT NULL DEFAULT 0,
    "compositeScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "evidenceIds"    TEXT[],
    "metadata"       JSONB NOT NULL DEFAULT '{}',
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExecutiveFocusAreaRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExecutiveConflictRecord" (
    "id"            TEXT NOT NULL,
    "orgSlug"       TEXT NOT NULL,
    "type"          TEXT NOT NULL,
    "title"         TEXT NOT NULL,
    "description"   TEXT NOT NULL,
    "domain"        TEXT NOT NULL,
    "severity"      TEXT NOT NULL,
    "confidence"    TEXT NOT NULL,
    "elementAId"    TEXT NOT NULL,
    "elementATitle" TEXT NOT NULL,
    "elementBId"    TEXT NOT NULL,
    "elementBTitle" TEXT NOT NULL,
    "rationale"     TEXT NOT NULL,
    "metadata"      JSONB NOT NULL DEFAULT '{}',
    "resolved"      BOOLEAN NOT NULL DEFAULT false,
    "detectedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExecutiveConflictRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExecutiveSnapshotRecord" (
    "id"             TEXT NOT NULL,
    "orgSlug"        TEXT NOT NULL,
    "executiveScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "priorityCount"  INTEGER NOT NULL DEFAULT 0,
    "riskCount"      INTEGER NOT NULL DEFAULT 0,
    "conflictCount"  INTEGER NOT NULL DEFAULT 0,
    "metadata"       JSONB NOT NULL DEFAULT '{}',
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExecutiveSnapshotRecord_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "ExecutiveBriefingRecord_orgSlug_idx" ON "ExecutiveBriefingRecord"("orgSlug");
CREATE INDEX "ExecutiveBriefingRecord_orgSlug_type_idx" ON "ExecutiveBriefingRecord"("orgSlug", "type");
CREATE INDEX "ExecutiveBriefingRecord_orgSlug_generatedAt_idx" ON "ExecutiveBriefingRecord"("orgSlug", "generatedAt");

CREATE INDEX "ExecutiveDigestRecord_orgSlug_idx" ON "ExecutiveDigestRecord"("orgSlug");
CREATE INDEX "ExecutiveDigestRecord_orgSlug_period_idx" ON "ExecutiveDigestRecord"("orgSlug", "period");
CREATE INDEX "ExecutiveDigestRecord_orgSlug_generatedAt_idx" ON "ExecutiveDigestRecord"("orgSlug", "generatedAt");

CREATE INDEX "ExecutivePriorityRecord_orgSlug_idx" ON "ExecutivePriorityRecord"("orgSlug");
CREATE INDEX "ExecutivePriorityRecord_orgSlug_level_idx" ON "ExecutivePriorityRecord"("orgSlug", "level");
CREATE INDEX "ExecutivePriorityRecord_orgSlug_domain_idx" ON "ExecutivePriorityRecord"("orgSlug", "domain");
CREATE INDEX "ExecutivePriorityRecord_orgSlug_priorityScore_idx" ON "ExecutivePriorityRecord"("orgSlug", "priorityScore");

CREATE INDEX "ExecutiveFocusAreaRecord_orgSlug_idx" ON "ExecutiveFocusAreaRecord"("orgSlug");
CREATE INDEX "ExecutiveFocusAreaRecord_orgSlug_compositeScore_idx" ON "ExecutiveFocusAreaRecord"("orgSlug", "compositeScore");

CREATE INDEX "ExecutiveConflictRecord_orgSlug_idx" ON "ExecutiveConflictRecord"("orgSlug");
CREATE INDEX "ExecutiveConflictRecord_orgSlug_resolved_idx" ON "ExecutiveConflictRecord"("orgSlug", "resolved");
CREATE INDEX "ExecutiveConflictRecord_orgSlug_severity_idx" ON "ExecutiveConflictRecord"("orgSlug", "severity");

CREATE INDEX "ExecutiveSnapshotRecord_orgSlug_idx" ON "ExecutiveSnapshotRecord"("orgSlug");
CREATE INDEX "ExecutiveSnapshotRecord_orgSlug_createdAt_idx" ON "ExecutiveSnapshotRecord"("orgSlug", "createdAt");
